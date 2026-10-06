const { DevicePushToken } = require("../../models");

const registerPushToken = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { token, platform } = req.body;

    if (!token || !platform) {
      return res.status(400).json({ message: "token and platform are required" });
    }

    // A token belongs to a physical device, not a user — if the same
    // device previously registered under a different user (e.g. logout
    // then login as someone else), re-point it rather than erroring on
    // the unique constraint.
    const [deviceToken] = await DevicePushToken.upsert(
      { token, platform, user_id },
      { conflictFields: ["token"] },
    );

    return res.json({ message: "Push token registered", deviceToken });
  } catch (err) {
    console.error("Register Push Token Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

const removePushToken = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }

    await DevicePushToken.destroy({ where: { token, user_id } });

    return res.json({ message: "Push token removed" });
  } catch (err) {
    console.error("Remove Push Token Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = { registerPushToken, removePushToken };