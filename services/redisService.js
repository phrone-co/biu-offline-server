const redis = require("redis");
const {
  redisConfig: { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD },
} = require("../config");

let redisClient;

class RedisService {
  constructor() {
    redisClient = redis.createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
      },
      password: REDIS_PASSWORD,
    });

    redisClient.on("error", (err) => console.error("Redis Error:", err));
  }

  async connect() {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("Connected to Redis");
    }
  }

  async disconnect() {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("Disconnected from Redis");
    }
  }

  async enqueue(queueName, request) {
    try {
      const requestData = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body || null,
      };
      await redisClient.rPush(queueName, JSON.stringify(requestData));
      console.log(`Enqueued request in ${queueName}`);
    } catch (error) {
      console.error("Error enqueuing request:", error);
    }
  }

  async dequeue(queueName) {
    try {
      const item = await redisClient.lPop(queueName);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Error dequeuing request:", error);
      return null;
    }
  }

  async getQueueItems(queueName) {
    try {
      const items = await redisClient.lRange(queueName, 0, -1);
      return items.map((item) => JSON.parse(item));
    } catch (error) {
      console.error("Error fetching queue items:", error);
      return [];
    }
  }

  async replayQueuedRequests(queueName) {
    while (true) {
      const request = await this.dequeue(queueName);
      if (!request) break;
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body ? JSON.stringify(request.body) : null,
        });
        console.log(
          `Replayed request to ${request.url}, Status: ${response.status}`
        );
      } catch (error) {
        console.error(`Error replaying request to ${request.url}:`, error);
        await this.enqueue(queueName, request); // Re-enqueue if failed
        break;
      }
    }
  }

  async fetchStudentExamState(studentId) {
    try {
      const state = await redisClient.get(`student_exam_state:${studentId}`);
      return state ? JSON.parse(state) : null;
    } catch (error) {
      console.error(
        `Error fetching exam state for student ${studentId}:`,
        error
      );
      return null;
    }
  }

  async updateStudentExamState(studentId, state) {
    try {
      await redisClient.set(
        `student_exam_state:${studentId}`,
        JSON.stringify(state)
      );
      console.log(`Updated exam state for student ${studentId}`);
    } catch (error) {
      console.error(
        `Error updating exam state for student ${studentId}:`,
        error
      );
    }
  }

  async addStudent(studentId, studentData) {
    try {
      await redisClient.hSet(
        `students`,
        studentId,
        JSON.stringify(studentData)
      );
      console.log(`Added student ${studentId}`);
    } catch (error) {
      console.error(`Error adding student ${studentId}:`, error);
    }
  }

  async fetchStudent(studentId) {
    try {
      const studentData = await redisClient.hGet(`students`, studentId);
      return studentData ? JSON.parse(studentData) : null;
    } catch (error) {
      console.error(`Error fetching student ${studentId}:`, error);
      return null;
    }
  }

  async addStudentLogin(matricNumber, studentData) {
    try {
      await redisClient.hSet(
        `students-login`,
        matricNumber,
        JSON.stringify(studentData)
      );
      console.log(`Added student login ${matricNumber}`);
    } catch (error) {
      console.error(`Error adding student login ${matricNumber}:`, error);
    }
  }

  async fetchStudentLogin(matricNumber) {
    try {
      const studentData = await redisClient.hGet(
        `students-login`,
        matricNumber
      );
      return studentData ? JSON.parse(studentData) : null;
    } catch (error) {
      console.error(`Error fetching student ${matricNumber}:`, error);
      return null;
    }
  }

  async addStudentExamAttempt(studentId, examId, examQuestions) {
    try {
      await redisClient.hSet(
        `students-exams`,
        `${studentId}-${examId}`,
        JSON.stringify(examQuestions)
      );
      console.log(`Added student exam ${studentId}-${examId}`);
    } catch (error) {
      console.error(`Error adding student exam ${studentId}-${examId}:`, error);
    }
  }

  async fetchStudentExamAttempt(studentId, examId) {
    try {
      const studentData = await redisClient.hGet(
        `students-exams`,
        `${studentId}-${examId}`
      );
      return studentData ? JSON.parse(studentData) : null;
    } catch (error) {
      console.error(`Error fetching student ${matricNumber}:`, error);
      return null;
    }
  }
}

module.exports = new RedisService();
