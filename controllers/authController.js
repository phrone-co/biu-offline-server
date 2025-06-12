const onlineExamServices = require("../services/onlineExamServices");
const redisService = require("../services/redisService");
const bcrypt = require("bcrypt");
const { BadRequestError } = require("../utils/errors");
const { userResponse } = require("../utils/userResponse");
const {
  ONLINE_EXAM_API_URL,
  JWT_SECRET,
  SCHOOL_ID,
} = require("../config/serverConfig");
const jwt = require("jsonwebtoken");
const httpRequest = require("../utils/httpRequest");

class AuthController {
  static async loginUserViaApi(username, password) {
    return httpRequest("api/v1/users/login", "POST", {
      email: username,
      password,
    });
  }

  static async loginUser(req, res) {
    const { username, password } = req.body;

    try {
      const response = await AuthController.loginUserViaApi(username, password);
      const jsonResponse = await response.json();

      const accessTokenPayload = {
        id: jsonResponse.user.id,
        email: jsonResponse.user.email,
        schoolId: SCHOOL_ID,
      };

      const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
        expiresIn: "5h",
      });

      res.status(response.status);
      res.json({
        user: jsonResponse.user,
        accessToken,
      });
    } catch (error) {
      console.log("Login Failed, trying local login", error);
      let user = await redisService.fetchStudentLogin(username);

      if (user == null) {
        throw new BadRequestError("Invalid Username!");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      // if (!isPasswordValid) {
      //   throw new BadRequestError("Your password is wrong!");
      // }

      const accessTokenPayload = {
        id: user.id,
        email: user.email,
        schoolId: SCHOOL_ID,
      };

      const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
        expiresIn: "5h",
      });

      res.status(200);
      res.json({ user: user, accessToken });
    }
  }
}

module.exports = AuthController;
