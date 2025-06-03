const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/serverConfig");
const { UnauthorizedError } = require("../utils/errors");

const BEARER_PREFIX = "Bearer ";

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.get("authorization");

    if (header && header.startsWith(BEARER_PREFIX)) {
      const authorizationKey = header.substring(
        BEARER_PREFIX.length,
        header.length
      );

      console.log(authorizationKey);

      try {
        const tokenData = jwt.verify(authorizationKey, JWT_SECRET);

        req.session = tokenData;

        next();
        return;
      } catch (error) {
        throw new UnauthorizedError("Token expired or invalid");
      }
    }

    throw new UnauthorizedError();
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;
