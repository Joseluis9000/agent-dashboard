import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function RegionalDashboard() {
  const [liveManagerDash, setLiveManagerDash] = useState([]);
  const [kpiArchive, setKpiArchive] = useState([]);
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
        const res = await fetch(`https://script.google.com/macros/s/AKfycbyjkUxG9OPI_4wZY1EzVOw5zRp8qY8_9BQLUqekwuBqzXuqQN_crEB1q_Pc44MCvAT5/exec?email=${userEmail}`);
        const data = await res.json();
        console.log("RegionalDashboard fetched data:", data);

        if (data.success && data.role === "regional") {
          setLiveManagerDash(data.liveManagerDash || []);
          setKpiArchive(data.kpiArchive || []);
        } else {
          console.error("Fetch returned error:", data.message || data.error);
          alert(data.message || data.error || "Failed to fetch data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Network error.");
      }
    };
    fetchData();
  }, [navigate]);

  const isActive = (path) => location.pathname === path;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ backgroundColor: '#d32f2f', color: '#fff', width: '220px', padding: '20px' }}>
        <h3>Regional</h3>
        <button
          onClick={() => navigate('/regional-dashboard')}
          style={{ ...sidebarButtonStyle, backgroundColor: isActive('/regional-dashboard') ? '#fff' : '#d32f2f', color: isActive('/regional-dashboard') ? '#d32f2f' : '#fff' }}
        >
          Dashboard
        </button>
        <button
          onClick={() => navigate('/regional-svar')}
          style={{ ...sidebarButtonStyle, backgroundColor: isActive('/regional-svar') ? '#fff' : '#d32f2f', color: isActive('/regional-svar') ? '#d32f2f' : '#fff' }}
        >
          Agent Commissions
        </button>
        <button
          onClick={() => navigate('/regional-tardy-warning')}
          style={{ ...sidebarButtonStyle, backgroundColor: isActive('/regional-tardy-warning') ? '#fff' : '#d32f2f', color: isActive('/regional-tardy-warning') ? '#d32f2f' : '#fff' }}
        >
          Agent Tardy/Warnings
        </button>
        <button
          onClick={() => { localStorage.removeItem('userEmail'); navigate('/'); }}
          style={{ ...sidebarButtonStyle, backgroundColor: '#fcef0c', color: '#000' }}
        >
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, backgroundColor: '#f9f9f9', padding: '20px' }}>
        <h2>Monthly Numbers Daily Update</h2>
        <div style={{ overflowX: 'auto', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
          {liveManagerDash.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {Object.keys(liveManagerDash[0]).map((header, idx) => (
                    <th key={idx} style={{ textAlign: 'left', padding: '5px 10px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveManagerDash.map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).map((cell, i) => (
                      <td key={i} style={{ padding: '5px 10px' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No LIVE MANAGER DASH data found.</div>
          )}
        </div>

        <h2 style={{ marginTop: '30px' }}>KPI ARCHIVE</h2>
        <div style={{ overflowX: 'auto', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
          {kpiArchive.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {kpiArchive[0].map((header, idx) => (
                    <th key={idx} style={{ textAlign: 'left', padding: '5px 10px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpiArchive.slice(1).map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, i) => (
                      <td key={i} style={{ padding: '5px 10px' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No KPI ARCHIVE data found.</div>
          )}
        </div>
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

export default RegionalDashboard;


