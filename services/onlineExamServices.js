const {
  ONLINE_EXAM_API_URL,
  JWT_SECRET,
  USER_ID,
  USER_EMAIL,
  SCHOOL_ID,
} = require("../config/serverConfig");
const jwt = require("jsonwebtoken");
const redisService = require("./redisService");

class OnlineExamService {
  constructor(apiUrl) {
    console.log("ONLINE_EXAM_API_URL::: ", ONLINE_EXAM_API_URL);
    this.apiUrl = apiUrl || ONLINE_EXAM_API_URL;
  }

  async sendPostRequest(
    authorizationParams,
    urlPath,
    body = {},
    useProxyHeaders = false
  ) {
    const response = await fetch(`${this.apiUrl}${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.generateAuthToken(
          useProxyHeaders
            ? {
                id: USER_ID,
                schoolId: SCHOOL_ID,
                email: USER_EMAIL,
              }
            : authorizationParams
        )}`,
      },
      body: JSON.stringify(body),
    });

    console.log("response::: ", response);

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

  async fetchExams() {
    try {
      const response = await this.sendPostRequest({}, "api/exams/all");

      return response;
    } catch (error) {
      console.error("❌ Failed to fetch exams:", error.message);
      return null;
    }
  }

  async fetchExamStudents(testId) {
    try {
      const response = await this.sendPostRequest(
        {},
        "api/v1/proxy-server/students",
        {
          testId,
        }
      );

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

  async replayQueuedRequests(queueName) {
    while (true) {
      const request = await redisService.peek(queueName);

      if (!request) {
        // If queue is empty, wait 5 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      let attempts = 0;
      while (attempts < 3) {
        try {
          const useProxyHeaders = request.useProxyHeaders;

          delete request.headers.Authorization.exp;
          delete request.headers.Authorization.iat;
          delete request.useProxyHeaders;

          const response = await this.sendPostRequest(
            request.headers.Authorization,
            request.uri,
            request.body,
            useProxyHeaders
          );
          console.log(
            `✅ Successfully replayed request to ${request.uri}:`,
            response
          );
          await redisService.dequeue(queueName);
          break; // Exit retry loop on success
        } catch (error) {
          attempts++;
          console.error(
            `❌ Attempt ${attempts} failed for ${request.uri}:`,
            error.message,
            `${error}`,
            error.trace
          );

          console.log(
            "wiki::: ",
            error,
            error.cause,
            error.cause?.message,
            error.stack,
            typeof error.stack
          );

          if (
            error.message.includes("Network Error") ||
            error.stack.includes("ECONNREFUSED") ||
            error.cause?.message.includes("ECONNREFUSED")
          ) {
            console.warn(
              "🌐 No internet connection detected. Retrying in 10s..."
            );
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 10 seconds
            continue; // Do not increment attempts on network errors
          }

          // Exponential backoff: Wait (2^attempts) * 1000 ms before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempts) * 100)
          );

          if (attempts === 3) {
            console.error(
              `🚨 Failed after 3 attempts, re-enqueuing request: ${request.uri}`
            );
            await redisService.dequeue(queueName);
            await redisService.enqueue(`${queueName}-failed`, request);
          }
        }
      }
    }
  }
}

module.exports = new OnlineExamService();
