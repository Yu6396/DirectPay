// routes/pushToken.js
const express = require("express");
const router = express.Router();
const { UserAuthorization } = require("../middlewares/authorization");

const { registerPushToken, removePushToken } = require("../controllers/Pushtokencontroller");

router.post("/user/push-token", UserAuthorization, registerPushToken);
router.delete("/user/push-token", UserAuthorization, removePushToken);

module.exports = router;