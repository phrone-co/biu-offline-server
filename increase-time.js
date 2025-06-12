const redisService = require("./services/redisService");
const ExamController = require("./controllers/examController");

(async () => {
  try {
    await redisService.connect();
    console.log("✅ Connected to Redis");

    // await ExamController.increaseTime("igwwokorochekwube@gmail.com", 30);
    // await ExamController.increaseTime("Annabelotabor1@gmail.com", 30);
    // await ExamController.increaseTime("divinesom3@gmail.com", 40);
    await ExamController.increaseTime("divinesom3@gmail.com", 23);
    await ExamController.increaseTime("Jennyjoe321@gmail.com", 11);
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();

// SELECT * FROM questions WHERE course_topic_id = UUID_TO_BIN("3fa85f64-5717-4562-b3fc-2c963f66afa6");
// requestlognew20250606a to requestlog5
// student_exam_state_new to student_exam_state
// student-login-new to students-login
// students-exams to student-exams-new
