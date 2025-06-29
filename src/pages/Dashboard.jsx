import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function Dashboard() {
  const [commissionData, setCommissionData] = useState(null);
  const [violationsData, setViolationsData] = useState(null);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showQualifications, setShowQualifications] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      const response = await fetch(`https://us-central1-optimal-comfort-464220-t1.cloudfunctions.net/loginHandler?email=${userEmail}`);
      const result = await response.json();
      if (result.success) {
        setCommissionData(result.commissionData);
        setViolationsData(result.violationsData);
        setCommissionHistory(result.commissionHistory || []);
      } else {
        alert("Failed to fetch data");
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  if (!commissionData || !violationsData) return <div>Loading...</div>;

  const agentFirstName = commissionData.agentname ? commissionData.agentname.split(" ")[0] : "Agent";
  const weekStart = commissionData.week_start_date || "N/A";
  const weekEnd = commissionData.week_end_date || "N/A";

  const chartLabels = commissionHistory.map(item =>
    (item.week_start_date && item.week_end_date)
      ? `${item.week_start_date} - ${item.week_end_date}`
      : 'N/A'
  );
  const chartValues = commissionHistory.map(item => {
    const value = item["commissionafterarfeescanningviolations"];
    return typeof value === "string" ? parseFloat(value.replace(/[$,]/g, '')) || 0 : value || 0;
  });

  const commissionChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Commission ($)',
        data: chartValues,
        backgroundColor: '#d32f2f',
      }
    ],
  };

  const totalYTD = commissionHistory.reduce((acc, cur) => {
    const val = cur["commissionafterarfeescanningviolations"];
    const num = typeof val === "string" ? parseFloat(val.replace(/[$,]/g, '')) || 0 : val || 0;
    return acc + num;
  }, 0).toFixed(2);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "20px", width: "220px" }}>
        <img src="/fiesta-logo.png" alt="Fiesta Logo" style={{ width: "100%", marginBottom: "20px" }} />
        <button onClick={() => navigate('/dashboard')} style={sidebarButtonStyle}>Dashboard</button>
        <button onClick={() => navigate('/sv-ar')} style={sidebarButtonStyle}>Scanning Violation's & AR's</button>
        <button onClick={handleLogout} style={{ ...sidebarButtonStyle, backgroundColor: "#fcef0c", color: "#000000" }}>Logout</button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, backgroundColor: "#f9f9f9" }}>
        <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px 20px" }}>
          <h1 style={{ margin: 0 }}>Welcome, {agentFirstName}</h1>
        </div>

        <div style={{ display: "flex", padding: "20px", gap: "20px" }}>
          {/* Weekly Commission */}
          <div style={{ flex: 1, backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "5px" }}>
            <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", fontWeight: "bold", borderRadius: "5px 5px 0 0" }}>
              Weekly Commission | {weekStart} - {weekEnd}
            </div>
            <div style={{ padding: "10px" }}>
              <p><strong>Agent Name:</strong> {commissionData.agentname}</p>
              <p><strong>Region:</strong> {commissionData.region}</p>
              <p><strong>NB BF:</strong> {commissionData.nbrwbf}</p>
              <p><strong>Endo Fees:</strong> {commissionData.enfees}</p>
              <p><strong>NB+EN Total:</strong> {commissionData.totalnben}</p>

              <p style={{ fontWeight: "bold", color: "#d32f2f" }}>Expenses</p>
              <p><strong>Gross Pay:</strong> {commissionData.grosspay}</p>
              <p><strong>Total NBs:</strong> {commissionData.totalnbs}</p>
              <p><strong>NB Corp Fees:</strong> {commissionData.nbcorffee}</p>
              <p><strong>Endo Corp Fees:</strong> {commissionData.encorpfee}</p>
              <p><strong>Referrals/Pay Out:</strong> {commissionData.refferalspayout}</p>

              <p><strong>Total Rev After Fees *:</strong> {commissionData["nben(afterfees)"]}</p>
              <p style={{ fontSize: "12px", color: "#555" }}>* must be $500 or more in Total Rev After Fees to qualify for COMMISSION.</p>

              <p><strong>Reinstatement and Renewal Fees:</strong> {commissionData.reissuerenewaltotal}</p>
              <div>
  <strong>Bonus Tier:</strong>
  <span>
    {commissionData.bonustier === "Not Met" ? 
      <span style={{ color: "red" }}>❌ {commissionData.bonustier}</span> : 
      <span style={{ color: "green" }}>✅ {commissionData.bonustier}</span>
    }
  </span>
