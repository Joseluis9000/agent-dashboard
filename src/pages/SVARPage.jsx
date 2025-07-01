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

      try {
        const res = await fetch(`https://script.google.com/macros/s/AKfycbySrsUGSUFtKg9vwQujCQgOfNl-QTOp2D5MM-ADXY4OmSCGQ3lEk8BC_STDrByL95K4/exec?email=${userEmail}`);
        const data = await res.json();

        if (data.success) {
          setSvArData(data.violationsData ? [data.violationsData] : []);
          setSvHistory(data.svArHistoryData || []);
        } else {
          alert("Failed to fetch data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Network error.");
      }
    };

    fetchData();
  }, [navigate]);

  const totalARFees = svHistory.reduce((acc, cur) => acc + (Number(cur.arfeeamount) || 0), 0).toFixed(2);
  const totalSVFees = svHistory.reduce((acc, cur) => acc + (Number(cur.svfeeamount) || 0), 0).toFixed(2);

  const handleLogout = () => {
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  const navLinkStyle = (path) => ({
    display: "block",
    backgroundColor: location.pathname === path ? "#fff" : "#d32f2f",
    color: location.pathname === path ? "#d32f2f" : "#fff",
    textDecoration: "none",
    padding: "10px",
    borderRadius: "5px",
    marginBottom: "10px",
    textAlign: "center",
    fontWeight: "bold",
    border: "2px solid #fff"
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: "#d32f2f", color: "#fff", width: "220px", padding: "20px" }}>
        <img src="/fiesta-logo.png" alt="Fiesta Logo" style={{ width: "100%", marginBottom: "20px" }} />
        <nav>
          <Link to="/dashboard" style={navLinkStyle('/dashboard')}>Dashboard</Link>
          <Link to="/sv-ar" style={navLinkStyle('/sv-ar')}>Current SV & AR</Link>
        </nav>
        <button
          onClick={handleLogout}
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
        {/* YTD Fee Totals */}
        <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold" }}>
          YTD Fee Totals
        </div>
        <div style={{ marginBottom: "20px", backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px" }}>
          <p><strong>AR Fees:</strong> ${totalARFees}</p>
          <p><strong>SV Fees:</strong> ${totalSVFees}</p>
        </div>

        {/* Current SV & AR */}
        <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold" }}>
          Current Scanning Violations & ARs
        </div>
        {svArData.length > 0 ? (
          svArData.map((item, index) => (
            <div key={index} style={{ backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px", marginBottom: "10px" }}>
              {Object.entries(item).map(([key, value]) => (
                <div key={key}><strong>{key}:</strong> {value || "N/A"}</div>
              ))}
            </div>
          ))
        ) : (
          <div style={{ backgroundColor: "#fff", padding: "10px" }}>No current SV & AR data found.</div>
        )}

        {/* History Toggle */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            backgroundColor: "#d32f2f",
            color: "#fff",
            border: "none",
            padding: "10px",
            borderRadius: "5px",
            cursor: "pointer",
            marginTop: "10px",
            fontWeight: "bold"
          }}
        >
          {showHistory ? "Hide SV & AR History" : "Show SV & AR History"}
        </button>

        {/* SV & AR History */}
        {showHistory && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "10px", borderRadius: "5px 5px 0 0", fontWeight: "bold" }}>
              SV & AR History
            </div>
            {svHistory.length > 0 ? (
              svHistory.map((item, index) => (
                <div key={index} style={{ backgroundColor: "#fff", padding: "10px", borderRadius: "0 0 5px 5px", marginBottom: "10px" }}>
                  {Object.entries(item).map(([key, value]) => (
                    <div key={key}><strong>{key}:</strong> {value || "N/A"}</div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{ backgroundColor: "#fff", padding: "10px" }}>No SV & AR history found.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SVARPage;

