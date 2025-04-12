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

      const { studentId, testId } = failedExam;
      console.log(`🔁 Retrying exam for student ${studentId}, test ${testId}`);

      try {
        const examQuestions = await onlineExamServices.startStudentExam(
          studentId,
          testId
        );

        if (!examQuestions) {
          console.warn(
            `⚠️ Still failed to load exam for student ${studentId}, test ${testId}. Re-queuing...`
          );
          await redisService.enqueue("failed-students-exam", failedExam);
        } else {
          console.log(
            `✅ Successfully reloaded exam for student ${studentId}, test ${testId}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Error while retrying exam for student ${studentId}, test ${testId}. Re-queuing...`
        );
        await redisService.enqueue("failed-students-exam", failedExam);
      }
    }
  }

  static async fetchAllAvailableExams(req, res) {
    const exams = await onlineExamServices.fetchExams();

    const examQuestions = await onlineExamServices.startStudentExam(61, 34);

    console.log(
      "examQuestions::: ",
      examQuestions.questions //.map(({ options }) => options)
    );
    return;

    if (exams) {
      const studentsExams = {};

      for (let exam of exams) {
        const students = await onlineExamServices.fetchExamStudents(
          exam.testId
        );

        for (let student of students) {
          const existingExam = await redisService.fetchStudentExamAttempt(
            student.userId,
            exam.testId
          );
          if (existingExam) {
            continue;
          }

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
        }
      }

      const studentIds = Object.keys(studentsExams);

      for (let studentId of studentIds) {
        const { exams, student } = studentsExams[studentId];

        for (let exam of exams) {
          await Promise.all([
            redisService.addStudent(student.userId, {
              studentExams: exams,
              student,
            }),
            redisService.addStudentLogin(student.username, student),
          ]);
          try {
            const examQuestions = await onlineExamServices.startStudentExam(
              studentId,
              exam.test_id
            );

            if (!examQuestions) {
              // add to failed exams queue
              await redisService.enqueue("failed-students-exam", {
                studentId,
                testId: exam.test_id,
              });
            } else {
              if (examQuestions.status === "ForbiddenError") {
                examQuestions.isNotLoaded = true;
                examQuestions.questions = [];
              }

              await redisService.addStudentExamAttempt(
                studentId,
                exam.test_id,
                examQuestions
              );
            }
          } catch (error) {
            console.log(
              "could not load exam questions for student: ",
              exam,
              studentId
            );
          }
        }
      }
    } else {
      console.log("No exams found::");
    }

    if (res) {
      res.status(201);
      res.end();
    }
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

    const examQuestions = await redisService.fetchStudentExamAttempt(
      studentId,
      examId
    );

    if (examQuestions && !examQuestions.isStarted) {
      const startDate = new Date();

      await redisService.enqueue("request", {
        uri: `api/exams/${examId}/set-start-date`,
        method: "POST",
        headers: ExamController.storeAuthHeaders(req),
        body: {
          startDate,
        },
      });

      const testEndTime = DateTime.now().plus({
        seconds: (examQuestions?.testDurationInSeconds || -6) + 6,
      });

      examQuestions.isStarted = true;
      examQuestions.endTime = testEndTime;

      await redisService.addStudentExamAttempt(
        studentId,
        examId,
        examQuestions
      );
    }

    res.status(200);
    res.json(examQuestions);
  }

  static async markAsSeen(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

    await redisService.enqueue("request", {
      uri: `api/exams/${examId}/questions/${questionId}/mark-as-seen`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
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

  static async examTimeUp(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

    await redisService.enqueue("request", {
      uri: `api/exams/${examId}/time-up`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        studentId,
        time: new Date(),
      },
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

    await redisService.enqueue("request", {
      uri: `api/exams/${examId}/questions/${questionId}/answer`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: req.body,
    });

    const examQuestions = await redisService.fetchStudentExamAttempt(
      studentId,
      examId
    );
    const questionIndex = examQuestions.questions.findIndex(
      (question) => question.id == questionId
    );
    const question = examQuestions.questions[questionIndex];

    if (question.type != 3) {
      const options = question.options.map((option) => {
        if (option.id === optionId) {
          option.selected = answerPosition[option.order];
        } else {
          if (question.type == 1) {
            option.selected = 0;
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

    await redisService.enqueue("request", {
      uri: `api/exams/${examId}/terminate`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
    });

    const exam = await redisService.fetchStudentExamAttempt(studentId, examId);

    exam.isFinished = true;

    await redisService.addStudentExamAttempt(studentId, examId, exam);

    res.status(200);
    res.json({});
  }

  static async replayQueueRequest() {
    await onlineExamServices.replayQueuedRequests("request");
  }
}

module.exports = ExamController;
