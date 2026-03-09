// utils/redisClient.js
const { createClient } = require('redis');

const redis = createClient({
  socket: {
    host: "redis-11699.c84.us-east-1-2.ec2.cloud.redislabs.com",
    port: 11699
  },
  username: "default",
  password: "265I78CJHCdDr5mBPnIcUO1y8w2DxNfP",
  database: 0
});

redis.on("connect", () => console.log("Connected to Redis Cloud"));
redis.on("error", (err) => console.error("Redis Error:", err));

redis.connect();

//module.exports = redis;
