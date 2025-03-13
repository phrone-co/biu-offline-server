const onlineExamServices = require("../services/onlineExamServices");
const redisService = require("../services/redisService");
const httpRequest = require("../utils/httpRequest");

class ExamController {
  static async fetchExamState(req, res) {
    const { studentId } = req.params;
    try {
      const examState = await redisService.fetchStudentExamState(studentId);
      if (!examState) {
        return res.status(404).json({ message: "Exam state not found" });
      }
      res.json(examState);
    } catch (error) {
      console.error(
        `Error fetching exam state for student ${studentId}:`,
        error
      );
      res.status(500).json({ message: "Internal server error" });
    }
  }
  static async fetchAllAvailableExams(req, res) {
    const exams = await onlineExamServices.fetchExams();

    const studentsExams = {};

    for (let exam of exams) {
      const students = await onlineExamServices.fetchExamStudents(exam.testId);

      for (let student of students) {
        const studentExams = await onlineExamServices.fetchStudentExam(
          student.userId,
          exam.testId
        );

        if (!studentsExams[student.userId]) {
          studentsExams[student.userId] = {
            student,
            exams: [],
          };
        }

        studentsExams[student.userId].exams.push(studentExams);

        console.log(studentExams);
      }
    }

    const studentIds = Object.keys(studentsExams);

    for (let studentId of studentIds) {
      const { exams, student } = studentsExams[studentId];
      console.log(exams);

      await Promise.all([
        redisService.addStudent(student.userId, {
          studentExams: exams,
          student,
        }),
        redisService.addStudentLogin(student.username, student),
      ]);
    }

    res.status(201);
    res.end();
  }

  static async fetchStudentExams(req, res) {
    try {
      const response = await httpRequest(
        "api/exams",
        "GET",
        undefined,
        req.headers
      );

      res.status(response.status);
      res.json(await response.json());
    } catch (error) {
      const examState = await redisService.fetchStudent(req.session.id);

      res.status(200);
      res.json(examState.studentExams);
    }
  }

  static async startStudentExam(req, res) {
    const examId = req.params.examId;
    const studentId = req.session.id;

    try {
      const response = await httpRequest(
        `api/exams/${examId}/start`,
        "POST",
        {},
        req.headers
      );

      const examQuestions = await response.json();

      await redisService.addStudentExamAttempt(
        studentId,
        examId,
        examQuestions
      );

      res.status(response.status);
      res.json(examQuestions);
    } catch (error) {
      const examQuestions = await redisService.fetchStudentExamAttempt(
        studentId,
        examId
      );

      res.status(200);
      res.json(examQuestions);
    }
  }

  static async markAsSeen(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

    await redisService.enqueue("request", {
      uri: `api/exams/${examId}/questions/${questionId}/mark-as-seen`,
      method: "POST",
      headers: {},
      headers: req.headers,
    });

    const examQuestions = await redisService.fetchStudentExamAttempt(
      studentId,
      examId
    );
    const questionIndex = examQuestions.questions.findIndex(
      (question) => question.id == questionId
    );
    examQuestions.questions[questionIndex] = {
      ...examQuestions.questions[questionIndex],
      seen: true,
    };

    await redisService.addStudentExamAttempt(studentId, examId, examQuestions);

    res.status(200);
    res.json({});
  }
}

module.exports = ExamController;
