const Redis = require("ioredis");

const r = new Redis(process.env.REDIS_URL);

export async function POST(req) {
  const key = Number(await req.text());
  
  // Validate key
  if (!(key >= 0 && key < 8)) {
    return new Response("Invalid key", { status: 400 });
  }

  try {
    // Set the key
    await r.set("last_key", key.toString());

    // Keep connection open until client disconnects
    await new Promise(() => {});
  } catch (err) {
    console.error("error with key submission:", err.stack);
    return new Response("Internal error", { status: 500 });
  } finally {
    // Clear the key when client disconnects
    await r.del("last_key");
  }
}