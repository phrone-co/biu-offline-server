const express = require("express");
const examRoutes = require("./routes/examRoutes");
const authRoutes = require("./routes/authRoutes");
const redisService = require("./services/redisService");
const { PORT } = require("./config/serverConfig");
const { NotFoundError } = require("./utils/errors");
const cors = require("cors");

const app = express();

app.use(cors());
app.options("*", cors());

// Middleware to parse JSON request body
app.use(express.json());

// Register Routes
app.use("/api/exams", examRoutes);
app.use("/api/auth", authRoutes);

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
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

process.on("SIGINT", async () => {
  console.log("🔄 Shutting down...");
  await redisService.disconnect();
  process.exit(0);
});
