// src/utils/ticketNotifications.js

/**
 * Generic helper to notify backend that a ticket event happened.
 * Backend is responsible for actually sending the emails.
 *
 * @param {"created" | "completed"} eventType
 * @param {Object} payload - info about the ticket & submitter
 */
export const notifyTicketEvent = async (eventType, payload) => {
  try {
    await fetch('/api/ticket-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,       // "created" or "completed"
        ...payload,      // ticket + submitter info
      }),
    });
  } catch (error) {
    console.error('Failed to send ticket email notification', error);
  }
};
