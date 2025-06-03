require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3001,
  ONLINE_EXAM_API_URL:
    process.env.ONLINE_EXAM_API_URL || "http://localhost:5000/",
  JWT_SECRET: process.env.JWT_SECRET || "your-jwt-secret-key",
  ZIP_URL: process.env.ZIP_URL || "",
  ZIP_AUTH_TOKEN: process.env.ZIP_AUTH_TOKEN || "",
  SCHOOL_ID: process.env.SCHOOL_ID || "",
  USER_ID: process.env.USER_ID || "",
  USER_EMAIL: process.env.USER_EMAIL || "",
};
