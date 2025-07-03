import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function RegionalSVARPage() {
  const [arsvData, setArsvData] = useState([]);
  const [commissionData, setCommissionData] = useState([]);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const userEmail = localStorage.getItem('userEmail');
      if (!userEmail) {
        navigate('/');
        return;
      }

      try {
        const res = await fetch(`https://script.google.com/macros/s/AKfycbw7ubzHdSo505A2Q2F9ij_2n1WTSX0NcuR_1DIO5L3pbcOQGZMUFx2KLjXgp58qESxP/exec?email=${userEmail}`);
        const data = await res.json();
        if (data.success) {
          setArsvData(data.arsvData || []);
          setCommissionData(data.commissionData || []);
          setWeekStart(data.week_start_date || '');
          setWeekEnd(data.week_end_date || '');
        } else {
          alert(data.error || "Failed to fetch data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Network error.");
      }
    };

    fetchData();
  }, [navigate]);

  const formatCurrency = (val) =>
    !val || isNaN(val) ? "$0.00" : Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const getColor = (value) => {
    const num = Number(value);
    if (isNaN(num) || value === "No Commission") return 'red';
    return num < 500 ? 'red' : 'green';
  };

  const totalARFees = arsvData.slice(1).reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
  const totalSVFees = arsvData.slice(1).reduce((sum, row) => sum + (Number(row[3]) || 0), 0);
  const totalCommission = commissionData.slice(1).reduce((sum, row) => sum + (Number(row[1]) || 0), 0);

  const thStyle = { border: '1px solid #ddd', padding: '5px', background: '#f0f0f0' };
  const tdStyle = { border: '1px solid #ddd', padding: '5px' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: '#d32f2f', color: '#fff', width: '220px', padding: '20px' }}>
        <h3>Regional</h3>
        <button onClick={() => navigate('/regional-dashboard')} style={{ ...sidebarButtonStyle, backgroundColor: '#fff', color: '#d32f2f' }}>Dashboard</button>
        <button onClick={() => navigate('/regional-svar')} style={sidebarButtonStyle}>Agent Commissions</button>
        <button onClick={() => { localStorage.removeItem('userEmail'); navigate('/'); }} style={{ ...sidebarButtonStyle, backgroundColor: '#fcef0c', color: '#000' }}>Logout</button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, backgroundColor: '#f9f9f9', padding: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          {/* Region Agent AR/SV Fees Box */}
          <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '5px', padding: '15px' }}>
            <h3>Region Agent AR/SV Fees</h3>
            <p>{weekStart} – {weekEnd}</p>
            <p><strong>AR Fees Total:</strong> {formatCurrency(totalARFees)}</p>
            <p><strong>SV Fees Total:</strong> {formatCurrency(totalSVFees)}</p>
          </div>

          {/* Region Agent Commission Box */}
          <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '5px', padding: '15px' }}>
            <h3>Region Agent Commission</h3>
            <p>{weekStart} – {weekEnd}</p>
            <p><strong>Commission Total:</strong> {formatCurrency(totalCommission)}</p>
          </div>
        </div>

        {/* AR/SV Data Table */}
        <h3>Agent AR/SV Breakdown</h3>
        {arsvData.length > 1 ? (
          <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{arsvData[0].map((header, idx) => <th key={idx} style={thStyle}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {arsvData.slice(1).map((row, idx) => (
                <tr key={idx}>{row.map((cell, i) => <td key={i} style={tdStyle}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No AR/SV data found.</p>
        )}

        {/* Commission Data Table */}
        <h3 style={{ marginTop: '30px' }}>Agent Commission Breakdown</h3>
        {commissionData.length > 1 ? (
          <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Agent Name</th>
                <th style={thStyle}>Region</th>
                <th style={thStyle}>Week Start</th>
                <th style={thStyle}>Week End</th>
                <th style={thStyle}>NB/RW Fees</th>
                <th style={thStyle}>EN Fees</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Gross Pay</th>
                <th style={thStyle}>Total NBs</th>
                <th style={thStyle}>NB Corp Fee</th>
                <th style={thStyle}>EN Corp Fee</th>
                <th style={thStyle}>Referrals/Pay Out</th>
                <th style={thStyle}>Total (After Fees)</th>
                <th style={thStyle}>Re-Issue and Renewals</th>
                <th style={thStyle}>Total Rev After Deductions</th>
                <th style={thStyle}>Commission Tier</th>
                <th style={thStyle}>Commission</th>
                <th style={thStyle}>Total Violations</th>
                <th style={thStyle}>Total Commission</th>
                <th style={thStyle}>AR 4+ Weeks Old</th>
                <th style={thStyle}>AR 3 Weeks Old</th>
                <th style={thStyle}>AR 2 Week Old</th>
                <th style={thStyle}>AR Current Week</th>
                <th style={thStyle}>SV 4+ Weeks Old</th>
                <th style={thStyle}>SV 3 Weeks Old</th>
                <th style={thStyle}>SV 2 Week Old</th>
                <th style={thStyle}>SV Current Week</th>
              </tr>
            </thead>
            <tbody>
              {commissionData.slice(1).map((item, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{item[0]}</td>
                  <td style={tdStyle}>{item[1]}</td>
                  <td style={tdStyle}>{item[2].split('T')[0]}</td>
                  <td style={tdStyle}>{item[3].split('T')[0]}</td>
                  <td style={tdStyle}>{formatCurrency(item[7])}</td>
                  <td style={tdStyle}>{formatCurrency(item[8])}</td>
                  <td style={tdStyle}>{formatCurrency(item[15])}</td>
                  <td style={tdStyle}>{formatCurrency(item[11])}</td>
                  <td style={tdStyle}>{item[6]}</td>
                  <td style={tdStyle}>{formatCurrency(item[19])}</td>
                  <td style={tdStyle}>{formatCurrency(item[20])}</td>
                  <td style={tdStyle}>{formatCurrency(item[21])}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: getColor(item[28]) }}>{formatCurrency(item[28])}</td>
                  <td style={tdStyle}>{formatCurrency(item[29])}</td>
                  <td style={tdStyle}>{formatCurrency(item[31])}</td>
                  <td style={tdStyle}>{item[33]}</td>
                  <td style={tdStyle}>{formatCurrency(item[34])}</td>
                  <td style={tdStyle}>{formatCurrency(item[41])}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: item[42] === "No Bonus" || Number(item[42]) < 0 ? 'red' : 'green' }}>
                    {item[42] === "No Bonus" ? item[42] : formatCurrency(item[42])}
                  </td>
                  <td style={tdStyle}>{item[35]}</td>
                  <td style={tdStyle}>{item[36]}</td>
                  <td style={tdStyle}>{item[37]}</td>
                  <td style={tdStyle}>{item[38]}</td>
                  <td style={tdStyle}>{item[39]}</td>
                  <td style={tdStyle}>{item[40]}</td>
                  <td style={tdStyle}>{item[41]}</td>
                  <td style={tdStyle}>{item[42]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No commission data found.</p>
        )}
      </div>
    </div>
  );
}

const sidebarButtonStyle = {
  display: "block",
  width: "100%",
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "none",
  padding: "10px",
  borderRadius: "5px",
  cursor: "pointer",
  marginBottom: "10px",
  textAlign: "center",
  fontWeight: "bold"
};

export default RegionalSVARPage;

