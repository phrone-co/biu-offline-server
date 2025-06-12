const redisService = require("./services/redisService");
const ExamController = require("./controllers/examController");

(async () => {
  try {
    await redisService.connect();
    console.log("✅ Connected to Redis");
    while (true) {
      await ExamController.preloadStudentAndExamData();

      await new Promise((resolve) => {
        setTimeout(resolve, 120000);
      });
    }
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();
