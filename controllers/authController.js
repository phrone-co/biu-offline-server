const onlineExamServices = require("../services/onlineExamServices");
const redisService = require("../services/redisService");
const bcrypt = require("bcryptjs");
const { BadRequestError } = require("../utils/errors");
const { userResponse } = require("../utils/userResponse");
const { ONLINE_EXAM_API_URL, JWT_SECRET } = require("../config/serverConfig");
const jwt = require("jsonwebtoken");
const httpRequest = require("../utils/httpRequest");

class AuthController {
  static async loginUserViaApi(username, password) {
    return httpRequest("api/auth/login", "POST", { username, password });
  }

  static async loginUser(req, res) {
    const { username, password } = req.body;

    try {
      const response = await AuthController.loginUserViaApi(username, password);

      res.status(response.status);
      res.json(await response.json());
    } catch (error) {
      console.log("Login Failed, trying local login", error);
      let user = await redisService.fetchStudentLogin(username);

      if (user == null) {
        throw new BadRequestError("Invalid Username!");
      }

      const isPasswordValid = await bcrypt.compare(
        password,
        user.password.replace(/^\$2y(.+)$/i, "$2a$1")
      );

      if (!isPasswordValid) {
        throw new BadRequestError("Your password is wrong!");
      }

      const accessTokenPayload = {
        id: user.user_id,
        username: user.username,
        firstname: user.firstName,
        lastname: user.lastName,
      };

      const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
        expiresIn: "4h",
      });

      res.status(200);
      res.json({ user: userResponse(user), accessToken });
    }
  }
}

module.exports = AuthController;
