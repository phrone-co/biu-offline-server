const { ONLINE_EXAM_API_URL, JWT_SECRET } = require("../config/serverConfig");
const jwt = require("jsonwebtoken");

class OnlineExamService {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || ONLINE_EXAM_API_URL;
  }

  async sendPostRequest(authorizationParams, urlPath, body = {}) {
    const response = await fetch(`${this.apiUrl}${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.generateAuthToken(authorizationParams)}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    return await response.json();
  }

  generateAuthToken(payload, expiresIn = 300) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  async fetchExams() {
    try {
      const response = await this.sendPostRequest({}, "api/exams/all");

      console.log("fetchExams::: ", response);

      return response;
    } catch (error) {
      console.error("❌ Failed to fetch exams:", error.message);
      return null;
    }
  }

  async fetchExamStudents(testId) {
    try {
      const response = await this.sendPostRequest({}, "api/exams/students", {
        testId,
      });

      console.log("fetchExams::: ", response);

      return response;
    } catch (error) {
      console.error("❌ Failed to fetch exam students:", error.message);
      return null;
    }
  }

  async fetchStudentExam(userId, testId) {
    try {
      const response = await this.sendPostRequest(
        { id: userId },
        "api/exams/student/test",
        {
          testId,
        }
      );

      return response;
    } catch (error) {
      console.error("❌ Failed to fetch student exam:", error.message);
      return null;
    }
  }

  async startStudentExam(userId, examId) {
    const response = await this.sendPostRequest(
      { id: userId },
      `api/exams/${examId}/start`
    );

    return response;
  }
}

module.exports = new OnlineExamService();
