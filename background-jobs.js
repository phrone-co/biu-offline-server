const redisService = require("./services/redisService");
const ExamController = require("./controllers/examController");

(async () => {
  try {
    await redisService.connect();
    console.log("✅ Connected to Redis");
    ExamController.replayQueueRequest();
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();

// (async () => {
//   try {
//     await redisService.connect();
//     console.log("✅ Connected to Redis");
//     ExamController.uploadAllAttemptsToServer();
//   } catch (error) {
//     console.error("❌ Redis connection failed:", error);
//   }
// })();
// concat("/api", "
