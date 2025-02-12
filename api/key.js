const Redis = require("ioredis");

const r = new Redis(process.env.REDIS_URL);

export async function POST(req) {
  const key = Number(await req.text());
  
  // Validate key
  if (!(key >= 0 && key < 8)) {
    return new Response("Invalid key", { status: 400 });
  }

  try {
    const geo = {
      city: req.headers.get("x-vercel-ip-city"),
      region: req.headers.get("x-vercel-ip-region"),
      country: req.headers.get("x-vercel-ip-country")
    };

    // Set the key with location info
    await r.mset({
      "last_key": key.toString(),
      "last_key_geo": JSON.stringify(geo)
    });
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("error with key submission:", err.stack);
    return new Response("Internal error", { status: 500 });
  }
}