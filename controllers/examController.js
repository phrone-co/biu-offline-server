const { SCHOOL_ID } = require("../config/serverConfig");
const newOnlineExamServices = require("../services/newOnlineExamServices");
const onlineExamServices = require("../services/onlineExamServices");
const redisService = require("../services/redisService");
const httpRequest = require("../utils/httpRequest");
const { DateTime } = require("luxon");

class ExamController {
  static storeAuthHeaders(req) {
    const requestHeaders = {
      ...req.headers,
    };

    if (req.headers.authorization) {
      requestHeaders.Authorization = req.session;
    }

    return requestHeaders;
  }

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

  static async rerunFailedExams() {
    while (true) {
      const failedExam = await redisService.dequeue("failed-students-exam");

      if (!failedExam) {
        console.log("✅ Queue is empty. No failed exams left to process.");
        return;
      }

      const { studentId, testId, student, exam } = failedExam;
      console.log(`🔁 Retrying exam for student ${studentId}, test ${testId}`);

      try {
        const studentExams =
          await newOnlineExamServices.fetchStudentExamQuestions(
            studentId,
            testId
          );

        if (!studentExams) {
          console.warn(
            `⚠️ Still failed to load exam for student ${studentId}, test ${testId}. Re-queuing...`
          );
          await redisService.enqueue("failed-students-exam", failedExam);
        } else {
          console.log(
            `✅ Successfully reloaded exam for student ${studentId}, test ${testId}`
          );

          const questions = studentExams.questions.sort(
            (question) => question.position
          );

          await Promise.all([
            redisService.addStudent(student.id, {
              studentExams: {
                ...exam,
                questions,
              },
              student,
            }),
            redisService.addStudentLogin(student.email, student),
          ]);
        }
      } catch (error) {
        console.error(
          `❌ Error while retrying exam for student ${studentId}, test ${testId}. Re-queuing...`
        );
        await redisService.enqueue("failed-students-exam", failedExam);
      }
    }
  }

  static async preloadStudentAndExamData(req, res) {
    const allStudents = await newOnlineExamServices.fetchAllStudents();

    // for each student, fetch their exams
    const studentsExams = {};

    for (let student of allStudents) {
      const exams = await newOnlineExamServices.fetchStudentExams(
        student.id,
        student.email
      );

      for (let exam of exams) {
        try {
          const existingExam = await redisService.fetchStudentExamAttempt(
            student.id,
            exam.id
          );
          if (existingExam) {
            continue;
          }

          const studentExams =
            await newOnlineExamServices.fetchStudentExamQuestions(
              student.id,
              student.email,
              exam.id,
              exam.courseId,
              exam.departmentId
            );

          if (!studentsExams[student.id]) {
            studentsExams[student.id] = {
              student,
              exams: [],
            };
          }

          const questions = studentExams.questions
            .sort((a, b) => a.position - b.position)
            .map((question) => {
              question.options = question.options.sort(
                (a, b) => a.position - b.position
              );

              return question;
            });

          studentsExams[student.id].exams.push({
            ...exam,
            questions,
          });

          await redisService.addStudentExamAttempt(student.id, exam.id, {
            questions,
            ...exam,
          });
        } catch (error) {
          await redisService.enqueue("failed-students-exam", {
            studentId: student.id,
            studentEmail: student.email,
            testId: exam.id,
            student,
            exam,
          });
        }
      }

      if (studentsExams[student.id]) {
        await Promise.all([
          redisService.addStudent(student.id, {
            ...studentsExams[student.id],
          }),
          redisService.addStudentLogin(student.email, student),
        ]);
      }
    }
  }

  static async fetchStudentExams(req, res) {
    try {
      const response = await httpRequest(
        "api/v1/exams/available",
        "GET",
        undefined,
        req.headers
      );

      res.status(response.status);
      res.json(await response.json());
    } catch (error) {
      const examState = await redisService.fetchStudent(req.session.id);

      res.status(200);
      res.json(examState.exams.map(({ questions, ...otherData }) => otherData));
    }
  }

