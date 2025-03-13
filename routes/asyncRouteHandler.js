const { AppError } = require("../utils/errors");

function asyncRouteHandler(controller) {
  return (req, res, next) => {
    (async () => {
      try {
        await controller(req, res, next);
      } catch (error) {
        if (error instanceof AppError) {
          next(error);
          return;
        }

        throw error;
      }
    })();
  };
}

module.exports = asyncRouteHandler;
