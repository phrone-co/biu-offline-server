require("dotenv").config();

module.exports = {
  ONLINE_EXAM_HOST: process.env.ONLINE_EXAM_HOST || "localhost",
};
