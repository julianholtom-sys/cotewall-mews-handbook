const nodemailer = require("nodemailer");

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      (process.env.SMTP_FROM || process.env.SMTP_USER)
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST || "mail.infomaniak.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "") === "1" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!smtpConfigured()) {
    const err = new Error("SMTP is not configured");
    err.code = "NO_SMTP";
    throw err;
  }
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "directors@cotewall-mews.ltd";
  const transport = createTransport();
  await transport.sendMail({
    from,
    to: toEmail,
    subject: "Cotewall Mews — reset your document library password",
    text:
      "You asked to reset your Cotewall Mews Society documents password.\n\n" +
      "Open this link within one hour to choose a new password (minimum 12 characters):\n\n" +
      resetUrl +
      "\n\nIf you did not request this, you can ignore this email.\n",
    html:
      "<p>You asked to reset your Cotewall Mews Society documents password.</p>" +
      "<p><a href=\"" +
      resetUrl +
      "\">Choose a new password</a> (link valid for one hour; minimum 12 characters).</p>" +
      "<p>If you did not request this, you can ignore this email.</p>",
  });
}

module.exports = {
  smtpConfigured,
  sendPasswordResetEmail,
};
