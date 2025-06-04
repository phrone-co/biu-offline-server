const express = require("express");
const examRoutes = require("./routes/examRoutes");
const authRoutes = require("./routes/authRoutes");
const redisService = require("./services/redisService");
const { PORT } = require("./config/serverConfig");
const { NotFoundError } = require("./utils/errors");
const cors = require("cors");
const downloadAndExtractZip = require("./download-frontend");
const path = require("path");
const ExamController = require("./controllers/examController");

const app = express();

app.use(cors());
app.options("*", cors());

// Middleware to parse JSON request body
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  const start = Date.now();
  console.log(
    `📥 [START] ${req.method} ${req.url} at ${new Date().toISOString()}`
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `📤 [FINISH] ${req.method} ${req.url} - Status: ${res.statusCode} - Time: ${duration}ms`
    );
  });

  res.on("close", () => {
    console.log(
      `⚠️ [CLOSED] ${req.method} ${req.url} - Connection closed before response.`
    );
  });

  next();
});
// Register Routes
app.use("/api/exams", examRoutes);
app.use("/api/auth", authRoutes);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((req, res, next) => {
  next(new NotFoundError("The requested resource was not found."));
});

app.use((err, req, res, next) => {
  // Log the error stack for internal server errors
  if (!err.statusCode || err.statusCode === 500) {
    console.error(err.stack);
  }

  res.status(err.statusCode || 500).json({
    status: err.status || "error",
    message: err.message || "Something went wrong!",
    data: err.data,
  });
});
// Initialize Redis Connection
(async () => {
  try {
    await redisService.connect();
    console.log("✅ Connected to Redis");
    ExamController.replayQueueRequest();
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();

(async () => {
  if (process.env.RUN_REDIS_WORKER === "true") {
    while (true) {
      await ExamController.preloadStudentAndExamData();

      await new Promise((resolve) => {
        setTimeout(resolve, 35000);
      });
    }
  }
})();

(async () => {
  if (process.env.RUN_REDIS_WORKER === "true") {
    while (true) {
      await ExamController.rerunFailedExams();
      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
    }
  }
})();

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

process.on("SIGINT", async () => {
  console.log("🔄 Shutting down...");
  await redisService.disconnect();

  process.exit(0);
});

// (() => {
//   downloadAndExtractZip();
// })();

// setInterval(() => {
//   downloadAndExtractZip();
// }, 5 * 60 * 1000);
// ExamController.preloadStudentAndExamData();
