// src/pages/Dashboard.jsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/AgentDashboard/Sidebar';
import CommissionCard from '../components/AgentDashboard/CommissionCard';
import CommissionChart from '../components/AgentDashboard/CommissionChart';
import styles from '../components/AgentDashboard/Dashboard.module.css';

function Dashboard() {
  const navigate = useNavigate();
  // State for data from the API
  const [currentCommission, setCurrentCommission] = useState(null);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [agentName, setAgentName] = useState('Agent');
  // State for UI interaction
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null);
  // State for loading and error handling
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`https://script.google.com/macros/s/AKfycbySrsUGSUFtKg9vwQujCQgOfNl-QTOp2D5MM-ADXY4OmSCGQ3lEk8BC_STDrByL95K4/exec?email=${userEmail}`);
        if (!res.ok) {
            throw new Error(`Network response was not ok (status: ${res.status})`);
        }
        const data = await res.json();

        if (data.success) {
          setCurrentCommission(data.commissionData);
          setCommissionHistory(data.commissionHistoryData || []);
          // Set the agent's first name for the welcome message
          setAgentName(data.commissionData?.agentname?.split(" ")[0] || 'Agent');
          // Set the default selected week to the most recent in the history
          if (data.commissionHistoryData && data.commissionHistoryData.length > 0) {
            setSelectedWeekIndex(0);
          }
        } else {
          throw new Error(data.message || "Failed to fetch valid data.");
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('userEmail');
    navigate('/');
  };

  // Get the commission data for the week selected in the dropdown
  const selectedHistoricalCommission = (selectedWeekIndex !== null && commissionHistory[selectedWeekIndex])
    ? commissionHistory[selectedWeekIndex]
    : null;

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar onLogout={handleLogout} />
      <main className={styles.mainContent}>
        <h1>Welcome, {agentName}</h1>

        {isLoading ? (
          <div className={styles.centered}>Loading...</div>
        ) : error ? (
          <div className={`${styles.centered} ${styles.error}`}>
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className={styles.mainGrid}>
              {/* Left Column: Current Data & History Chart */}
              <div className={styles.gridColumn}>
                {currentCommission && (
                  <CommissionCard
                    title="Current Weekly Commission"
                    data={currentCommission}
                  />
                )}
                <CommissionChart historyData={commissionHistory} />
              </div>

              {/* Right Column: Historical Data Selector and Details */}
              <div className={styles.gridColumn}>
                <div className={styles.card}>
                  <h3>Commission History Detail</h3>
                  {commissionHistory.length > 0 ? (
                    <select
                      value={selectedWeekIndex}
                      onChange={(e) => setSelectedWeekIndex(Number(e.target.value))}
                      className={styles.weekSelector}
                    >
                      {commissionHistory.map((item, idx) => (
                        <option key={idx} value={idx}>
                          {item.week_start_date.split('T')[0]} - {item.week_end_date.split('T')[0]}
                        </option>
                      ))}
                    </select>
                  ) : <p>No history available.</p>}
                </div>

                {selectedHistoricalCommission ? (
                  <CommissionCard
                    title="Historical Commission"
                    data={selectedHistoricalCommission}
                    isHistory={true} // Flag to prevent showing qualifications again
                  />
                ) : (
                  <div className={styles.card}>
                    <p>Select a week to see its details.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;