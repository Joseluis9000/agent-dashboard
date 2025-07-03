import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function RegionalDashboard() {
  const [liveManagerDash, setLiveManagerDash] = useState([]);
  const [kpiArchives, setKpiArchives] = useState({});
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState("");
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

        if (data.success) {
          setLiveManagerDash(data.liveManagerDash || []);
          setKpiArchives(data.kpiArchives || {});
        } else {
          console.error("Fetch returned error:", data.error);
          alert(data.error || "Failed to fetch data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Network error.");
      }
    };
    fetchData();
  }, [navigate]);

  const kpiYears = Object.keys(kpiArchives).sort();
  const currentKPIData = kpiArchives[selectedYear] || [];

  const filteredKPIData = currentKPIData.filter((row, i) => {
    if (i === 0) return true; // keep header
    if (selectedMonth && !String(row[0]).toLowerCase().includes(selectedMonth.toLowerCase())) return false;
    return true;
  });

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
                  {liveManagerDash[0].map((header, idx) => (
                    <th key={idx} style={{ textAlign: 'left', padding: '5px 10px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveManagerDash.slice(1).map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, i) => (
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
        <div style={{ marginBottom: '10px' }}>
          <label>Year: </label>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {kpiYears.map((year, idx) => (
              <option key={idx} value={year}>{year}</option>
            ))}
          </select>

          <label style={{ marginLeft: '20px' }}>Month: </label>
          <input
            type="text"
            placeholder="e.g. June"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </div>

        <div style={{ overflowX: 'auto', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
          {filteredKPIData.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {filteredKPIData[0].map((header, idx) => (
                    <th key={idx} style={{ textAlign: 'left', padding: '5px 10px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredKPIData.slice(1).map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, i) => (
                      <td key={i} style={{ padding: '5px 10px' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No KPI data found for this filter.</div>
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
