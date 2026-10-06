const { DevicePushToken } = require("../../models");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Sends a push notification to every device registered for a user.
 * Expo's push API accepts up to 100 messages per request; we're nowhere
 * near that volume per user, so a single request per call is fine.
 *
 * Never throws — a push failure should never break the caller's main flow
 * (payment processing, refunds, etc.), matching the same isolation pattern
 * used for email/notification calls elsewhere in this codebase.
 */
async function sendPushNotification({ user_id, title, message, data = {} }) {
  try {
    const tokens = await DevicePushToken.findAll({
      where: { user_id },
    });

    if (tokens.length === 0) {
      return; // user has no registered devices — nothing to do
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default",
      title,
      body: message,
      data,
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    // Expo returns one ticket per message, in the same order. A
    // DeviceNotRegistered error means the token is dead (app uninstalled,
    // etc.) — clean those up so we stop trying to push to them.
    if (Array.isArray(result?.data)) {
      const deadTokens = [];

      result.data.forEach((ticket, i) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          deadTokens.push(tokens[i].token);
        }
      });

      if (deadTokens.length > 0) {
        await DevicePushToken.destroy({ where: { token: deadTokens } });
      }
    }
  } catch (error) {
    console.error("⚠️ Push notification send failed:", error.message);
  }
}

module.exports = { sendPushNotification };