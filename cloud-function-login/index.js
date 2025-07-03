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
    // ✅ POST: Login authentication or RegionalTardyWarning
    if (req.method === 'POST') {
      const { email, password, tardyWarningData } = req.body;

      if (tardyWarningData) {
        // ✅ Handle RegionalTardyWarning submission
        const sheet = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'AgentTardyWarning!A1:I1',
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[
              tardyWarningData.date,
              tardyWarningData.agentName,
              tardyWarningData.agentEmail,
              tardyWarningData.region,
              tardyWarningData.pointType,
              tardyWarningData.subType,
              tardyWarningData.points,
              tardyWarningData.notes,
              tardyWarningData.issuedBy
            ]]
          }
        });

        return res.json({ success: true, message: 'Agent tardy/warning recorded successfully.' });
      }

      // ✅ Login authentication
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Missing email or password." });
      }

      const loginResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'WEBSITE LOGINS!A1:Z1000',
      });

      const loginRows = loginResponse.data.values || [];
      if (loginRows.length === 0) {
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
        return res.json({ success: false, message: 'Invalid email or password.' });
      }

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
        return res.status(400).json({ success: false, message: "Missing email parameter." });
      }

      const loginResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'WEBSITE LOGINS!A1:Z1000',
      });

      const loginRows = loginResponse.data.values || [];
      if (loginRows.length === 0) {
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
        return res.json({ success: false, message: 'User not found.' });
      }

      const userTitle = userRow[titleIndex];
      const userRegion = userRow[regionIndex];
      const userRegion2 = userRow[region2Index];
      const userName = userRow[nameIndex];

      // ✅ AGENT role data fetching
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
            headers.forEach((h, i) => obj[h] = r[i] || "");
            return obj;
          });
        };

        const commissionData = await fetchSheetData('Weekly Commission!A1:Z1000');
        const commissionHistoryData = await fetchSheetData('Commission History!A1:Z1000');
        const violationsData = await fetchSheetData('SCANNING VIOLATIONS AND ARS!A1:Z1000');
        const svArHistoryData = await fetchSheetData('SV AND AR HISTORY!A1:Z1000');

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

      // ✅ REGIONAL role data fetching
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
        const kpiArchive = await fetchRegionalData('KPI ARCHIVE!A1:Z1000');

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

      // ✅ Placeholder for admin or other roles
      return res.json({ success: false, message: `Role '${userTitle}' GET logic not implemented.` });
    }

    // ✅ Method not allowed
    res.status(405).send({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

