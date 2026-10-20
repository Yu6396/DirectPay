
require("dotenv").config();

const SibApiV3Sdk = require("sib-api-v3-sdk");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

const renderTemplate = (data, templateName) => {
  const filePath = path.join(__dirname, `../views/${templateName}.hbs`);
  const source = fs.readFileSync(filePath, "utf8");
  return hbs.compile(source)(data);
};

async function sendEmail(to, subject, data, templateName) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is missing");
  }

  if (!process.env.BREVO_SENDER_EMAIL) {
    throw new Error("BREVO_SENDER_EMAIL is missing");
  }

  const htmlContent = renderTemplate(data, templateName);

  try {
    const result = await tranEmailApi.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || "FluxPay",
      },
      to: [{ email: to }],
      subject,
      htmlContent,
    });

    console.log("✅ Brevo email sent:", result.messageId || "accepted");
    return result;
  } catch (error) {
    console.error(
      "❌ Brevo API error:",
      error.response?.body || error.message || error
    );
    throw error;
  }
}

module.exports = sendEmail;
