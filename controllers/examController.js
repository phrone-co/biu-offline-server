const { SCHOOL_ID } = require("../config/serverConfig");
const newOnlineExamServices = require("../services/newOnlineExamServices");
const onlineExamServices = require("../services/onlineExamServices");
const redisService = require("../services/redisService");
const httpRequest = require("../utils/httpRequest");
const { DateTime } = require("luxon");
const _ = require("lodash");

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
    console.log("loading students");
    const allStudents = await newOnlineExamServices.fetchAllStudents();

    if (!allStudents) {
      return;
    }

    console.log("loading students", allStudents);

    // for each student, fetch their exams
    const studentsExams = {};

    for (let student of allStudents) {
      // if (student.id !== "2ada7cbb-39de-4a26-b3e5-aa92188b73c6") {
      //   continue;
      // }

      console.log("loading exams:", student.email);

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
          console.log("error::: ", error);
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

      if (!response.ok && response.status !== 401) {
        throw new Error("Failed student exams");
      }

      res.status(response.status);
      res.json(await response.json());
    } catch (error) {
      const examState = await redisService.fetchStudent(req.session.id);

      res.status(200);
      res.json(
        examState?.exams.map(({ questions, ...otherData }) => otherData) || []
      );
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

      await redisService.enqueue("requestlognew20250606a", {
        uri: `api/v1/exams/${examId}/mark-start-date`,
        method: "POST",
        headers: ExamController.storeAuthHeaders(req),
        body: {
          studentId,
          startedAt: new Date(),
          schoolId: SCHOOL_ID,
        },
        useProxyHeaders: true,
        proxyHeaderData: {
          id: studentId,
          email: req.session.email,
        },
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

    await redisService.enqueue("requestlognew20250606a", {
      uri: `api/v1/exams/${examId}/questions/${questionId}/mark-as-seen`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        studentId,
        seenAt: new Date(),
        schoolId: SCHOOL_ID,
      },
      useProxyHeaders: true,
      proxyHeaderData: {
        id: studentId,
        email: req.session.email,
      },
    });

    await redisService.addStudentExamAttempt(studentId, examId, examQuestions);

    res.status(200);
    res.json({});
  }

  static async examTimeUp(req, res) {
    const examId = req.params.examId;
    const questionId = req.params.questionId;
    const studentId = req.session.id;

    await redisService.enqueue("requestlognew20250606a", {
      uri: `api/v1/exams/${examId}/time-up`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        schoolId: SCHOOL_ID,
      },
      useProxyHeaders: true,
      proxyHeaderData: {
        id: studentId,
        email: req.session.email,
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

    await redisService.enqueue("requestlognew20250606a", {
      uri: `api/v1/exams/${examId}/questions/${questionId}/answer`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        optionId,
        schoolId: SCHOOL_ID,
        studentAnswer: answerText || req.body.answer,
      },
      useProxyHeaders: true,
      proxyHeaderData: {
        id: studentId,
        email: req.session.email,
      },
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

    await redisService.enqueue("requestlognew20250606a", {
      uri: `api/v1/exams/${examId}/complete`,
      method: "POST",
      headers: ExamController.storeAuthHeaders(req),
      body: {
        schoolId: SCHOOL_ID,
        submittedAt: new Date(),
      },
      useProxyHeaders: true,
      proxyHeaderData: {
        id: studentId,
        email: req.session.email,
      },
    });

    const exam = await redisService.fetchStudentExamAttempt(studentId, examId);

    exam.isFinished = true;

    await redisService.addStudentExamAttempt(studentId, examId, exam);

    res.status(200);
    res.json({});
  }

  static async replayQueueRequest() {
    await onlineExamServices.replayQueuedRequests("requestlognew20250606a");
  }

  static async uploadAllIds(allIds, allAttempts, index) {
    for (let idIndex in allIds) {
      const id = allIds[idIndex];

      console.log(`${idIndex} of ${allIds.length} in index ${index}`);
      const parts = id.split("-");
      const studentId = parts.slice(0, 5).join("-");
      const examId = parts.slice(5).join("-");

      // if (
      //   examId !== "bc7c2c40-02bc-482b-abe6-2ddaa5a5c2b4" &&
      //   studentId !== "0f5ee90c-9648-44b2-85ff-3b9b39ddf3bb"
      // ) {
      //   continue;
      // }

      if (!studentId || !examId) {
        continue;
      }

      // console.log("studentId::: ", studentId, id);
      const { student } = (await redisService.fetchStudent(studentId)) || {};

      if (!student) {
        continue;
      }

      const attempt = allAttempts[id];

      const questions = attempt.questions;

      for (let question of questions) {
        const { id: questionId, options } = question;

        if (question.type === "FREE_TEXT") {
          continue;
        }

        for (let option of options) {
          const { id: optionId, selected } = option;

          const request = {
            uri: `api/v1/exams/${examId}/questions/${questionId}/answer`,
            method: "POST",
            headers: {},
            body: {
              optionId,
              schoolId: SCHOOL_ID,
              studentAnswer: selected,
            },
            useProxyHeaders: true,
            proxyHeaderData: {
              id: studentId,
              email: student.email,
            },
          };

          // console.log(student.email, question.id, option.id, selected);

          const response = await onlineExamServices.sendPostRequest(
            request.headers.Authorization,
            request.uri,
            request.body,
            request.useProxyHeaders,
            request.proxyHeaderData
          );
          // console.log(
          //   `✅ Successfully replayed request to ${request.uri}:`,
          //   response
          // );

          if (selected !== null && question.type === "SINGLE_ANSWER") {
            break;
          }
        }
      }
    }
  }

  static async uploadAllAttemptsToServer() {
    const allAttempts = await redisService.fetchAllStudentAttempts();

    const chunkedArray = _.chunk(
      Object.keys(allAttempts).filter((attempt) => attempt.length > 20),
      10
    );

    const allIds = Object.keys(allAttempts).filter(
      (attempt) => attempt.length > 20
    );

    const asyncIds = _.chunk(allIds, 20);

    await Promise.all(
      asyncIds.map((ids, index) =>
        ExamController.uploadAllIds(ids, allAttempts, index)
      )
    );

    // let chunkUploaded = 1;

    // for (let attemptIds of chunkedArray) {
    //   const attempts = attemptIds.map((attemptId) => ({
    //     attemptId,
    //     attempt: allAttempts[attemptId],
    //   }));

    //   // console.log(attempts);

    //   console.log("chunkUploaded::: ", chunkUploaded, attempts.length);
    //   // await httpRequest("api/v1/attempts", "POST", {
    //   //   attempts,
    //   // });
    //   ++chunkUploaded;
    // }

    console.log("uploaded");
  }

  static async increaseTime(studentEmail, amountOfTime) {
    const examId = "698af95d-ace1-49be-8983-bcac12b387a2";

    const student = await redisService.fetchStudentLogin(studentEmail);

    if (!student) {
      console.log("Student not found: ", studentEmail);
      return;
    }

    const studentExamAttempt = await redisService.fetchStudentExamAttempt(
      student.id,
      examId
    );

    studentExamAttempt.isFinished = false;
    studentExamAttempt.endDatetime = DateTime.now().plus({
      seconds: amountOfTime * 60,
    });

    await redisService.addStudentExamAttempt(
      student.id,
      examId,

      studentExamAttempt
    );
  }
}

module.exports = ExamController;
