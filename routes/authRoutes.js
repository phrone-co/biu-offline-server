const express = require("express");
const AuthController = require("../controllers/authController");
const asyncRouteHandler = require("./asyncRouteHandler");

const router = express.Router();

// Route to fetch student exam state
router.post("/login", asyncRouteHandler(AuthController.loginUser));

module.exports = router;
