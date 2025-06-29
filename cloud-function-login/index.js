const { google } = require('googleapis');

exports.loginHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = '1ih2vCXRj5jm6UjgTozwKlWt8dexLArdrxWvd7A82KYU';

  try {
    if (req.method === 'POST') {
      const { email, password } = req.body;

      if (!email  !password) {
        return res.status(400).json({ success: false, message: "Missing email or password." });
      }

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Weekly Commission!A1:AU1000',
      });

      const rows = response.data.values;
      if (!rows  rows.length === 0) {
        return res.json({ success: false, message: 'No data found.' });
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const emailIndex = headers.indexOf('emails');
      const passwordIndex = headers.indexOf('password');

      if (emailIndex === -1  passwordIndex === -1) {
        return res.json({ success: false, message: 'Missing columns in sheet.' });
      }

      let isAuthenticated = false;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[emailIndex] === email && row[passwordIndex] === password) {
          isAuthenticated = true;
          break;
        }
      }

      return res.json({
        success: isAuthenticated,
        message: isAuthenticated ? "Login successful." : "Invalid email or password."
      });

    } else if (req.method === 'GET') {
      const email = req.query.email;
      if (!email) {
        return res.status(400).json({ success: false, message: "Missing email parameter." });
      }

      // Fetch Weekly Commission data
      const commissionResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Weekly Commission!A1:AU1000',
      });

      const commissionRows = commissionResponse.data.values;
      let commissionData = null;
      if (commissionRows && commissionRows.length > 0) {
        const headers = commissionRows[0];
        const userRow = commissionRows.find(r => r[headers.indexOf('emails')] === email);
        if (userRow) {
          commissionData = {};
          headers.forEach((h, i) => {
            commissionData[h] = userRow[i];
          });
        }
      }

      // Fetch Scanning Violations & ARs data
      const violationsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'SCANNING VIOLATIONS AND ARS!A1:Z1000',
      });

      const violationsRows = violationsResponse.data.values;
      let violationsData = [];
      if (violationsRows && violationsRows.length > 0) {
        const headers = violationsRows[0];
        violationsData = violationsRows
          .filter((r, i) => i !== 0 && r[headers.indexOf('emails')] === email)
          .map(r => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = r[i];
            });
            return obj;
          });
      }

      // Fetch Commission History data
      const commissionHistoryResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Commission History!A1:AU1000',
      });

      const commissionHistoryRows = commissionHistoryResponse.data.values;
      let commissionHistory = [];
      if (commissionHistoryRows && commissionHistoryRows.length > 0) {
        const headers = commissionHistoryRows[0];
        commissionHistory = commissionHistoryRows
          .filter((r, i) => i !== 0 && r[headers.indexOf('emails')] === email)
          .map(r => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = r[i];
            });
            return obj;

});
      }

      // Fetch SV AND AR HISTORY data
      const svHistoryResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'SV AND AR HISTORY!A1:Z1000',
      });

      const svHistoryRows = svHistoryResponse.data.values;
      let svHistory = [];
      if (svHistoryRows && svHistoryRows.length > 0) {
        const headers = svHistoryRows[0];
        svHistory = svHistoryRows
          .filter((r, i) => i !== 0 && r[headers.indexOf('emails')] === email)
          .map(r => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = r[i];
            });
            return obj;
          });
      }

      return res.json({
        success: true,
        commissionData: commissionData  {},
        violationsData: violationsData,
        commissionHistory: commissionHistory,
        svHistory: svHistory,
      });

    } else {
      res.status(405).send({ success: false, message: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};
