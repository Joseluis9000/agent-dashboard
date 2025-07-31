// src/pages/DisqualifiedPolicies.jsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../components/AgentDashboard/DisqualifiedPolicies.module.css';
import Sidebar from '../components/AgentDashboard/Sidebar';

const DisqualifiedPolicies = () => {
    const [currentDisqualifiedData, setCurrentDisqualifiedData] = useState([]);
    const [historyDisqualifiedData, setHistoryDisqualifiedData] = useState([]);
    const [selectedWeekPolicies, setSelectedWeekPolicies] = useState([]);
    const [selectedWeek, setSelectedWeek] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const navigate = useNavigate();

    const disqualifiedPoliciesApiUrl = 'https://script.google.com/macros/s/AKfycby8nzQRCqdKtqwAMybIkxjzo5OiGFPP6gHYU6tquw1KJcjHFz-joAqH0ClWlzTKZpmL/exec';

    useEffect(() => {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
            navigate('/');
            return;
        }

        const fetchDisqualifiedPolicies = async () => {
            try {
                const currentResponse = await fetch(`${disqualifiedPoliciesApiUrl}?type=current&email=${userEmail}`);
                if (!currentResponse.ok) throw new Error('Failed to fetch current disqualified policies.');
                const currentData = await currentResponse.json();
                setCurrentDisqualifiedData(currentData.data || []);

                const historyResponse = await fetch(`${disqualifiedPoliciesApiUrl}?type=history&email=${userEmail}`);
                if (!historyResponse.ok) throw new Error('Failed to fetch history disqualified policies.');
                const historyData = await historyResponse.json();
                
                setHistoryDisqualifiedData(historyData.data || []);
                
                if (historyData.data && historyData.data.length > 0) {
                    const latestWeek = `${historyData.data[0].dp_week_start_date} - ${historyData.data[0].dp_week_end_date}`;
                    setSelectedWeek(latestWeek);
                    setSelectedWeekPolicies(historyData.data.filter(item => `${item.dp_week_start_date} - ${item.dp_week_end_date}` === latestWeek));
                }

            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDisqualifiedPolicies();
    }, [navigate]);

    const uniqueWeeks = useMemo(() => {
        const weeks = historyDisqualifiedData.map(item => `${item.dp_week_start_date} - ${item.dp_week_end_date}`);
        return [...new Set(weeks)];
    }, [historyDisqualifiedData]);
    
    const handleLogout = () => {
        localStorage.removeItem('userEmail');
        navigate('/');
    };

    const totalBfAmount = historyDisqualifiedData.reduce((sum, item) => {
        const amount = parseFloat(item.dpbfamount) || 0;
        return sum + amount;
    }, 0);
    
    const handleWeekChange = (event) => {
        const week = event.target.value;
        setSelectedWeek(week);
        setSelectedWeekPolicies(historyDisqualifiedData.filter(item => `${item.dp_week_start_date} - ${item.dp_week_end_date}` === week));
    };

    if (isLoading) {
        return (
            <div className={styles.pageContainer}>
                <Sidebar onLogout={handleLogout} />
                <div className={styles.mainContent}>
                    <div className={styles.centered}>
                        <p>Loading Disqualified Policies...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.pageContainer}>
                <Sidebar onLogout={handleLogout} />
                <div className={styles.mainContent}>
                    <div className={`${styles.centered} ${styles.errorText}`}>
                        <p>Error: {error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <Sidebar onLogout={handleLogout} />
            <div className={styles.mainContent}>
                <h1 className={styles.pageTitle}>Disqualified Policies</h1>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>YTD Totals</h2>
                    <div className={styles.totalsContainer}>
                        <p>Total Disqualified: {historyDisqualifiedData.length}</p>
                        <p>Total BF Disqualified: ${totalBfAmount.toFixed(2)}</p>
                    </div>
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>Current Disqualified Policies</h2>
                    {currentDisqualifiedData.length > 0 ? (
                        <div className={styles.dataList}>
                            {currentDisqualifiedData.map((item, index) => (
                                <div key={index} className={styles.dataGrid}>
                                    <p><strong>Week:</strong> {item.dp_week_start_date.split('T')[0]} - {item.dp_week_end_date.split('T')[0]}</p>
                                    <p><strong>Customer:</strong> {item.dpcustomername}</p>
                                    <p><strong>Policy #:</strong> {item.dppolicynumber}</p>
                                    <p><strong>BF Amount:</strong> ${parseFloat(item.dpbfamount).toFixed(2)}</p>
                                    <p><strong>Details:</strong> {item.dpdetails}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No disqualified policies found for the current week.</p>
                    )}
                </div>
                
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>Disqualified Policies History</h2>
                    <div className={styles.historySelector}>
                        {historyDisqualifiedData.length > 0 ? (
                            <select onChange={handleWeekChange} value={selectedWeek} className={styles.weekSelector}>
                                {uniqueWeeks.map((week, index) => (
                                    <option key={index} value={week}>
                                        {/* ✅ DATE FORMATTING ADDED HERE */}
                                        {week.split(' - ')[0].split('T')[0]} - {week.split(' - ')[1].split('T')[0]}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <p>No history available.</p>
                        )}
                    </div>
                    {selectedWeekPolicies.length > 0 ? (
                        <div className={styles.dataList}>
                            {selectedWeekPolicies.map((item, index) => (
                                <div key={index} className={styles.dataGrid}>
                                    <p><strong>Week:</strong> {item.dp_week_start_date.split('T')[0]} - {item.dp_week_end_date.split('T')[0]}</p>
                                    <p><strong>Customer:</strong> {item.dpcustomername}</p>
                                    <p><strong>Policy #:</strong> {item.dppolicynumber}</p>
                                    <p><strong>BF Amount:</strong> ${parseFloat(item.dpbfamount).toFixed(2)}</p>
                                    <p><strong>Details:</strong> {item.dpdetails}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No policies found for the selected week.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DisqualifiedPolicies;