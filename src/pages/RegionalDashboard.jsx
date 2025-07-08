import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/RegionalDashboard/Sidebar';
import DataTable from '../components/RegionalDashboard/DataTable';
import MonthlyBarChart from '../components/RegionalDashboard/BarChart';
import styles from '../components/RegionalDashboard/RegionalDashboard.module.css';

function RegionalDashboard() {
  // All state variables
  const [liveManagerDash, setLiveManagerDash] = useState([]);
  const [kpiArchive, setKpiArchive] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [filteredKpiData, setFilteredKpiData] = useState([]);
  const [feeChartData, setFeeChartData] = useState([]);
  const [nbChartData, setNbChartData] = useState([]);
  const [userName, setUserName] = useState('');
  const [userRegion, setUserRegion] = useState('');
  // ✅ FIX: Initialize mascotPath as an empty string to prevent glitching
  const [mascotPath, setMascotPath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // DEFINE: Create the menu items for this specific dashboard
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
        const response = await fetch(`https://script.google.com/macros/s/AKfycbyjkUxG9OPI_4wZY1EzVOw5zRp8qY8_9BQLUqekwuBqzXuqQN_crEB1q_Pc44MCvAT5/exec?email=${userEmail}`);
        const data = await response.json();

        if (data.success && data.role === "regional") {
            const regionName = data.region || '';
            setUserName(data.name || 'Regional User');
            setUserRegion(regionName);

            const mascotMap = {
              'THE VALLEY': 'the-valley',
              'CEN-CAL': 'cen-cal',
              'KERN COUNTY': 'kern-county',
              'BAY': 'bay',
              'SOUTHERN CALI': 'southern-cali'
            };

            if (regionName && mascotMap[regionName]) {
              setMascotPath(`/${mascotMap[regionName]}.png`);
            } else {
              setMascotPath('/default-mascot.png');
            }
            
            setLiveManagerDash(data.liveManagerDash || []);
            const kpiData = data.kpiArchives && data.kpiArchives.undefined ? data.kpiArchives.undefined : [];
            setKpiArchive(kpiData);

            if (kpiData.length > 1) {
                const headers = kpiData[0].map(h => h.toLowerCase().trim());
                const monthIndex = headers.indexOf('month');
                
                if (monthIndex > -1) {
                    const uniqueMonths = [...new Set(kpiData.slice(1).map(row => String(row[monthIndex]).split('T')[0]))]
                        .sort((a,b) => new Date(b) - new Date(a));
                    
                    setAvailableMonths(uniqueMonths);
                    if (uniqueMonths.length > 0) {
                      setSelectedMonth(uniqueMonths[0]);
                    }
                }
            }
        } else {
          throw new Error(data.message || data.error || "Failed to fetch valid data.");
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
    if (!selectedMonth || kpiArchive.length < 2) {
        setFilteredKpiData([]);
        setFeeChartData([]);
        setNbChartData([]);
        return;
    };

    const headers = kpiArchive[0];
    const monthIndex = headers.map(h => h.toLowerCase().trim()).indexOf('month');
    const feeIndex = headers.map(h => h.toLowerCase().trim()).indexOf('total fee');
    const nbIndex = headers.map(h => h.toLowerCase().trim()).indexOf('nb');
    
    const filteredRows = kpiArchive.slice(1).filter(row => String(row[monthIndex]).startsWith(selectedMonth));
    setFilteredKpiData([headers, ...filteredRows]);

    const monthlyFeeTotals = {};
    const monthlyNbTotals = {};

    if (monthIndex > -1 && feeIndex > -1 && nbIndex > -1) {
        kpiArchive.slice(1).forEach(record => {
            const date = new Date(record[monthIndex]);
            const monthName = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            let fee = parseFloat(String(record[feeIndex]).replace(/[^0-9.-]+/g, '')) || 0;
            let nb = parseInt(record[nbIndex], 10) || 0;
            if (monthName) {
                monthlyFeeTotals[monthName] = (monthlyFeeTotals[monthName] || 0) + fee;
                monthlyNbTotals[monthName] = (monthlyNbTotals[monthName] || 0) + nb;
            }
        });
    }

    const sortedMonths = Object.keys(monthlyFeeTotals).sort((a,b) => new Date(a) - new Date(b));
    setFeeChartData(sortedMonths.map(month => ({ name: month.replace(/ \d{4}/, ''), 'Total Fees': monthlyFeeTotals[month] })));
    setNbChartData(sortedMonths.map(month => ({ name: month.replace(/ \d{4}/, ''), 'Total NBs': monthlyNbTotals[month] })));

  }, [selectedMonth, kpiArchive]);


  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const currencyFormatter = (value) => `$${value.toLocaleString()}`;
  const numberFormatter = (value) => value.toLocaleString();

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar 
        onLogout={handleLogout} 
        mascotPath={mascotPath}
        menuItems={regionalMenuItems}
        userTitle="Regional"
      />
      
      <main className={styles.mainContent}>
        {isLoading ? (
          <div className={styles.centered}>Loading Dashboard...</div>
        ) : error ? (
          <div className={`${styles.centered} ${styles.error}`}>
            <h3>Something went wrong</h3>
            <p>{error.message}</p>
          </div>
        ) : (
          <>
            <div className={styles.dashboardHeader}>
              <h1 className={styles.pageTitle}>{userName}'s Dashboard</h1>
            </div>

            <DataTable
              title="Monthly Numbers Daily Update"
              data={liveManagerDash}
              dataType="arrayArray"
            />
            
            <div className={styles.chartGrid}>
              <MonthlyBarChart 
                title="Yearly Fee Performance"
                data={feeChartData} 
                dataKey="Total Fees" 
                fillColor="#d32f2f"
                yAxisFormatter={currencyFormatter}
              />
              <MonthlyBarChart 
                title="Yearly NB Performance"
                data={nbChartData} 
                dataKey="Total NBs" 
                fillColor="#8884d8"
                yAxisFormatter={numberFormatter}
              />
            </div>
            
            <div className={styles.filterContainer}>
                <label htmlFor="month-select">Select Month:</label>
                <select 
                    id="month-select"
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className={styles.monthSelector}
                >
                    {availableMonths.map(month => (
                        <option key={month} value={month}>
                            {month}
                        </option>
                    ))}
                </select>
            </div>

            <DataTable
              title="KPI Archive"
              data={filteredKpiData}
              dataType="arrayArray"
            />
          </>
        )}
      </main>
    </div>
  );
}

export default RegionalDashboard;