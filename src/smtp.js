const nodemailer = require('nodemailer');

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.purelymail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER || 'kai@kdn.agency',
    pass: process.env.EMAIL_PASS || 'gdb_eky2xjb9XBV9gzy'
  }
};

const transporter = nodemailer.createTransport(SMTP_CONFIG);

/**
 * Send email from agent's mailbox
 * @param {string} mailboxId - Agent's mailbox ID (for From address)
 * @param {object} options - { to, subject, body, html }
 */
async function sendEmail(mailboxId, { to, subject, body, html }) {
  const from = `kai+${mailboxId}@kdn.agency`;
  
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: html || undefined
  });
  
  return {
    messageId: info.messageId,
    from,
    to,
    subject
  };
}

// Verify connection on startup
async function verifySmtp() {
  try {
    await transporter.verify();
    console.log('SMTP connection verified');
    return true;
  } catch (err) {
    console.error('SMTP verification failed:', err.message);
    return false;
  }
}

module.exports = { sendEmail, verifySmtp };
