// services/NotificationService.js
const { Notification } = require("../../models");

/**
 * Creates a notification for a user.
 *
 * @param {string} userId
 * @param {string} title - required by the model, was previously missing
 * @param {string} message
 * @param {object} [options]
 * @param {"transaction"|"security"|"promotion"} [options.type="transaction"]
 * @param {string|null} [options.transactionId]
 * @param {"wallet"|"bill"|null} [options.transactionSource]
 */
async function createNotification(userId, title, message, options = {}) {
  const {
    type = "transaction",
    transactionId = null,
    transactionSource = null,
  } = options;

  return Notification.create({
    user_id: userId,
    title,
    message,
    type,
    transaction_id: transactionId,
    transaction_source: transactionSource,
    status: "unread",
  });
}

module.exports = { createNotification };