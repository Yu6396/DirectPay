const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const hbs = require("handlebars");

const readAndSendEmail = async (data, views) => {
  const pathName = path.join(__dirname, `../views/${views}.hbs`);
  const source = fs.readFileSync(pathName, "utf8");
  const template = hbs.compile(source);
  const result = template(data);

  return result;
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_APP_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

async function sendEmail(mailTo, subject, data, views) {
  const html = await readAndSendEmail(data, views);

  const mailOptions = {
    from: process.env.GMAIL_APP_USER,
    to: mailTo,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent:", info.response);

    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

module.exports = sendEmail;
