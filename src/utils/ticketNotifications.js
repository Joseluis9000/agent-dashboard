// src/utils/ticketNotifications.js

/**
 * Generic helper to notify backend that a ticket event happened.
 * Backend is responsible for actually sending the emails.
 */

// 🎯 Use the full URL for the backend server
const EMAIL_SERVER_URL = 'http://localhost:4000/api/ticket-event'; // <-- FIXED URL

export const notifyTicketEvent = async (eventType, payload) => {
  try {
    const response = await fetch(EMAIL_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,       // "created" or "completed"
        ...payload,      // ticket + submitter info
      }),
    });
    
    // Optional: Log success/failure status from the server
    if (!response.ok) {
        console.error(`Email server responded with status: ${response.status}`);
    } else {
        console.log('Successfully requested email notification from server.');
    }
  } catch (error) {
    // This catches network errors (e.g., server isn't running)
    console.error('Failed to send ticket email notification. Check if Node.js server is running on port 4000.', error);
  }
};
