const Redis = require("ioredis");

const r = new Redis(process.env.REDIS_URL);

export async function POST(req) {
  const key = Number(await req.text());
  
  // Validate key
  if (!(key >= 0 && key < 8)) {
    return new Response("Invalid key", { status: 400 });
  }

  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const geo = {
      city: isDev ? "San Francisco" : req.headers.get("x-vercel-ip-city"),
      region: isDev ? "California" : req.headers.get("x-vercel-ip-region"),
      country: isDev ? "US" : req.headers.get("x-vercel-ip-country")
    };

    // Set the key and location info
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