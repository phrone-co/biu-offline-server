const express = require("express");
const ExamController = require("../controllers/examController");
const authMiddleware = require("../middlewares/auth");

const router = express.Router();

// Route to fetch student exam state
router.get("/exam/state/:studentId", ExamController.fetchExamState);
router.get("/", authMiddleware, ExamController.fetchStudentExams);
router.post("/:examId/start", authMiddleware, ExamController.startStudentExam);
router.post("/:examId/terminate", authMiddleware, ExamController.finishedExam);
router.post("/:examId/time-up", authMiddleware, ExamController.examTimeUp);
router.post(
  "/:examId/questions/:questionId/mark-as-seen",
  authMiddleware,
  ExamController.markAsSeen
);
router.post(
  "/:examId/questions/:questionId/answer",
  authMiddleware,
  ExamController.answerQuestion
);

// router.get("/all", ExamController.fetchAllAvailableExams);

module.exports = router;
