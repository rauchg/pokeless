import fs from "fs";
import GameBoy from "../lib/gameboy";
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "crypto";
import { Lock } from "@upstash/lock";
import { Redis } from "@upstash/redis";
import { compress, uncompress } from "lz4-napi";
import * as blob from "@vercel/blob";
const rom = fs.readFileSync(__dirname + "/../lib/yellow.gb");

// how many frames to emulate each invocation
const FRAMES = 50;

const redis = Redis.fromEnv();
const lock = new Lock({
  id: "run",
  lease: 5000,
  redis: Redis.fromEnv(),
});

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

  let latestEtag = await redis.get("latest_etag");
  console.log("latest etag", latestEtag);

  // if (!latestEtag || latestEtag === req.headers["if-none-match"]) {
  try {
    console.log("trying to run");
    await run();
  } catch (err) {
    console.error(err.stack);
    await read();
  }
  // } else {
  //   console.log("not reading");
  //   await read();
  // }

  async function run() {
    console.log("running");

    // we make the key be "last one wins", if any,
    // so that everyone gets a chance at deciding
    // the next command
    if (key != null) {
      console.time("save key");
      await redis.set("key", key);
      console.timeEnd("save key");
    }

    console.time("mutex acquire");
    const acquired = await lock.acquire();
    console.timeEnd("mutex acquire");

    if (!acquired) {
      throw new Error("Could not acquire lock");
    }

    try {
      console.time("gb init");
      const canvas = createCanvas(160 * 2, 144 * 2);
      const gb = new GameBoy(canvas, rom);
      console.timeEnd("gb init");

      if (latestEtag) {
        console.time("read etag");
        let stateUrl;
        [latestEtag, stateUrl] = await redis
          .multi()
          .get("latest_etag")
          .get("state_url")
          .exec();
        console.timeEnd("read etag");

        if (stateUrl) {
          console.time("read state");
          let latestState = await (await fetch(stateUrl)).arrayBuffer();
          console.timeEnd("read state");

          console.time("init state");
          gb.returnFromState(
            JSON.parse(await uncompress(Buffer.from(latestState)))
          );
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
      let key = await redis.get("key");
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

      console.time("save state");
      const savedState = gb.saveState();
      console.timeEnd("save state");

      console.time("serialize state");
      const state = JSON.stringify(savedState);
      console.timeEnd("serialize state");

      // compress
      console.time("compress state");
      const compressedState = await compress(state);
      console.timeEnd("compress state");

      console.time("hash state");
      const etag = createHash("sha256").update(state).digest("hex");
      console.timeEnd("hash state");

      console.time("render");
      const buf = canvas.toBuffer("image/png");
      console.timeEnd("render");

      console.time("snap state");
      const { url } = await blob.put(`/state/${etag}`, compressedState, {
        access: "public",
      });
      console.timeEnd("snap state");

      console.time("snap meta");
      await redis
        .multi()
        .set("latest_etag", etag)
        .set("latest_image", buf)
        .set("state_url", url)
        .set("key", -1)
        .exec();
      console.timeEnd("snap meta");

      res.writeHead(200, {
        "Content-Type": "image/png",
        etag,
      });
      res.end(buf);
    } finally {
      await lock.release();
    }
  }

  async function read() {
    console.log("reading");

    console.time("read image");
    const [etag, image] = await redis
      .multi()
      .get("latest_etag")
      .get("latest_image")
      .exec();
    console.timeEnd("read image");

    console.time("hydrate buffer");
    const buffer = Buffer.from(image.data);
    console.timeEnd("hydrate buffer");

    res.writeHead(200, { "Content-Type": "image/png", etag });
    res.end(buffer);
  }
};
