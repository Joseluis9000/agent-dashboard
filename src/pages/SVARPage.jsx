// src/pages/SVARPage.jsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/AgentDashboard/Sidebar';
import SvarDataTable from '../components/AgentDashboard/SvarDataTable';
import styles from '../components/AgentDashboard/SVARPage.module.css';

function SVARPage() {
    const navigate = useNavigate();
    
    // Data states
    const [currentViolations, setCurrentViolations] = useState([]);
    const [violationsHistory, setViolationsHistory] = useState([]);
    const [selectedWeekHistoryItems, setSelectedWeekHistoryItems] = useState([]);
    const [selectedHistoryWeek, setSelectedHistoryWeek] = useState(null);

    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // ✅ YOUR NEW SVAR SCRIPT URL
    const svarApiUrl = 'https://script.google.com/macros/s/AKfycbzvjLK3PXr_E1GAqj0SdQhuJ7x2lQZdxCxcOOgKYYlFuwZYd0LEN3sbcGGuc96jZcKX/exec';


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
                const res = await fetch(`${svarApiUrl}?email=${userEmail}`);
                if (!res.ok) {
                    throw new Error(`Network response was not ok (status: ${res.status})`);
                }
                const data = await res.json();

                if (data.success) {
                    const historyData = data.svArHistoryData || [];
                    
                    const currentData = Array.isArray(data.violationsData) ? data.violationsData : (data.violationsData ? [data.violationsData] : []);
                    setCurrentViolations(currentData);
                    
                    setViolationsHistory(historyData);

                    if (historyData.length > 0) {
                        const latestWeek = `${(historyData[0].sv_week_start_date || historyData[0].ar_week_start_date || '').split('T')[0]} - ${(historyData[0].sv_week_end_date || historyData[0].ar_week_end_date || '').split('T')[0]}`;
                        setSelectedHistoryWeek(latestWeek);
                        setSelectedWeekHistoryItems(historyData.filter(item => 
                            `${(item.sv_week_start_date || item.ar_week_start_date || '').split('T')[0]} - ${(item.sv_week_end_date || item.ar_week_end_date || '').split('T')[0]}` === latestWeek
                        ));
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

    const uniqueHistoryWeeks = useMemo(() => {
        const weeks = violationsHistory.map(item => 
            `${(item.sv_week_start_date || item.ar_week_start_date || '').split('T')[0]} - ${(item.sv_week_end_date || item.ar_week_end_date || '').split('T')[0]}`
        );
        return [...new Set(weeks)];
    }, [violationsHistory]);


    const handleLogout = () => {
        localStorage.removeItem('userEmail');
        navigate('/');
    };

    const totalARFees = violationsHistory.reduce((acc, cur) => acc + (Number(cur.arfeeamount) || 0), 0);
    const totalSVFees = violationsHistory.reduce((acc, cur) => acc + (Number(cur.svfeeamount) || 0), 0);
    const formatCurrency = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    const handleWeekChange = (e) => {
        const selectedWeekString = e.target.value;
        setSelectedHistoryWeek(selectedWeekString);
        setSelectedWeekHistoryItems(violationsHistory.filter(item => 
            `${(item.sv_week_start_date || item.ar_week_start_date || '').split('T')[0]} - ${(item.sv_week_end_date || item.ar_week_end_date || '').split('T')[0]}` === selectedWeekString
        ));
    };

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

                        <div className={styles.card}>
                            <h3>SV & AR History</h3>
                            {violationsHistory.length > 0 ? (
                                <select
                                    className={styles.weekSelector}
                                    value={selectedHistoryWeek || ''}
                                    onChange={handleWeekChange}
                                >
                                    {uniqueHistoryWeeks.map((weekString, index) => (
                                        <option key={index} value={weekString}>
                                            Week of {weekString}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p>No history available.</p>
                            )}
                        </div>

                        <SvarDataTable
                            title="Historical Details"
                            data={selectedWeekHistoryItems}
                        />
                    </>
                )}
            </main>
        </div>
    );
}

export default SVARPage;