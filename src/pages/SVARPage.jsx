// src/pages/SVARPage.jsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/AgentDashboard/Sidebar';
import SvarDataTable from '../components/AgentDashboard/SvarDataTable';
import styles from '../components/AgentDashboard/SVARPage.module.css';

function SVARPage() {
  const navigate = useNavigate();
  // Data states
  const [currentViolations, setCurrentViolations] = useState([]);
  const [violationsHistory, setViolationsHistory] = useState([]);
  
  // ✅ NEW: State to track the selected week's index instead of a show/hide boolean
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(null);

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      const userEmail = localStorage.getItem('userEmail');
      if (!userEmail) {
        navigate('/');
        return;
      }

      try {
        const res = await fetch(`https://script.google.com/macros/s/AKfycbySrsUGSUFtKg9vwQujCQgOfNl-QTOp2D5MM-ADXY4OmSCGQ3lEk8BC_STDrByL95K4/exec?email=${userEmail}`);
        if (!res.ok) {
            throw new Error(`Network response was not ok (status: ${res.status})`);
        }
        const data = await res.json();

        if (data.success) {
          const historyData = data.svArHistoryData || [];
          setCurrentViolations(data.violationsData ? [data.violationsData] : []);
          setViolationsHistory(historyData);

          // ✅ NEW: Default the selector to the first (most recent) historical record
          if (historyData.length > 0) {
            setSelectedHistoryIndex(0);
          }
        } else {
          throw new Error(data.message || "Failed to fetch SV/AR data.");
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

  const totalARFees = violationsHistory.reduce((acc, cur) => acc + (Number(cur.arfeeamount) || 0), 0);
  const totalSVFees = violationsHistory.reduce((acc, cur) => acc + (Number(cur.svfeeamount) || 0), 0);
  const formatCurrency = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  // ✅ NEW: Get the single historical item that is currently selected
  const selectedHistoryItem = (selectedHistoryIndex !== null && violationsHistory[selectedHistoryIndex])
    ? [violationsHistory[selectedHistoryIndex]] // The SvarDataTable expects an array
    : [];

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar onLogout={handleLogout} />
      <main className={styles.mainContent}>
        <h1>Scanning Violations & AR</h1>
        {isLoading ? (
          <div className={styles.centered}>Loading...</div>
        ) : error ? (
          <div className={`${styles.centered} ${styles.error}`}>
            <h3>Could not load data</h3>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className={styles.card}>
              <h3>YTD Fee Totals</h3>
              <div className={styles.totalsContainer}>
                <p><strong>AR Fees:</strong> {formatCurrency(totalARFees)}</p>
                <p><strong>SV Fees:</strong> {formatCurrency(totalSVFees)}</p>
              </div>
            </div>

            <SvarDataTable
              title="Current Scanning Violations & ARs"
              data={currentViolations}
            />

            {/* ✅ NEW: Dropdown selector for history */}
            <div className={styles.card}>
              <h3>SV & AR History</h3>
              {violationsHistory.length > 0 ? (
                <select
                  className={styles.weekSelector}
                  value={selectedHistoryIndex}
                  onChange={e => setSelectedHistoryIndex(Number(e.target.value))}
                >
                  {violationsHistory.map((item, index) => (
                    <option key={index} value={index}>
                      {/* Using sv_week_start_date as the display text, fallback to ar_week_start_date */}
                      Week of { (item.sv_week_start_date || item.ar_week_start_date || '').split('T')[0] }
                    </option>
                  ))}
                </select>
              ) : (
                <p>No history available.</p>
              )}
            </div>
            
            {/* ✅ UPDATED: The data table now shows only the selected historical item */}
            <SvarDataTable
              title="Historical Details"
              data={selectedHistoryItem}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default SVARPage;