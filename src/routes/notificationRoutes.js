const express = require("express");
const router = express.Router();
const {
   getUserNotifications,
 markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} = require("../controllers/userController");
const { UserAuthorization } = require("../middlewares/authorization");

router.get("/notifications",UserAuthorization, getUserNotifications);
router.patch("/notifications/:id/read", UserAuthorization, markNotificationRead);
router.patch("/notifications/read-all", UserAuthorization, markAllNotificationsRead);
router.delete("/notifications/:id", UserAuthorization, deleteNotification);
router.delete("/notifications", UserAuthorization, clearAllNotifications);

module.exports = router;