</div>

              <p><strong>Bonus:</strong> {commissionData.totalbonus}</p>
              <p><strong>Total Violations:</strong> {commissionData.totalviolations}</p>
              <p><strong>Total Commission:</strong> {commissionData.commissionafterarfeescanningviolations}</p>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button onClick={() => setShowDetails(!showDetails)} style={detailButtonStyle}>
                  {showDetails ? "Hide Other Details" : "Show Other Details"}
                </button>
                <button onClick={() => setShowQualifications(!showQualifications)} style={detailButtonStyle}>
                  {showQualifications ? "Hide Qualifications" : "Commission Qualifications"}
                </button>
              </div>

              {showDetails && (
                <div style={{ marginTop: "10px", fontSize: "14px" }}>
                  {Object.entries(commissionData).map(([key, value]) => (
                    <div key={key}>
                      <strong>{key}:</strong> {value || "N/A"}
                    </div>
                  ))}
                </div>
              )}

              {showQualifications && (
            <div style={{ marginTop: "10px", backgroundColor: "#f1f1f1", padding: "10px", borderRadius: "5px", fontSize: "14px", lineHeight: "1.5" }}>
              <h3>Commission Qualifications</h3>
              <ol>
                <li><strong>Commission Qualification</strong>
                  <ul>
                    <li>10% Commission: Agents qualify if they sell a minimum of 10 NBS.</li>
                    <li>12.5% Commission: Agents qualify if they sell at least 17 NBS and achieve $3,500+ in combined NBS & Endorsement revenue before deductions.</li>
                    <li>Minimum Qualification: After NB/RW, Endorsement, Referrals/Pay Out, and Gross Pay deductions, must have $500+ to qualify for commission for that week.</li>
                  </ul>
                </li>
                <li><strong>Revenue Calculation</strong>
                  <ul>
                    <li>Calculate Total Revenue:
                      <ul>
                        <li>NB/RW Revenue: Total from New Business (NB) and Re-WRITES (RW).</li>
                        <li>Endorsement Revenue: Total from endorsements.</li>
                        <li>Combine Revenues: Add NB/RW and Endorsement Revenues together.</li>
                      </ul>
                    </li>
                    <li>Apply Deductions:
                      <ul>
                        <li>NB Sales Deduction: Deduct $20 per NB sold.</li>
                        <li>Endorsement Fee: Deduct 20% of Endorsement Revenue.</li>
                        <li>Referrals/Pay Out: Referral pay outs get deducted from total revenue.</li>
                        <li>Gross Pay Deduction: Deduct agent’s gross pay.</li>
                      </ul>
                    </li>
                    <li>After deductions, revenue must be $500+ to qualify for commission for that week.</li>
                    <li>Re-Issues & Renewals: Deduct 20% Corp charge; add remaining to final revenue.</li>
                  </ul>
                </li>
                <li><strong>Commission Calculation</strong>
                  <ul>
                    <li>10% Commission: If at least 10 NBS sold but not qualifying for 12.5%.</li>
                    <li>12.5% Commission: If 17 NBS sold and $3,500+ combined revenue before deductions.</li>
                    <li>Calculate: Multiply final revenue after deductions by applicable rate.</li>
                  </ul>
                </li>
                <li><strong>Adjustments</strong>
                  <ul>
                    <li>AR Fees & Scanning Violations: Deducted from final commission. If agent does not make commission, fees carry over to next week.</li>
                  </ul>
                </li>
              </ol>
            </div>
          )}
            </div>
          </div>

          {/* Commission History */}
          <div style={{ flex: 1, backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "5px" }}>
            <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", fontWeight: "bold", borderRadius: "5px 5px 0 0" }}>
              📈 Commission History
            </div>
            <div style={{ padding: "10px" }}>
              <Bar data={commissionChartData} options={{ responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Commission History' } } }} />
              <div style={{ marginTop: "10px", fontWeight: "bold" }}>
                Total Commission YTD: ${totalYTD}
              </div>
            </div>
          </div>
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

const detailButtonStyle = {
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "none",
  padding: "5px 10px",
  cursor: "pointer",
  borderRadius: "3px"
};

export default Dashboard;
