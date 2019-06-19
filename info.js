const Redis = require("ioredis");

module.exports = async (req, res) => {
  const r = new Redis(process.env.REDIS_URL);
  const info = await r.info();
  res.end(info);
  console.time("disconnect");
  await r.disconnect();
  console.timeEnd("disconnect");
};
