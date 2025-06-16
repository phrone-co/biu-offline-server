// dest-redis-importer.js
const redis = require("redis");
const express = require("express");
const bodyParser = require("body-parser");
const {
  redisConfig: { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD },
} = require("./config");
// Configuration
const DESTINATION_REDIS_CONFIG = {
  // host: "localhost",
  // port: 6379,
  // password: "your_password",
};
const PORT = 3004;

const app = express();
const destinationRedis = redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  password: REDIS_PASSWORD,
});

destinationRedis.on("error", (err) => {
  console.error("[REDIS CLIENT ERROR]", err);
});

(async () => {
  try {
    await destinationRedis.connect();
    console.log("Successfully connected to destination Redis.");
  } catch (err) {
    console.error("[CRITICAL] Failed to connect to destination Redis:", err);
    process.exit(1);
  }
})();

// ===>>> THE CHANGE IS HERE <<<===
// Increase the limit for JSON payloads. Adjust this value based on your expected maximum payload size.
// For example, '10mb', '50mb', '100mb', etc.
app.use(bodyParser.json({ limit: "500mb" })); // Changed from app.use(bodyParser.json());

// If you also handle URL-encoded data, you might want to increase its limit too:
// app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.post("/receive", async (req, res) => {
  const { key: oldKey, type, value } = req.body;

  if (!oldKey || !type || value === undefined) {
    return res.status(400).send("Missing key, type, or value in request body.");
  }

  const key = `${oldKey}-production`;

  try {
    switch (type) {
      case "string":
        await destinationRedis.set(key, value);
        break;
      case "hash":
        await destinationRedis.hSet(key, value);
        break;
      case "list":
        if (Array.isArray(value) && value.length > 0) {
          await destinationRedis.rPush(key, ...value);
        } else {
          console.warn(`[WARNING] No list elements to push for key: ${key}`);
        }
        break;
      case "set":
        if (Array.isArray(value) && value.length > 0) {
          await destinationRedis.sAdd(key, ...value);
        } else {
          console.warn(`[WARNING] No set members to add for key: ${key}`);
        }
        break;
      case "zset":
        if (Array.isArray(value) && value.length > 0) {
          const zMembers = value.map(({ score, value: memberValue }) => ({
            score: parseFloat(score),
            value: memberValue,
          }));
          await destinationRedis.zAdd(key, zMembers);
        } else {
          console.warn(`[WARNING] No zset members to add for key: ${key}`);
        }
        break;
      default:
        console.warn(
          `[WARNING] Received unsupported type: ${type} for key: ${key}`
        );
        return res.status(400).send(`Unsupported type: ${type}`);
    }

    console.log(`[SUCCESS] Imported key: ${key} (type: ${type})`);
    res.status(200).send("OK");
  } catch (err) {
    console.error(`[ERROR] Failed to import key: ${key}. Error:`, err);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(PORT, () => {
  console.log(`Receiver running on http://localhost:${PORT}`);
});
