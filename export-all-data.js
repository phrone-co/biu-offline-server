// source-redis-exporter.js
const redis = require("redis");
// Or use a built-in HTTP client if available in your Node.js version
const {
  redisConfig: { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD },
} = require("./config");

// Configuration
const SOURCE_REDIS_CONFIG = {
  // host: "localhost",
  // port: 6379,
  // password: "your_password", // Uncomment and set if your Redis requires authentication
};
const DESTINATION_URL = "https://d50d-102-89-69-37.ngrok-free.app/receive"; // Change to your actual destination URL
const RETRY_DELAY_MS = 2000; // Delay before retrying failed fetches
const MAX_RETRIES = 3; // Maximum number of retries for failed fetches

async function getValueFromRedis(redisClient, key, type) {
  let value;
  switch (type) {
    case "string":
      value = await redisClient.get(key);
      break;
    case "hash":
      value = await redisClient.hGetAll(key);
      break;
    case "list":
      value = await redisClient.lRange(key, 0, -1);
      break;
    case "set":
      value = await redisClient.sMembers(key);
      break;
    case "zset":
      value = await redisClient.zRangeWithScores(key, 0, -1);
      break;
    default:
      console.warn(
        `[WARNING] Skipping unsupported type: ${type} for key: ${key}`
      );
      return null; // Return null for unsupported types
  }
  return value;
}

async function sendDataToDestination(data, retries = 0) {
  try {
    const response = await fetch(DESTINATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      timeout: 5000, // Add a timeout for the fetch request (e.g., 5 seconds)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorText}`
      );
    }

    console.log(`[SUCCESS] Transferred key: ${data.key}`);
    return true;
  } catch (error) {
    console.error(
      `[ERROR] Failed to send data for key: ${data.key}. Attempt ${
        retries + 1
      }/${MAX_RETRIES}. Error:`,
      error.message
    );
    if (retries < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return sendDataToDestination(data, retries + 1); // Retry the request
    } else {
      console.error(
        `[CRITICAL] Max retries reached for key: ${data.key}. Skipping.`
      );
      return false;
    }
  }
}

(async () => {
  const sourceRedis = redis.createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    password: REDIS_PASSWORD,
  });

  sourceRedis.on("error", (err) => console.error("[REDIS ERROR]", err));

  try {
    await sourceRedis.connect();
    console.log("Successfully connected to source Redis.");

    const keys = await sourceRedis.keys("*");
    console.log(`Found ${keys.length} keys to transfer.`);
    console.log(
      "keys::: ",
      keys.filter((key) => key.includes("production"))
    );
    // return;

    if (keys.length === 0) {
      console.log("No keys found in Redis to transfer. Exiting.");
    }

    for (const key of keys.filter((key) => key.includes("production"))) {
      const type = await sourceRedis.type(key);
      const value = await getValueFromRedis(sourceRedis, key, type);

      if (value !== null) {
        console.log(value);
        // Only proceed if the type was supported and a value was retrieved
        const dataToSend = { key, type, value };
        // await sendDataToDestination(dataToSend); // Each key-value pair sent individually
      }
    }
    console.log("Data transfer process completed.");
  } catch (error) {
    console.error(
      "[CRITICAL ERROR] An error occurred during the transfer process:",
      error
    );
  } finally {
    if (sourceRedis.isReady) {
      await sourceRedis.quit();
      console.log("Disconnected from source Redis.");
    }
  }
})();