  static async startStudentExam(req, res) {
    const examId = req.params.examId;
    const studentId = req.session.id;

    const examQuestions = await redisService.fetchStudentExamAttempt(
      studentId,
      examId
    );

    if (examQuestions && !examQuestions.isStarted) {
      const startDate = new Date();

      const testEndTime = DateTime.now().plus({
        seconds: (examQuestions?.durationSeconds || -6) + 6,
      });

      examQuestions.isStarted = true;
      examQuestions.endDatetime = testEndTime;

      await redisService.addStudentExamAttempt(
        studentId,
        examId,
        examQuestions
      );

      await redisService.enqueue("requestlog5", {
        uri: `api/v1/exams/${examId}/mark-start-date`,
        method: "POST",
        headers: ExamController.storeAuthHeaders(req),
        body: {
          studentId,
          startedAt: new Date(),
          schoolId: SCHOOL_ID,
        },
        useProxyHeaders: true,
      });
    }

    if (examQuestions) {
      examQuestions.questions = examQuestions.questions
        .sort((a, b) => a.position - b.position)
        .map((question) => {
          question.options = question.options.sort(
            (a, b) => a.position - b.position
          );

          return question;
        });
    }

    res.status(200);
    res.json(examQuestions);
  }

  static async markAsSeen(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

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

    await redisService.enqueue("requestlog5", {
      uri: `api/v1/exams/${examId}/questions/${questionId}/mark-as-seen`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        studentId,
        seenAt: new Date(),
        schoolId: SCHOOL_ID,
      },
      useProxyHeaders: true,
    });

    await redisService.addStudentExamAttempt(studentId, examId, examQuestions);

    res.status(200);
    res.json({});
  }

  static async examTimeUp(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

    await redisService.enqueue("requestlog5", {
      uri: `api/v1/exams/${examId}/time-up`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        schoolId: SCHOOL_ID,
      },
      useProxyHeaders: true,
    });

    const exam = await redisService.fetchStudentExamAttempt(studentId, examId);

    if (exam) {
      exam.isFinished = true;

      await redisService.addStudentExamAttempt(studentId, examId, exam);
    }

    res.status(200);
    res.json({});
  }

  static async answerQuestion(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;
    const optionId = req.body.optionId;
    const answerPosition = req.body.answerPosition;
    const answerText = req.body.answerText;

    await redisService.enqueue("requestlog5", {
      uri: `api/v1/exams/${examId}/questions/${questionId}/answer`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        optionId,
        schoolId: SCHOOL_ID,
        studentAnswer: answerText || req.body.answer,
      },
      useProxyHeaders: true,
    });

    const examQuestions = await redisService.fetchStudentExamAttempt(
      studentId,
      examId
    );
    const questionIndex = examQuestions.questions.findIndex(
      (question) => question.id == questionId
    );
    const question = examQuestions.questions[questionIndex];

    if (question.type !== "FREE_TEXT") {
      const options = question.options.map((option) => {
        if (option.id === optionId) {
          option.selected = req.body.answer;
        } else {
          if (question.type == "SINGLE_ANSWER") {
            option.selected = false;
          }
        }

        return option;
      });

      question.options = options;
    } else {
      question.answerText = answerText;
    }

    examQuestions.questions[questionIndex] = {
      ...question,
    };

    await redisService.addStudentExamAttempt(studentId, examId, examQuestions);

    res.status(200);
    res.json({});
  }

  static async finishedExam(req, res) {
    const examId = req.params.examId;
    const studentId = req.session.id;

    await redisService.enqueue("requestlog5", {
      uri: `api/v1/exams/${examId}/complete`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        schoolId: SCHOOL_ID,
        submittedAt: new Date(),
      },
      useProxyHeaders: true,
    });

    const exam = await redisService.fetchStudentExamAttempt(studentId, examId);

    exam.isFinished = true;

    await redisService.addStudentExamAttempt(studentId, examId, exam);

    res.status(200);
    res.json({});
  }

  static async replayQueueRequest() {
    await onlineExamServices.replayQueuedRequests("requestlog5");
  }
}

module.exports = ExamController;
