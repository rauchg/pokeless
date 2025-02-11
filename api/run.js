const fs = require("fs");
const GameBoy = require("../lib/gameboy");
const { createCanvas } = require("@napi-rs/canvas");
const rom = fs.readFileSync(__dirname + "/../lib/yellow.gb");
const Redis = require("ioredis");
const Mutex = require("redis-semaphore").Mutex;
const { waitUntil } = require("@vercel/functions");

// how many frames to emulate each invocation
const FRAMES = 50;

const r = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

// Global flag to ensure only one game loop runs
let gameLoopStarted = false;

// In-memory cache of the latest frame
let latestFrame = null;

export async function GET(req) {
  // Try to become the game runner if no one else has
  if (!gameLoopStarted) {
    gameLoopStarted = true;
    waitUntil(
      (async () => {
        const mutex = new Mutex(r, "run");

        const acquired = await mutex.tryAcquire();
        if (acquired) {
          console.log("acquired lock, running game loop");
          try {
            await run(mutex);
          } catch (err) {
            console.error("error running game loop:", err.stack);
          } finally {
            await mutex.release();
            // Reset the flag when we're done running the game loop
            gameLoopStarted = false;
          }
        }
      })(),
    );
  }

  // Everyone gets frames through subscription
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    console.log(`[${id}] subscribe starting`);
    sub.subscribe("frame");
    sub.on("message", async (channel, message) => {
      console.log(`[${id}] got signal, fetching frame`);
      sub.unsubscribe();

      // First check if we have the frame in memory (same process optimization)
      if (latestFrame) {
        console.log(`[${id}] using in-memory frame`);
        resolve(
          new Response(latestFrame, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
            },
          }),
        );
        return;
      }

      // Otherwise fetch from Redis
      console.log(`[${id}] fetching frame from Redis`);
      const image = await r.getBuffer("latest_image");
      if (!image) {
        throw new Error("No image found in database");
      }

      resolve(
        new Response(image, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
          },
        }),
      );
    });
  });

  async function run(mutex) {
    console.log("running");

    try {
      // Get the latest key press
      const lastKeyStr = await r.get("last_key");
      let key = null;

      if (lastKeyStr) {
        key = Number(lastKeyStr);
        console.log("using key press:", key);
      }

      // Clear the last key so it's not used again
      await r.del("last_key");
      console.time("gb init");
      const canvas = createCanvas(160 * 2, 144 * 2);
      const gb = new GameBoy(canvas, rom);
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

      gb.stopEmulator = 1;

      // key was already fetched at the start

      if (key != null) {
        console.log("executing key", key);
        gb.JoyPadEvent(key, true);
      }

      // run through several frames to speed up execution
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

      console.time("serialize state");
      const state2 = JSON.stringify(gb.saveState());
      console.timeEnd("serialize state");

      console.time("render");
      const buf = canvas.toBuffer("image/png");
      console.timeEnd("render");

      console.time("snap");
      // Store in Redis and update memory cache
      latestFrame = buf;
      await r.mset({
        latest_image: buf,
        latest_state: state2,
        key: -1,
      });
      console.timeEnd("snap");

      // Notify subscribers that a new frame is ready
      await r.publish("frame", "new");
    } finally {
      try {
        await mutex.release();
      } catch (err) {
        console.error("error releasing lock", err.stack);
      }
    }
  }

  async function read() {
    console.log("reading");
    const image = await r.getBuffer("latest_image");

    if (!image) {
      throw new Error("No image found in database");
    }

    return new Response(image, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
      },
    });
  }
}
