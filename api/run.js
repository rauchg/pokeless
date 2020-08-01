const fs = require("fs");
const GameBoy = require("../lib/gameboy");
const { createCanvas } = require("canvas");
const rom = fs.readFileSync(__dirname + "/../lib/yellow.gb");
const { createHash } = require("crypto");
const Redis = require("ioredis");
const { promisify } = require("util");
const zlib = require("zlib");
const sleep = require("then-sleep");
const Mutex = require("redis-semaphore").Mutex;

// how many frames to emulate each invocation
const FRAMES = 50;

module.exports = async (req, res) => {
  let key = req.headers["x-key"];
  if (key != null) {
    key = Number(key);
    if (key >= 0 && key < 8) {
      // valid key
    } else {
      key = null;
    }
  }

  const r = new Redis(process.env.REDIS_URL);
  let latestEtag = await r.get("latest_etag");
  let latestState = null;

  if (!latestEtag || latestEtag === req.headers["if-none-match"]) {
    try {
      await run();
    } catch (err) {
      await read();
    }
  } else {
    await read();
  }

  await r.disconnect();

  async function run() {
    const mutex = new Mutex(r, "run", {
      lockTimeout: 5000,
      acquireTimeout: 50
    });

    // we make the key be "last one wins", if any,
    // so that everyone gets a chance at deciding
    // the next command
    if (key != null) {
      console.time("save key");
      await r.set("key", key);
      console.timeEnd("save key");
    }

    console.time("mutex acquire");
    await mutex.acquire();
    console.timeEnd("mutex acquire");

    try {
      console.time("gb init");
      const canvas = createCanvas(160 * 2, 144 * 2);
      const toBuffer = promisify(canvas.toBuffer.bind(canvas));
      const gb = new GameBoy(canvas, rom);
      console.timeEnd("gb init");

      if (latestEtag) {
        console.time("read state");
        [[e1, latestEtag], [e2, latestState]] = await r
          .multi()
          .get("latest_etag")
          .getBuffer("latest_state")
          .exec();
        console.timeEnd("read state");

        if (e1 !== null || e2 !== null) {
          throw new Error(`Database read error ${e1} ${e2}`);
        }

        if (latestState) {
          console.time("init state");
          gb.returnFromState(JSON.parse(latestState));
          console.timeEnd("init state");
        } else {
          console.time("gb start");
          gb.start();
          console.timeEnd("gb start");
        }
      } else {
        console.time("gb start");
        gb.start();
        console.timeEnd("gb start");
      }

      gb.stopEmulator = 1;

      // press and release a key
      console.time("fetch key");
      let key = await r.get("key");
      console.timeEnd("fetch key");
      if (key != null) {
        key = Number(key);
      }

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
      const state = JSON.stringify(gb.saveState());
      console.timeEnd("serialize state");

      console.time("hash state");
      const etag = createHash("sha256")
        .update(state)
        .digest("hex");
      console.timeEnd("hash state");

      console.time("render");
      const buf = await toBuffer();
      console.timeEnd("render");

      console.time("snapshot");
      await r.mset({
        latest_etag: etag,
        latest_image: buf,
        latest_state: state,
        key: -1
      });
      console.timeEnd("snapshot");

      if (e3 !== null || e4 !== null) {
        throw new Error(`Database write error ${e1} ${e2}`);
      }

      res.writeHead(200, {
        "Content-Type": "image/png",
        etag
      });
      res.end(buf);
    } finally {
      await mutex.release();
    }
  }

  async function read() {
    console.log("reading");
    const [[e1, etag], [e2, image]] = await r
      .multi()
      .get("latest_etag")
      .getBuffer("latest_image")
      .exec();

    if (e1 || e2) {
      throw new Error(`Database read error ${e1} ${e2}`);
    }

    res.writeHead(200, { "Content-Type": "image/png", etag });
    res.end(image);
  }
};
