// routes/pushToken.js
const express = require("express");
const router = express.Router();
const { UserAuthorization } = require("../middlewares/authorization");

const { registerPushToken, removePushToken } = require("../controllers/Pushtokencontroller");

router.post("/push-token", UserAuthorization, registerPushToken);
router.delete("/push-token", UserAuthorization, removePushToken);

module.exports = router;