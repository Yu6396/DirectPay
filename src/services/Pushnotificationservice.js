
const { DevicePushToken } = require("../../models");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendPushNotification({ user_id, title, message, data = {} }) {
  try {
    const tokens = await DevicePushToken.findAll({
      where: { user_id },
    });

    if (tokens.length === 0) {
      console.warn(
        `⚠️ No registered push tokens for user ${user_id}`
      );
      return;
    }

    console.log(
      `📲 Sending push notification to ${tokens.length} device(s) for user ${user_id}`
    );

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

    console.log("📨 Expo push HTTP status:", response.status);
    console.log("📨 Expo push response:", JSON.stringify(result));

    if (!response.ok) {
      console.error("❌ Expo rejected the push request");
      return;
    }

    if (Array.isArray(result?.data)) {
      const deadTokens = [];

      result.data.forEach((ticket, i) => {
        if (ticket.status === "error") {
          console.error(
            `❌ Expo push ticket ${i}:`,
            JSON.stringify(ticket)
          );

          if (ticket.details?.error === "DeviceNotRegistered") {
            deadTokens.push(tokens[i].token);
          }
        } else {
          console.log(`✅ Expo accepted push ticket ${i}`);
        }
      });

      if (deadTokens.length > 0) {
        await DevicePushToken.destroy({
          where: { token: deadTokens },
        });

        console.log(`🧹 Removed ${deadTokens.length} invalid push token(s)`);
      }
    }
  } catch (error) {
    console.error(
      "⚠️ Push notification send failed:",
      error.stack || error
    );
  }
}

module.exports = { sendPushNotification };
