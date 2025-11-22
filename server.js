// server.js
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 587),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendEmail({ to, subject, text }) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
  });
}

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

app.post('/api/ticket-email', async (req, res) => {
  try {
    const {
      eventType,
      ticketId,
      office,
      urgency,
      category,
      description,
      createdAt,
      completedAt,
      submitterEmail,
      supervisorName,
      completedBy,
    } = req.body;

    const createdStr = createdAt ? new Date(createdAt).toLocaleString() : 'N/A';
    const completedStr = completedAt ? new Date(completedAt).toLocaleString() : 'N/A';

    const adminEmails = getAdminEmails();

    if (eventType === 'created') {
      if (submitterEmail) {
        await sendEmail({
          to: submitterEmail,
          subject: `Ticket #${ticketId} Submitted`,
          text: `
Hi ${supervisorName || ''},

Your ticket has been submitted.

Ticket #: ${ticketId}
Office: ${office}
Urgency: ${urgency}
Category: ${category}
Submitted: ${createdStr}

Description:
${description}

We will notify you when it is completed.
          `.trim(),
        });
      }

      if (adminEmails.length) {
        await sendEmail({
          to: adminEmails,
          subject: `NEW Ticket #${ticketId} - ${office}`,
          text: `
A new ticket has been submitted.

Ticket #: ${ticketId}
Office: ${office}
Urgency: ${urgency}
Category: ${category}
Submitted by: ${submitterEmail}
Supervisor: ${supervisorName}
Submitted: ${createdStr}

Description:
${description}
          `.trim(),
        });
      }
    }

    if (eventType === 'completed') {
      if (submitterEmail) {
        await sendEmail({
          to: submitterEmail,
          subject: `Ticket #${ticketId} Completed`,
          text: `
Your ticket is now completed.

Ticket #: ${ticketId}
Office: ${office}
Category: ${category}
Submitted: ${createdStr}
Completed: ${completedStr}
Completed by: ${completedBy}

Description:
${description}
          `.trim(),
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Email failed' });
  }
});

app.listen(PORT, () =>
  console.log(`Email notification server running at http://localhost:${PORT}`)
);
