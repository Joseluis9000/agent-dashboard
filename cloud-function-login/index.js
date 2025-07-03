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
    // ✅ POST: Login authentication
    if (req.method === 'POST') {
      const { email, password } = req.body;
      if (!email || !password) {
        res.set('Cache-Control', 'no-store');
        return res.status(400).json({ success: false, message: "Missing email or password." });
      }

      const loginResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'WEBSITE LOGINS!A1:Z1000',
      });

      const loginRows = loginResponse.data.values;
      if (!loginRows || loginRows.length === 0) {
        res.set('Cache-Control', 'no-store');
        return res.json({ success: false, message: 'Login sheet is empty.' });
      }

      const headers = loginRows[0].map(h => h.toLowerCase().trim());
      const emailIndex = headers.indexOf('emails');
      const passwordIndex = headers.indexOf('password');
      const titleIndex = headers.indexOf('title');
      const regionIndex = headers.indexOf('region');
      const region2Index = headers.indexOf('region2');
      const nameIndex = headers.indexOf('agentname');

      const userRow = loginRows.find(r =>
        r[emailIndex]?.toLowerCase().trim() === email.toLowerCase().trim() &&
        r[passwordIndex] === password
      );

      if (!userRow) {
        res.set('Cache-Control', 'no-store');
        return res.json({ success: false, message: 'Invalid email or password.' });
      }

      res.set('Cache-Control', 'no-store');
      return res.json({
        success: true,
        name: userRow[nameIndex] || '',
        role: userRow[titleIndex] || '',
        region: userRow[regionIndex] || '',
        region2: userRow[region2Index] || '',
        message: `${userRow[titleIndex]} login successful.`
      });
    }

    // ✅ GET: Fetch user data
    if (req.method === 'GET') {
      const email = req.query.email;
      if (!email) {
        res.set('Cache-Control', 'no-store');
        return res.status(400).json({ success: false, message: "Missing email parameter." });
      }

      const loginResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'WEBSITE LOGINS!A1:Z1000',
      });

      const loginRows = loginResponse.data.values;
      if (!loginRows || loginRows.length === 0) {
        res.set('Cache-Control', 'no-store');
        return res.json({ success: false, message: 'Login sheet is empty.' });
      }

      const headers = loginRows[0].map(h => h.toLowerCase().trim());
      const emailIndex = headers.indexOf('emails');
      const titleIndex = headers.indexOf('title');
      const regionIndex = headers.indexOf('region');
      const region2Index = headers.indexOf('region2');
      const nameIndex = headers.indexOf('agentname');

      const userRow = loginRows.find(r =>
        r[emailIndex]?.toLowerCase().trim() === email.toLowerCase().trim()
      );

      if (!userRow) {
        res.set('Cache-Control', 'no-store');
        return res.json({ success: false, message: 'User not found.' });
      }

      const userTitle = userRow[titleIndex];
      const userRegion = userRow[regionIndex];
      const userRegion2 = userRow[region2Index];
      const userName = userRow[nameIndex];

      // ✅ AGENT role
      if (userTitle === 'agent') {
        const fetchSheetData = async (range) => {
          const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
          const rows = response.data.values || [];
          if (rows.length === 0) return [];

          const headers = rows[0].map(h => h.toLowerCase().trim());
          const emailIdx = headers.indexOf('emails');

          return rows.slice(1).filter(r =>
            r[emailIdx]?.toLowerCase().trim() === email.toLowerCase().trim()
          ).map(r => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = r[i] || "";
            });
            return obj;
          });
        };

        const commissionData = await fetchSheetData('Weekly Commission!A1:Z1000');
        const commissionHistoryData = await fetchSheetData('Commission History!A1:Z1000');
        const violationsData = await fetchSheetData('SCANNING VIOLATIONS AND ARS!A1:Z1000');
        const svArHistoryData = await fetchSheetData('SV AND AR HISTORY!A1:Z1000');

        res.set('Cache-Control', 'no-store');
        return res.json({
          success: true,
          role: "agent",
          name: userName || '',
          commissionData: commissionData[0] || {},
          commissionHistoryData,
          violationsData,
          svArHistoryData
        });
      }

      // ✅ REGIONAL role
      if (userTitle === 'regional') {
        const fetchRegionalData = async (range) => {
          const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
          const rows = response.data.values || [];
          if (rows.length === 0) return [];

          const headers = rows[0].map(h => h.toLowerCase().trim());
          const regionIdx = headers.indexOf('region');

          return rows.slice(1).filter(r =>
            r[regionIdx] === userRegion || r[regionIdx] === userRegion2
          ).map(r => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = r[i] || "");
            return obj;
          });
        };

        const liveManagerDash = await fetchRegionalData('LIVE MANAGER DASH!A1:Z1000');
        const kpiArchive = await fetchRegionalData('KPI ARCHIVE 2025!A1:Z1000');

        res.set('Cache-Control', 'no-store');
        return res.json({
          success: true,
          role: "regional",
          name: userName || '',
          region: userRegion || '',
          region2: userRegion2 || '',
          liveManagerDash,
          kpiArchive
        });
      }

      // ✅ Add admin GET logic here if needed

      res.set('Cache-Control', 'no-store');
      return res.json({ success: false, message: `Role '${userTitle}' GET logic not implemented.` });
    }

    res.set('Cache-Control', 'no-store');
    res.status(405).send({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Error:', error);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

