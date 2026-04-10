// server.js (Complete File)

require('dotenv').config({ path: '.env.server' });

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path'); // Node.js path module for file handling

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check
app.get('/', (req, res) => {
  res.send('Email notification server is running');
});

// Helper: build transporter only once
function createTransporter() {
  console.log('[server] creating transporter with user:', process.env.EMAIL_USER);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: false, // TLS via STARTTLS for port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// Main endpoint the React app calls
app.post('/api/ticket-event', async (req, res) => {
  console.log('======================================');
  console.log('[server] POST /api/ticket-event body:', JSON.stringify(req.body, null, 2));

  const {
    eventType,
    ticketId,
    office,
    urgency,
    category,
    description,
    createdAt,
    submitterEmail,
    submitterName,
    
    // 🚀 FIELDS FOR 'COMPLETED' EVENT
    orderStatus,
    qtyApproved,
    qtyOrdered,
    vendor,
    trackingNumber,
    expectedDelivery,
    adminNotes,
    completedAt,
    completedBy,
  } = req.body || {};

  if (!eventType || !ticketId) {
    console.error('[server] Missing eventType or ticketId');
    return res.status(400).send('Missing eventType or ticketId');
  }

  try {
    const transporter = createTransporter();

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    if (!adminEmails.length) {
      console.error('[server] No ADMIN_EMAILS configured');
      return res.status(500).send('No admin emails configured');
    }

    // --- 1. CONFIGURATION FOR HTML EMAIL & LOGO ---
    // ✅ CORRECTED PATH: server.js is in agent-dashboard, logo is in agent-dashboard/public
    const logoFilePath = path.join(__dirname, 'public', 'gp-letterhead-logo.jpg');
    const logoCID = 'uniqueLogo@cid';
    
    // Helper for creating a clean table row
    const tableRow = (label, value) => `
        <tr>
            <td style="padding: 4px 0; font-weight: bold; width: 150px; vertical-align: top;">${label}:</td>
            <td style="padding: 4px 0; vertical-align: top;">${value || 'N/A'}</td>
        </tr>
    `;

    // Base HTML header for all emails
    const baseHtmlHeader = `
        <div style="text-align: center; padding-bottom: 20px;">
            <img src="cid:${logoCID}" alt="Agency Logo" style="max-width: 350px; height: auto;">
            <hr style="border: 0; border-top: 1px solid #ddd; margin-top: 20px;">
        </div>
        <div style="padding: 10px 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    `;
    
    // Base HTML footer
    const baseHtmlFooter = `
        </div>
    `;

    // --- 2. DETERMINE RECIPIENTS AND SUBJECT ---
    let recipients;
    let subject;
    let htmlBody; 
    
    if (eventType === 'completed') {
        subject = `✅ Completed: Ticket #${ticketId} - ${office || 'Unknown Office'}`;
    } else {
        subject = `🚨 New Ticket #${ticketId} - ${office || 'Unknown Office'} - ${urgency || 'Medium'}`;
    }

    if (eventType === 'completed' && submitterEmail) {
        recipients = submitterEmail;
    } else {
        recipients = adminEmails;
    }

    // --- 3. CONSTRUCT HTML BODY BASED ON eventType ---
    if (eventType === 'completed') {
        // --- Completed Email (Sent to Submitter) ---
        
        const orderDetailsTable = (orderStatus || vendor || qtyApproved || trackingNumber) ? `
            <h3 style="color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px;">📦 Order Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                ${tableRow('Order Status', `<span style="color: ${orderStatus === 'Approved' ? '#28a745' : '#ffc107'}; font-weight: bold;">${orderStatus}</span>`)}
                ${tableRow('Vendor', vendor)}
                ${tableRow('Qty Approved', qtyApproved)}
                ${tableRow('Qty Ordered', qtyOrdered)}
                ${tableRow('Tracking #', trackingNumber)}
                ${tableRow('Expected Delivery', expectedDelivery)}
            </table>
        ` : '';

        const notesSection = adminNotes ? `
            <h3 style="color: #6c757d; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;">📝 Admin Notes / Resolution Log</h3>
            <div style="background-color: #f8f9fa; border-left: 3px solid #6c757d; padding: 10px; font-size: 14px; white-space: pre-wrap;">
                ${adminNotes}
            </div>
        ` : '';

        htmlBody = baseHtmlHeader + `
            <p>Dear <strong style="color: #007bff;">${submitterName || 'Supervisor'}</strong>,</p>
            <p>This is a notification that your ticket <strong style="color: #28aa45;">#${ticketId}</strong> has been successfully <strong>COMPLETED</strong> and closed by our team.</p>

            <h3 style="color: #343a40; border-bottom: 1px solid #eee; padding-bottom: 5px;">🎫 Ticket Summary</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                ${tableRow('Ticket ID', ticketId)}
                ${tableRow('Category', category)}
                ${tableRow('Urgency', urgency)}
                ${tableRow('Office', office)}
                ${tableRow('Completed By', completedBy)}
                ${tableRow('Completed At', completedAt ? new Date(completedAt).toLocaleString() : 'N/A')}
            </table>
            
            ${orderDetailsTable}

            ${notesSection}

            <h3 style="color: #343a40; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;">Original Request Description</h3>
            <div style="background-color: #fff3cd; border-left: 3px solid #ffc107; padding: 10px; font-size: 14px; white-space: pre-wrap;">
                ${description}
            </div>
            <p style="margin-top: 30px; font-size: 12px; color: #6c757d;">Thank you for using the dashboard. Please contact support if you have any questions.</p>
        ` + baseHtmlFooter;

    } else {
        // --- New Ticket Email (Sent to Admin) ---
        htmlBody = baseHtmlHeader + `
            <h2 style="color: #dc3545;">🚨 NEW TICKET ALERT: #${ticketId}</h2>
            <p>A new ticket has been **CREATED** and is awaiting assignment and review.</p>

            <h3 style="color: #343a40; border-bottom: 1px solid #eee; padding-bottom: 5px;">Submittal Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                ${tableRow('Ticket ID', `<strong style="font-size: 16px;">${ticketId}</strong>`)}
                ${tableRow('Urgency', `<span style="color: ${urgency === 'High' ? 'red' : 'orange'}; font-weight: bold;">${urgency}</span>`)}
                ${tableRow('Category', category)}
                ${tableRow('Office', office)}
                ${tableRow('Supervisor', submitterName)}
                ${tableRow('Email', submitterEmail)}
                ${tableRow('Created At', createdAt)}
            </table>

            <h3 style="color: #343a40; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;">Request Description</h3>
            <div style="background-color: #f8f9fa; border-left: 3px solid #007bff; padding: 10px; font-size: 14px; white-space: pre-wrap;">
                ${description}
            </div>
            <p style="margin-top: 30px; font-size: 12px; color: #6c757d;">Please log into the dashboard to assign and process this request promptly.</p>
        ` + baseHtmlFooter;
    }


    console.log('[server] Sending email...');
    console.log('[server] To:', Array.isArray(recipients) ? recipients.join(', ') : recipients);
    console.log('[server] Subject:', subject);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: recipients, // Uses the conditionally set recipient(s)
      subject,
      html: htmlBody, // Send HTML content
      attachments: [{
          filename: 'logo.jpg',
          path: logoFilePath, // Corrected Path to the image file
          cid: logoCID // Content ID referenced in the HTML
      }],
    });

    console.log('[server] Email sent successfully. MessageId:', info.messageId);
    return res.status(200).send('Email sent');
  } catch (err) {
    console.error('[server] Error sending email:', err);
    return res.status(500).send('Error sending email');
  }
});

// 🔥 This keeps the process running
app.listen(PORT, () => {
  console.log(`Email notification server listening on http://localhost:${PORT}`);
});