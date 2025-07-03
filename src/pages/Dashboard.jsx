import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function formatCurrency(value) {
  const num = Number(String(value).replace(/[$,]/g, '')) || 0;
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function Dashboard() {
  const navigate = useNavigate();
  const [commissionData, setCommissionData] = useState(null);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [showQualifications, setShowQualifications] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(0);

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`https://script.google.com/macros/s/AKfycbySrsUGSUFtKg9vwQujCQgOfNl-QTOp2D5MM-ADXY4OmSCGQ3lEk8BC_STDrByL95K4/exec?email=${userEmail}`);
        const data = await res.json();

        if (data.success) {
          setCommissionData(data.commissionData);
          setCommissionHistory(data.commissionHistoryData || []);
        } else {
          alert("Failed to fetch data.");
          navigate('/');
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Network error.");
      }
    };
    fetchData();
  }, [navigate]);

  if (!commissionData) return <div>Loading...</div>;

  const name = commissionData.agentname ? commissionData.agentname.split(" ")[0] : "Agent";

  const getColor = (value, threshold = 0) => {
    const num = Number(value);
    if (isNaN(num) || value === "No Bonus") return 'red';
    return num < threshold ? 'red' : 'green';
  };

  const chartLabels = commissionHistory.map(item =>
    `${item.week_start_date.split('T')[0]} - ${item.week_end_date.split('T')[0]}`
  );

  const chartValues = commissionHistory.map(item =>
    Number(item.commissionafterarfeescanningviolations) || 0
  );

  const totalYTD = chartValues.reduce((a, b) => a + b, 0);

  const carryoverBox = (label, value) => (
    <div style={{ flex: 1, textAlign: 'center', border: '1px solid #ddd', padding: '10px', borderRadius: '5px' }}>
      <strong>{label}</strong>
      <div>{value || 0}</div>
    </div>
  );

  const selectedItem = commissionHistory[selectedWeek] || {};

  return (
    <div style={{ display: 'flex', fontFamily: 'Arial, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "20px", width: "220px" }}>
        <img src="/fiesta-logo.png" alt="Logo" style={{ width: "100%", marginBottom: "20px" }} />
        <button onClick={() => navigate('/dashboard')} style={sidebarButtonStyle}>Dashboard</button>
        <button onClick={() => navigate('/sv-ar')} style={sidebarButtonStyle}>Scanning Violations & AR's</button>
        <button onClick={() => { localStorage.removeItem('userEmail'); navigate('/'); }} style={{ ...sidebarButtonStyle, backgroundColor: "#fcef0c", color: "#000" }}>Logout</button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, backgroundColor: '#f9f9f9', padding: '20px' }}>
        <h1>Welcome, {name}</h1>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* Weekly Commission */}
          <div style={{ flex: 1, backgroundColor: '#fff', padding: '15px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <h3>Weekly Commission</h3>
            <div>{commissionData.week_start_date.split('T')[0]} - {commissionData.week_end_date.split('T')[0]}</div>

            <p><strong>NB/RW Fees:</strong> {formatCurrency(commissionData.nbrwfee)}</p>
            <p><strong>EN Fees:</strong> {formatCurrency(commissionData.enfee)}</p>
            <p><strong>Total:</strong> {formatCurrency(commissionData.totalnben)}</p>

            <hr />
            <strong>EXPENSES</strong>
            <p><strong>Gross Pay:</strong> {formatCurrency(commissionData.grosspay)}</p>
            <p>
              <strong>Total NBs:</strong> {commissionData.totalnbs} &nbsp;&nbsp;
              <strong>NB Corp Fee:</strong> {formatCurrency(commissionData.nbcorffee)}
            </p>
            <p><strong>EN Corp Fee:</strong> {formatCurrency(commissionData.encorpfee)}</p>
            <p><strong>Referrals/Pay Out:</strong> {formatCurrency(commissionData.refferalspayout)}</p>

            <p>
              <strong>Total:</strong> <span style={{ color: getColor(commissionData['nben(afterfees)'], 500), fontWeight: 'bold' }}>
                {formatCurrency(commissionData['nben(afterfees)'])}
              </span>
            </p>
            <p style={{ fontSize: '12px' }}>*must be $500 or more to qualify for COMMISSION</p>

            <p><strong>Re-Issue and Renewals:</strong> {formatCurrency(commissionData.reissuerenewaltotal)}</p>
            <p><strong>Total Rev After Deductions:</strong> {formatCurrency(commissionData['totalrev(afterfees)2'])}</p>
            <p><strong>Commission Tier:</strong> {commissionData.bonustier}</p>
            <p><strong>Commission:</strong> {formatCurrency(commissionData.totalbonus)}</p>
            <p><strong>Total Violations:</strong> {commissionData.totalviolations}</p>
            <p>
              <strong>Total Commission:</strong> <span style={{ color: getColor(commissionData.commissionafterarfeescanningviolations), fontWeight: 'bold' }}>
                {formatCurrency(commissionData.commissionafterarfeescanningviolations)}
              </span>
            </p>

            <h4>A.R. Fee Carry Overs</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              {carryoverBox("4+ Weeks Old", commissionData.arcarryoverolderthan3weeks)}
              {carryoverBox("3 Weeks Old", commissionData.arcarryovertwoweeksprior)}
              {carryoverBox("2 Week Old", commissionData.arcarryoveroneweekprior)}
              {carryoverBox("Current Week", commissionData.arcurrentweek)}
            </div>

            <h4>Scanning Violations Carry Overs</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              {carryoverBox("4+ Weeks Old", commissionData.svcarryoverolderthan3weeks)}
              {carryoverBox("3 Weeks Old", commissionData.svcarryovertwoweeksprior)}
              {carryoverBox("2 Week Old", commissionData.svcarryoveroneweekprior)}
              {carryoverBox("Current Week", commissionData.svcurrentweek)}
            </div>

            <button onClick={() => setShowQualifications(!showQualifications)} style={{ ...sidebarButtonStyle, width: 'auto', marginTop: '10px' }}>
              Commission Qualifications
            </button>

            {showQualifications && (
              <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '5px', marginTop: '10px', fontSize: '12px' }}>
                <p>10% Commission: Agents qualify if they sell a minimum of 10 NBS.</p>
                <p>12.5% Commission: Agents qualify if they sell a minimum of 17 NBS and achieve at least $3,500 in combined NBS & Endorsement revenue before deductions.</p>
                <p>Minimum COMMISSION Qualification: Must have $500+ after deductions to qualify for commission.</p>
                <p>Revenue Calculation: NB/RW + Endo - deductions.</p>
                <p>AR Fees and Scanning Violations: Deducted from final commission.</p>
              </div>
            )}
          </div>

          {/* Commission History Chart */}
          <div style={{ flex: 1, backgroundColor: '#fff', padding: '15px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <h3>📈 Commission History</h3>
            {commissionHistory.length > 0 ? (
              <>
                <Bar data={{
                  labels: chartLabels,
                  datasets: [{ label: 'Commission ($)', data: chartValues, backgroundColor: '#d32f2f' }]
                }} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                <p style={{ textAlign: 'right', fontWeight: 'bold' }}>Total YTD: {formatCurrency(totalYTD)}</p>
              </>
            ) : (
              <div>No commission history found.</div>
            )}
          </div>
        </div>

        {/* Commission History Detail with selector */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "5px", padding: "15px", marginTop: "20px" }}>
          <h3>Commission History Detail</h3>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            style={{ marginBottom: "10px", padding: "5px", fontSize: "16px" }}
          >
            {commissionHistory.map((item, idx) => (
              <option key={idx} value={idx}>
                {item.week_start_date.split('T')[0]} - {item.week_end_date.split('T')[0]}
              </option>
            ))}
          </select>

          {selectedItem && (
            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
             <p><strong>NB/RW Fees:</strong> {formatCurrency(commissionData.nbrwfee)}</p>
            <p><strong>EN Fees:</strong> {formatCurrency(commissionData.enfee)}</p>
            <p><strong>Total:</strong> {formatCurrency(commissionData.totalnben)}</p>

            <hr />
            <strong>EXPENSES</strong>
            <p><strong>Gross Pay:</strong> {formatCurrency(commissionData.grosspay)}</p>
            <p>
              <strong>Total NBs:</strong> {commissionData.totalnbs} &nbsp;&nbsp;
              <strong>NB Corp Fee:</strong> {formatCurrency(commissionData.nbcorffee)}
            </p>
            <p><strong>EN Corp Fee:</strong> {formatCurrency(commissionData.encorpfee)}</p>
            <p><strong>Referrals/Pay Out:</strong> {formatCurrency(commissionData.refferalspayout)}</p>

            <p>
              <strong>Total:</strong> <span style={{ color: getColor(commissionData['nben(afterfees)'], 500), fontWeight: 'bold' }}>
                {formatCurrency(commissionData['nben(afterfees)'])}
              </span>
            </p>
            <p style={{ fontSize: '12px' }}>*must be $500 or more to qualify for COMMISSION</p>

            <p><strong>Re-Issue and Renewals:</strong> {formatCurrency(commissionData.reissuerenewaltotal)}</p>
            <p><strong>Total Rev After Deductions:</strong> {formatCurrency(commissionData['totalrev(afterfees)2'])}</p>
            <p><strong>Commission Tier:</strong> {commissionData.bonustier}</p>
            <p><strong>Commission:</strong> {formatCurrency(commissionData.totalbonus)}</p>
            <p><strong>Total Violations:</strong> {commissionData.totalviolations}</p>
            <p>
              <strong>Total Commission:</strong> <span style={{ color: getColor(commissionData.commissionafterarfeescanningviolations), fontWeight: 'bold' }}>
                {formatCurrency(commissionData.commissionafterarfeescanningviolations)}
              </span>
            </p>

            <h4>A.R. Fee Carry Overs</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              {carryoverBox("4+ Weeks Old", commissionData.arcarryoverolderthan3weeks)}
              {carryoverBox("3 Weeks Old", commissionData.arcarryovertwoweeksprior)}
              {carryoverBox("2 Week Old", commissionData.arcarryoveroneweekprior)}
              {carryoverBox("Current Week", commissionData.arcurrentweek)}
            </div>

            <h4>Scanning Violations Carry Overs</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              {carryoverBox("4+ Weeks Old", commissionData.svcarryoverolderthan3weeks)}
              {carryoverBox("3 Weeks Old", commissionData.svcarryovertwoweeksprior)}
              {carryoverBox("2 Week Old", commissionData.svcarryoveroneweekprior)}
              {carryoverBox("Current Week", commissionData.svcurrentweek)}
            </div>

              {/* replicate your full layout here if needed */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const sidebarButtonStyle = {
  display: "block",
  width: "100%",
  backgroundColor: "#fff",
  color: "#d32f2f",
  border: "none",
  padding: "15px",
  fontSize: "16px",
  cursor: "pointer",
  textAlign: "left",
  marginBottom: "10px",
  borderRadius: "5px"
};

export default Dashboard;

