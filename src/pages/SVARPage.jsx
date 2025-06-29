import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';

function SVARPage() {
  const [svArData, setSvArData] = useState([]);
  const [svHistory, setSvHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchData = async () => {
      const userEmail = localStorage.getItem('userEmail');
      if (!userEmail) {
        navigate('/');
        return;
      }

      const response = await fetch(`https://us-central1-optimal-comfort-464220-t1.cloudfunctions.net/loginHandler?email=${userEmail}`);
      const result = await response.json();
      if (result.success) {
        setSvArData(result.violationsData || []);
        setSvHistory(result.svHistory || []);
      } else {
        alert("Failed to fetch data");
      }
    };

    fetchData();
  }, [navigate]);

  // ✅ Calculate AR Fees and SV Fees YTD from svHistory
  const totalARFees = svHistory.reduce((acc, cur) => {
    const fee = cur.arfeeamount;
    const num = typeof fee === "string" ? parseFloat(fee.replace(/[$,]/g, '')) || 0 : fee || 0;
    return acc + num;
  }, 0).toFixed(2);

  const totalSVFees = svHistory.reduce((acc, cur) => {
    const fee = cur.svfeeamount;
    const num = typeof fee === "string" ? parseFloat(fee.replace(/[$,]/g, '')) || 0 : fee || 0;
    return acc + num;
  }, 0).toFixed(2);

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: "#d32f2f", color: "#fff", width: "200px", padding: "20px" }}>
        <img src="/fiesta-logo.png" alt="Fiesta Logo" style={{ width: "210px", marginBottom: "20px" }} />
        <nav>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li>
              <Link
                to="/dashboard"
                style={{
                  display: "block",
                  backgroundColor: location.pathname === '/dashboard' ? "#d32f57" : "#ffffff",
                  color: location.pathname === '/dashboard' ? "#d32f2f" : "#ce0c0c",
                  textDecoration: "none",
                  padding: "10px",
                  borderRadius: "5px",
                  marginBottom: "10px",
                  textAlign: "center",
                  fontWeight: "bold",
                  border: "2px solid #fff"
                }}
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                to="/sv-ar"
                style={{
                  display: "block",
                  backgroundColor: location.pathname === '/sv-ar' ? "#fff" : "#d32f2f",
                  color: location.pathname === '/sv-ar' ? "#d32f2f" : "#fff",
                  textDecoration: "none",
                  padding: "10px",
                  borderRadius: "5px",
                  marginBottom: "10px",
                  textAlign: "center",
                  fontWeight: "bold",
                  border: "2px solid #fff"
                }}
              >
                Current SV & AR
              </Link>
            </li>
          </ul>
        </nav>

        <button
          onClick={() => {
            localStorage.removeItem('userEmail');
            navigate('/');
          }}
          style={{
            display: "block",
            width: "100%",
            backgroundColor: "yellow",
            color: "#d32f2f",
            border: "none",
            padding: "10px",
            borderRadius: "5px",
            cursor: "pointer",
            marginTop: "10px",
            fontWeight: "bold",
            textAlign: "center"
          }}
        >
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, backgroundColor: "#f9f9f9", padding: "20px" }}>
        {/* ✅ YTD Fee Totals Header */}
        <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold" }}>
          YTD Fee Totals
        </div>
        <div style={{ marginBottom: "20px", backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px" }}>
          <p><strong>AR Fees:</strong> ${totalARFees}</p>
          <p><strong>SV Fees:</strong> ${totalSVFees}</p>
        </div>

        {/* ✅ Current SV & AR Header */}
        <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold", marginTop: "20px" }}>
          Current Scanning Violations & ARs
        </div>

        {svArData.map((item, index) => (
          <div key={index} style={{ marginBottom: "10px", backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px" }}>
            {Object.entries(item).map(([key, value]) => (
              <div key={key}><strong>{key}:</strong> {value || "N/A"}</div>
            ))}
          </div>
        ))}

        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            backgroundColor: "#d32f2f",
            color: "#fff",
            border: "none",
            padding: "5px 10px",
            cursor: "pointer",
            borderRadius: "3px",
            marginTop: "10px"
          }}
        >
          {showHistory ? "Hide SV & AR History" : "Show SV & AR History"}
        </button>

        {showHistory && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold" }}>
              SV & AR History
            </div>
            {svHistory.map((item, index) => (
              <div key={index} style={{ marginBottom: "10px", backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px" }}>
                {Object.entries(item).map(([key, value]) => (
                  <div key={key}><strong>{key}:</strong> {value || "N/A"}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SVARPage;
