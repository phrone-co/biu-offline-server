const {
  ONLINE_EXAM_API_URL,
  JWT_SECRET,
  SCHOOL_ID,
  USER_ID,
  USER_EMAIL,
} = require("../config/serverConfig");
const jwt = require("jsonwebtoken");
const redisService = require("./redisService");

class NewOnlineExamService {
  constructor(apiUrl) {
    console.log("ONLINE_EXAM_API_URL::: ", ONLINE_EXAM_API_URL);
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

    console.log(response);

    // if (!response.ok) {
    //   throw new Error(`Server responded with ${response.status}`);
    // }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  }

  async sendGetRequest(authorizationParams, urlPath, body = {}) {
    const response = await fetch(`${this.apiUrl}${urlPath}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.generateAuthToken(authorizationParams)}`,
      },
    });

    console.log(response);

    // if (!response.ok) {
    //   throw new Error(`Server responded with ${response.status}`);
    // }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  }

  generateAuthToken(payload, expiresIn = 300) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  async fetchAllStudents() {
    try {
      const response = await this.sendGetRequest(
        { id: USER_ID, schoolId: SCHOOL_ID, email: USER_EMAIL },
        "api/v1/proxy-server/students",
        {}
      );

      return response;
    } catch (error) {
      console.log(error);
      console.error("❌ Failed to fetch exam students:", error.message);
      return null;
    }
  }

  async fetchStudentExams(studentId, studentEmail) {
    try {
      const response = await this.sendGetRequest(
        { id: studentId, email: studentEmail, schoolId: SCHOOL_ID },
        `api/v1/proxy-server/students/exams/available?schoolId=${SCHOOL_ID}`,
        {}
      );

      return response;
    } catch (error) {
      console.log(error);
      console.error("❌ Failed to fetch exam students:", error.message);
      return null;
    }
  }

  async fetchStudentExamQuestions(studentId, studentEmail, examId) {
    try {
      const response = await this.sendGetRequest(
        { id: studentId, email: studentEmail, schoolId: SCHOOL_ID },
        `api/v1/exams/${examId}/start`,
        {}
      );

      return response;
    } catch (error) {
      console.log(error);
      console.error("❌ Failed to fetch exam students:", error.message);
      return null;
    }
  }
}

module.exports = new NewOnlineExamService();
