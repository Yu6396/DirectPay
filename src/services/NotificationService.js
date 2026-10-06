const { Notification } = require("../../models");
const { sendPushNotification } = require("./pushNotificationService");

/**
 * Creates a notification row AND sends a push notification to the user's
 * registered devices. Call this:
 *   - From each pay* controller (payAirtime/payData/payElectricity/payTV)
 *     when the final status is "pending" or "failed" — the request is
 *     already synchronous at that point, so no need to wait for a webhook.
 *   - From the requery/refund cron jobs, whenever a transaction transitions
 *     from "pending" to "success"/"failed" asynchronously — this is the
 *     case the client can never detect on its own, since the user may
 *     have already left the screen or closed the app entirely. This is
 *     also the exact case push delivery matters most for.
 *
 * Success notifications are intentionally NOT created here by convention —
 * the payment screen itself already shows success inline, so a bell
 * notification (and a push) would be redundant. Only call this for
 * pending/failed.
 *
 * Push failures never throw here — see pushNotificationService.js — so a
 * bad token or Expo outage can never break the caller's main flow.
 */
async function createNotification({
  user_id,
  title,
  message,
  type = "transaction",
  transaction_id = null,
  transaction_source = null,
}) {
  const notification = await Notification.create({
    user_id,
    title,
    message,
    type,
    transaction_id,
    transaction_source,
  });

  await sendPushNotification({
    user_id,
    title,
    message,
    data: {
      notificationId: notification.notification_id,
      transactionId: transaction_id,
      transactionSource: transaction_source,
    },
  });

  return notification;
}

module.exports = { createNotification };