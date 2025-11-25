import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 2. LOGIC: Get data from the website
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
    
    // FIELDS FOR 'COMPLETED' EVENT
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

  // 3. LOGIC: Check for missing data
  if (!eventType || !ticketId) {
    return res.status(400).send('Missing eventType or ticketId');
  }

  // 4. SETUP: Create the Email Transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 5. LOGIC: Admin Emails
  // (Make sure to add ADMIN_EMAILS to your Vercel Environment Variables!)
  const adminEmails = (process.env.ADMIN_EMAILS || 'diego.funes@fiestainsurance.com') // Default fallback if var missing
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  // --- HTML HELPERS ---
  
  // Vercel Fix: We can't attach files from disk easily. 
  // We point to the live image URL on your website instead.
  // This uses your current website domain dynamically.
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host; 
  const logoUrl = `${protocol}://${host}/gp-letterhead-logo.jpg`;

  const tableRow = (label, value) => `
      <tr>
          <td style="padding: 4px 0; font-weight: bold; width: 150px; vertical-align: top;">${label}:</td>
          <td style="padding: 4px 0; vertical-align: top;">${value || 'N/A'}</td>
      </tr>
  `;

  const baseHtmlHeader = `
      <div style="text-align: center; padding-bottom: 20px;">
          <img src="${logoUrl}" alt="Agency Logo" style="max-width: 350px; height: auto;">
          <hr style="border: 0; border-top: 1px solid #ddd; margin-top: 20px;">
      </div>
      <div style="padding: 10px 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  `;
  
  const baseHtmlFooter = `
      </div>
  `;

  // --- DETERMINE RECIPIENTS AND SUBJECT ---
  let recipients;
  let subject;
  let htmlBody; 

  if (eventType === 'completed') {
      subject = `✅ Completed: Ticket #${ticketId} - ${office || 'Unknown Office'}`;
      recipients = submitterEmail; // Send to the person who asked
  } else {
      subject = `🚨 New Ticket #${ticketId} - ${office || 'Unknown Office'} - ${urgency || 'Medium'}`;
      recipients = adminEmails; // Send to Admins
  }

  // --- CONSTRUCT HTML BODY ---
  if (eventType === 'completed') {
      // --- Completed Email ---
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
          <p style="margin-top: 30px; font-size: 12px; color: #6c757d;">Thank you for using the dashboard.</p>
      ` + baseHtmlFooter;

  } else {
      // --- New Ticket Email ---
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
          <p style="margin-top: 30px; font-size: 12px; color: #6c757d;">Please log into the dashboard to assign.</p>
      ` + baseHtmlFooter;
  }

  // 6. SEND EMAIL
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients,
      subject: subject,
      html: htmlBody,
      // We removed 'attachments' because Vercel can't find the file on disk easily.
      // We are using the <img src="${logoUrl}"> method instead.
    });

    console.log('Email sent:', info.messageId);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
}