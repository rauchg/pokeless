const fs = require("fs");
const crypto = require("crypto");
const GameBoy = require("../lib/gameboy");
const { createCanvas } = require("@napi-rs/canvas");
const rom = fs.readFileSync(__dirname + "/../lib/yellow.gb");
const Redis = require("ioredis");
const Mutex = require("redis-semaphore").Mutex;
const { waitUntil } = require("@vercel/functions");

// how many frames to emulate each invocation
const FRAMES = 50;
const EMULATION_SESSION_TIME = 5000; // 5 seconds
const MUTEX_TIMEOUT = 10000; // 10 seconds - longer than session time to ensure clean handoff
const MAX_RESPONSE_TIME = 55000; // 55 seconds

const r = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

// Global flag to ensure only one game loop runs
let gameLoopStarted = false;

// In-memory caches
let latestFrame = null;
let latestFrameHash = null;
let hotEmulator = null;
let hotEmulatorStateId = null;
let hotCanvas = null;

export async function GET(req) {
  console.log("GET /api/run starting");

  // Set up streaming response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Start response with multipart header
  const response = new Response(stream.readable, {
    headers: {
      "Content-Type": "multipart/x-mixed-replace;boundary=frame",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  // Try to become the game runner if no one else has
  if (!gameLoopStarted) {
    gameLoopStarted = true;
    waitUntil(runGameLoop());
  }

  // Function to send a frame
  async function sendFrame(frame, frameHash) {
    if (!frame) return;
    console.log("sending frame", frame.length, "bytes", frameHash);
    const multipartFrame = Buffer.concat([
      Buffer.from("--frame\r\n"),
      Buffer.from("Content-Type: image/png\r\n"),
      Buffer.from("Content-Length: " + frame.length + "\r\n\r\n"),
      frame,
      Buffer.from("\r\n"),
    ]);
    await writer.write(multipartFrame);
  }

  // Set up cleanup function
  const cleanup = () => {
    console.log("cleaning up stream");
    sub.unsubscribe("frame").catch(console.error);
    writer.close().catch(console.error);
  };

  // Set up timeout
  const timeoutId = setTimeout(cleanup, MAX_RESPONSE_TIME);

  try {
    console.log("fetching initial frame");
    // Try to use cached frame first
    let initialFrame = latestFrame;
    let initialHash = latestFrameHash;
    
    if (!initialFrame || !initialHash) {
      initialFrame = await r.getBuffer("latest_image");
      initialHash = await r.get("latest_image_hash");
    }

    if (initialFrame && initialHash) {
      console.log("sending initial frame", initialFrame === latestFrame ? "(from cache)" : "(from redis)");
      waitUntil(sendFrame(initialFrame, initialHash));
    }

    console.log("setting up subscription");
    sub.on("message", async (channel, message) => {
      try {
        const { hash: frameHash, keyInfo } = JSON.parse(message);
        
        // If hash matches our cached version, use the cached frame
        if (frameHash === latestFrameHash && latestFrame) {
          console.log("using cached frame");
          await sendFrame(latestFrame, frameHash, keyInfo);
        } else {
          // Otherwise fetch from Redis
          const frame = await r.getBuffer("latest_image");
          if (frame) {
            await sendFrame(frame, frameHash, keyInfo);
          }
        }
      } catch (err) {
        console.error("Error in message handler:", err);
        cleanup();
      }
    });

    sub.on("error", (err) => {
      console.error("Redis error:", err);
      cleanup();
    });

    await sub.subscribe("frame");
    console.log("subscription active");
  } catch (err) {
    console.error("Stream setup error:", err);
    cleanup();
  }

  console.log("returning response");
  return response;
}

// Continuously try to run the game loop
async function runGameLoop() {
  const mutex = new Mutex(r, "run", { lockTimeout: MUTEX_TIMEOUT });

  while (true) {
    try {
      const acquired = await mutex.tryAcquire();
      if (acquired) {
        console.log(
          "acquired lock, running game loop for",
          EMULATION_SESSION_TIME,
          "ms",
        );
        const sessionEndTime = Date.now() + EMULATION_SESSION_TIME;

        try {
          // First run initializes the session
          await run(true);

          // Then run continuously until session time is up
          while (Date.now() < sessionEndTime) {
            await run(false);
            // Small delay between runs
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (err) {
          console.error("error running game loop:", err.stack);
        } finally {
          await mutex.release();
          // After a full session, wait a bit before trying to acquire again
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } else {
        // If we couldn't acquire the lock, wait longer since sessions are 5s
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error("error in game loop:", err.stack);
      // Wait a bit longer on error before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function run(isFirstRunInSession = false) {
  console.log("running", isFirstRunInSession ? "(session start)" : "");

  try {
    let gb;
    let canvas;
    let key = null;

    if (isFirstRunInSession) {
      // Only check Redis state at the start of a session
      const [lastKeyStr, stateId] = await r.mget(["last_key", "state_id"]);

      if (lastKeyStr) {
        key = Number(lastKeyStr);
        console.log("using key press:", key);
        // Clear the last key so it's not used again
        await r.del("last_key");
      }

      // Initialize emulator if needed
      if (!hotEmulator || hotEmulatorStateId !== stateId) {
        console.log("initializing new emulator, state_id:", stateId);
        console.time("gb init");
        canvas = createCanvas(160 * 2, 144 * 2);
        gb = new GameBoy(canvas, rom);
        console.timeEnd("gb init");

        console.time("read state");
        const state = await r.get("latest_state");
        console.timeEnd("read state");

        if (state) {
          console.time("init state");
          gb.returnFromState(JSON.parse(state));
          console.timeEnd("init state");
        } else {
          console.time("gb start");
          gb.start();
          console.timeEnd("gb start");
        }

        // Update hot emulator cache
        hotEmulator = gb;
        hotCanvas = canvas;
        hotEmulatorStateId = stateId;
      } else {
        console.log("reusing hot emulator with state_id:", stateId);
      }
    } else {
      // During session, just check for new key press
      const lastKeyStr = await r.getset("last_key", "-1");
      if (lastKeyStr && lastKeyStr !== "-1") {
        key = Number(lastKeyStr);
        console.log("using key press during session:", key);
      }
    }

    // Use hot emulator
    gb = hotEmulator;
    canvas = hotCanvas;
    gb.stopEmulator = 1;

    if (key != null) {
      console.log("executing key", key);
      gb.JoyPadEvent(key, true);
    }

    console.time("emulate");
    for (let i = 0; i < FRAMES; i++) {
      if (key != null) {
        if (i === Math.round(FRAMES / 2)) {
          gb.JoyPadEvent(key, false);
        }
      }
      gb.run();
    }
    console.timeEnd("emulate");

    console.time("render");
    const buf = canvas.toBuffer("image/png");
    console.log("frame size:", buf.length, "bytes");
    console.timeEnd("render");

    // Calculate frame hash
    console.time("hash");
    const frameHash = crypto.createHash("sha1").update(buf).digest("hex");
    console.timeEnd("hash");

    // Get the latest stored hash
    const storedHash = await r.get("latest_image_hash");

    // Only update Redis if frame has changed from stored state
    if (frameHash !== storedHash) {
      console.time("snap");

      // Only serialize state when we need to save it
      console.time("serialize state");
      const state2 = JSON.stringify(gb.saveState());
      console.timeEnd("serialize state");

      // Increment state ID atomically
      const newStateId = await r.incr("state_id");
      console.log("incrementing state_id to:", newStateId);

      await r.mset({
        latest_image: buf,
        latest_image_hash: frameHash,
        latest_state: state2,
        key: -1,
      });
      console.timeEnd("snap");

      // Update hot emulator state ID since we just saved a new state
      hotEmulatorStateId = newStateId.toString();

      // Get key info if there was a key press
      const [lastKey, lastKeyGeo] = await r.mget(["last_key", "last_key_geo"]);
      console.log("key info from redis:", { lastKey, lastKeyGeo });
      
      const keyInfo = lastKey && lastKey !== "-1" ? {
        key: lastKey,
        geo: JSON.parse(lastKeyGeo || "{}")
      } : null;

      const message = JSON.stringify({
        hash: frameHash,
        keyInfo
      });
      console.log("publishing frame message:", message);
      await r.publish("frame", message);
    } else {
      console.log("frame unchanged from stored state, skipping Redis update");
    }
  } catch (err) {
    console.error("error in run:", err.stack);
    throw err;
  }
}
