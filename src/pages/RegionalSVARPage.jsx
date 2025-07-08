import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/RegionalDashboard/Sidebar';
import DataTable from '../components/RegionalDashboard/DataTable';
import styles from '../components/RegionalDashboard/RegionalDashboard.module.css';

function RegionalSVARPage() {
  const [arsvData, setArsvData] = useState([]);
  const [commissionData, setCommissionData] = useState([]);
  const [svHistory, setSvHistory] = useState([]);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [summaryFeeData, setSummaryFeeData] = useState([]);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [commissionAvailableWeeks, setCommissionAvailableWeeks] = useState([]);
  const [commissionSelectedWeek, setCommissionSelectedWeek] = useState('');
  const [filteredCommissionHistory, setFilteredCommissionHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userName, setUserName] = useState('');
  
  // ✅ FIX: Initialize as an empty string to prevent glitching
  const [mascotPath, setMascotPath] = useState('');
  
  const navigate = useNavigate();

  const regionalMenuItems = [
    { path: '/regional-dashboard', label: 'Dashboard' },
    { path: '/regional-svar', label: 'Agent Commissions' },
    { path: '/regional-tardy-warning', label: 'Agent Tardy/Warnings' }
  ];

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
        const mainDataUrl = `https://script.google.com/macros/s/AKfycbw7ubzHdSo505A2Q2F9ij_2n1WTSX0NcuR_1DIO5L3pbcOQGZMUFx2KLjXgp58qESxP/exec?email=${userEmail}`;
        const historyDataUrl = `https://script.google.com/macros/s/AKfycbw9bNfrf9GWyyY33oB-ZRpjKFwz0SkQe_zGEcMlJhueo-2JXdjfC5FS9k6GPeKu8dKN/exec?email=${userEmail}`;

        const [mainRes, historyRes] = await Promise.all([
          fetch(mainDataUrl),
          fetch(historyDataUrl)
        ]);

        const mainData = await mainRes.json();
        const historyData = await historyRes.json();
        
        if (mainData.success && historyData.success) {
          const regionName = mainData.region || '';
          setUserName(mainData.name || 'Regional User');

          // ✅ FIX: Add else condition to set default path
          const mascotMap = {
            'THE VALLEY': 'the-valley', 'CEN-CAL': 'cen-cal', 'KERN COUNTY': 'kern-county',
            'BAY': 'bay', 'SOUTHERN CALI': 'southern-cali'
          };
          if (regionName && mascotMap[regionName]) {
            setMascotPath(`/${mascotMap[regionName]}.png`);
          } else {
            setMascotPath('/default-mascot.png');
          }

          const arsvSummary = mainData.arsvData || [];
          setArsvData(arsvSummary);
          setCommissionData(mainData.commissionData || []);
          
          const svh = historyData.svArHistoryData || [];
          const comh = historyData.commissionHistoryData || [];
          setSvHistory(svh);
          setCommissionHistory(comh);

          const totalARFees = arsvSummary.slice(1).reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
          const totalSVFees = arsvSummary.slice(1).reduce((sum, row) => sum + (Number(row[3]) || 0), 0);
          const summaryData = [
              ['Description', 'Total Amount'],
              ['AR Totals for the Week', totalARFees],
              ['SV Totals for the Week', totalSVFees]
          ];
          setSummaryFeeData(summaryData);

          if (svh.length > 0) {
            const weekKey = 'sv_week_start_date';
            const uniqueWeeks = [...new Set(svh.map(row => row[weekKey]?.split('T')[0]).filter(Boolean))]
                .sort((a,b) => new Date(b) - new Date(a));
            setAvailableWeeks(uniqueWeeks);
            if (uniqueWeeks.length > 0) {
              setSelectedWeek(uniqueWeeks[0]);
            }
          }

          if (comh.length > 0) {
            const weekKey = 'week_start_date';
            const uniqueWeeks = [...new Set(comh.map(row => row[weekKey]?.split('T')[0]).filter(Boolean))]
                .sort((a,b) => new Date(b) - new Date(a));
            setCommissionAvailableWeeks(uniqueWeeks);
            if (uniqueWeeks.length > 0) {
              setCommissionSelectedWeek(uniqueWeeks[0]);
            }
          }
        } else {
          throw new Error(mainData.error || historyData.error || "Failed to fetch data.");
        }
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [navigate]);
  
  useEffect(() => {
    if (!selectedWeek || svHistory.length === 0) {
        setFilteredHistory([]);
        return;
    }
    const weekKey = 'sv_week_start_date';
    const filtered = svHistory.filter(row => row[weekKey] && row[weekKey].startsWith(selectedWeek));
    setFilteredHistory(filtered);
  }, [selectedWeek, svHistory]);

  useEffect(() => {
    if (!commissionSelectedWeek || commissionHistory.length === 0) {
        setFilteredCommissionHistory([]);
        return;
    }
    const weekKey = 'week_start_date';
    const filtered = commissionHistory.filter(row => row[weekKey] && row[weekKey].startsWith(commissionSelectedWeek));
    setFilteredCommissionHistory(filtered);
  }, [commissionSelectedWeek, commissionHistory]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar 
        userTitle="Regional"
        menuItems={regionalMenuItems}
        onLogout={handleLogout}
        mascotPath={mascotPath}
      />
      <main className={styles.mainContent}>
        {isLoading ? (
          <div className={styles.centered}>Loading...</div>
        ) : error ? (
          <div className={`${styles.centered} ${styles.error}`}>
            <h3>Something went wrong</h3>
            <p>{error.message}</p>
          </div>
        ) : (
          <>
            <h1 className={styles.pageTitle}>Agent Commissions</h1>
            
            <DataTable
              title="Agent AR/SV Breakdown"
              data={arsvData}
              dataType="arrayArray" 
            />
            <DataTable
              title="Agent Commission Breakdown"
              data={commissionData}
              dataType="arrayArray" 
            />
            
            <div className={styles.card}>
                <div className={styles.filterContainer}>
                    <label htmlFor="sv-week-select">Select Week:</label>
                    <select 
                        id="sv-week-select"
                        value={selectedWeek}
                        onChange={e => setSelectedWeek(e.target.value)}
                        className={styles.monthSelector}
                    >
                        {availableWeeks.map(week => (
                            <option key={week} value={week}>Week of {week}</option>
                        ))}
                    </select>
                </div>
                <DataTable
                    title="SV & AR History"
                    data={filteredHistory}
                    dataType="objectArray"
                />
            </div>

            <div className={styles.card}>
                <div className={styles.filterContainer}>
                    <label htmlFor="commission-week-select">Select Week:</label>
                    <select 
                        id="commission-week-select"
                        value={commissionSelectedWeek}
                        onChange={e => setCommissionSelectedWeek(e.target.value)}
                        className={styles.monthSelector}
                    >
                        {commissionAvailableWeeks.map(week => (
                            <option key={week} value={week}>Week of {week}</option>
                        ))}
                    </select>
                </div>
                <DataTable
                    title="Commission History"
                    data={filteredCommissionHistory}
                    dataType="objectArray"
                />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default RegionalSVARPage;