const { Notification } = require("../../models");

/**
 * Creates a notification row. Call this:
 *   - From each pay* controller (payAirtime/payData/payElectricity/payTV)
 *     when the final status is "pending" or "failed" — the request is
 *     already synchronous at that point, so no need to wait for a webhook.
 *   - From the VTpass webhook handler, whenever a transaction transitions
 *     from "pending" to "success"/"failed" asynchronously — this is the
 *     case the client can never detect on its own, since the user may
 *     have already left the screen or closed the app.
 *
 * Success notifications are intentionally NOT created here by convention —
 * the payment screen itself already shows success inline, so a bell
 * notification would be redundant. Only call this for pending/failed.
 */
async function createNotification({
  user_id,
  title,
  message,
  type = "transaction",
  transaction_id = null,
  transaction_source = null,
}) {
  return Notification.create({
    user_id,
    title,
    message,
    type,
    transaction_id,
    transaction_source,
  });
}

module.exports = { createNotification };