import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
// REMOVED: Sidebar import is no longer needed
import styles from './EODHistory.module.css';

const EODHistory = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedOffice, setSelectedOffice] = useState('');
    const [officeList, setOfficeList] = useState([]);
    
    const [officeReports, setOfficeReports] = useState([]);
    const [agentReport, setAgentReport] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const initializePage = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (!user) return;

            const { data, error } = await supabase.from('eod_reports').select('office_number');
            if (error) {
                setError("Could not fetch office list.");
            } else {
                const uniqueOffices = [...new Set(data.map(item => item.office_number).filter(Boolean))];
                setOfficeList(uniqueOffices.sort());
                if (uniqueOffices.length > 0) {
                    setSelectedOffice(uniqueOffices[0]);
                }
            }
        };
        initializePage();
    }, []);

    useEffect(() => {
        if (!selectedOffice || !user) return;
        const fetchDailyData = async () => {
            setLoading(true);
            setError(null);
            
            try {
                const dateStart = `${selectedDate}T00:00:00.000Z`;
                const dateEnd = `${selectedDate}T23:59:59.999Z`;

                const { data, error } = await supabase
                    .from('eod_reports')
                    .select('*')
                    .eq('office_number', selectedOffice)
                    .gte('created_at', dateStart)
                    .lte('created_at', dateEnd);

                if (error) throw error;
                
                setOfficeReports(data || []);
                const myReport = data.find(report => report.agent_email === user.email);
                setAgentReport(myReport || null);

            } catch (err) {
                setError(err.message);
                console.error("Error fetching reports:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDailyData();
    }, [selectedDate, selectedOffice, user]);

    const { officeTotals, agentBreakdown, officeSummary } = useMemo(() => {
        const totals = officeReports.reduce((acc, report) => {
            acc.trust += report.trust_deposit || 0;
            acc.dmv += report.dmv_deposit || 0;
            acc.revenue += report.revenue_deposit || 0;
            return acc;
        }, { trust: 0, dmv: 0, revenue: 0 });

        const breakdown = officeReports.map(report => ({
            email: report.agent_email.split('@')[0],
            trust: report.trust_deposit || 0,
            dmv: report.dmv_deposit || 0,
            revenue: report.revenue_deposit || 0,
        }));
        
        const summary = officeReports.reduce((acc, report) => {
            Object.keys(acc).forEach(key => {
                acc[key] += report[key] || 0;
            });
            return acc;
        }, { nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0, credit_premium: 0, credit_fee: 0, expenses_amount: 0 });
        
        return { officeTotals: totals, agentBreakdown: breakdown, officeSummary: summary };
    }, [officeReports]);

    const isToday = (someDate) => {
        if (!someDate) return false;
        const today = new Date();
        const dateToCompare = new Date(someDate);
        return dateToCompare.getDate() === today.getDate() &&
            dateToCompare.getMonth() === today.getMonth() &&
            dateToCompare.getFullYear() === today.getFullYear();
    };

    const handleEdit = () => {
        navigate('/eod-report', { state: { reportToEdit: agentReport } });
    };

    const handleDateChange = (e) => setSelectedDate(e.target.value);
    const handleOfficeChange = (e) => setSelectedOffice(e.target.value);

    const isReportEditable = agentReport && isToday(agentReport.created_at);

    return (
        // REMOVED: The outer <div> and the <Sidebar /> component
        <main className={styles.mainContent}>
            <div className={styles.pageHeader}>
                <h1>Office & Agent EODs</h1>
                <div className={styles.selectors}>
                    {officeList.length > 0 && (
                        <div className={styles.selectorGroup}>
                            <label htmlFor="office-select">Select Office:</label>
                            <select id="office-select" value={selectedOffice} onChange={handleOfficeChange}>
                                {officeList.map(office => <option key={office} value={office}>{office}</option>)}
                            </select>
                        </div>
                    )}
                    <div className={styles.selectorGroup}>
                        <label htmlFor="eod-date">Select Date:</label>
                        <input type="date" id="eod-date" value={selectedDate} onChange={handleDateChange} />
                    </div>
                </div>
            </div>

            {loading && <p>Loading reports...</p>}
            {error && <p className={styles.errorText}>Error: {error}</p>}
            
            {!loading && !error && (
                <div className={styles.reportsGrid}>
                    <div className={styles.card}>
                        <h2>Office Summary for {new Date(selectedDate + 'T12:00:00').toLocaleDateString()}</h2>
                        {officeReports.length > 0 ? (
                            <>
                                <div className={styles.summaryGrid}>
                                    <div><span>Trust Deposit</span><strong>${officeTotals.trust.toFixed(2)}</strong></div>
                                    <div><span>DMV Deposit</span><strong>${officeTotals.dmv.toFixed(2)}</strong></div>
                                    <div><span>Revenue Deposit</span><strong>${officeTotals.revenue.toFixed(2)}</strong></div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Agent Breakdown</h3>
                                <table className={styles.breakdownTable}>
                                    <thead><tr><th>Agent</th><th>Trust</th><th>DMV</th><th>Revenue</th></tr></thead>
                                    <tbody>
                                        {agentBreakdown.map((agent, index) => (
                                            <tr key={index}>
                                                <td>{agent.email}</td>
                                                <td>${agent.trust.toFixed(2)}</td>
                                                <td>${agent.dmv.toFixed(2)}</td>
                                                <td>${agent.revenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <h3 className={styles.breakdownTitle}>Office Auto-Calculated Summary</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>NB/RW Count</span><strong>{officeSummary.nb_rw_count}</strong></div>
                                    <div><span>DMV Count</span><strong>{officeSummary.dmv_count}</strong></div>
                                    <div><span>Cash Premium</span><strong>${officeSummary.cash_premium.toFixed(2)}</strong></div>
                                    <div><span>Cash Fee</span><strong>${officeSummary.cash_fee.toFixed(2)}</strong></div>
                                    <div><span>Credit Premium</span><strong>${officeSummary.credit_premium.toFixed(2)}</strong></div>
                                    <div><span>Credit Fee</span><strong>${officeSummary.credit_fee.toFixed(2)}</strong></div>
                                    <div><span>Expenses</span><strong className={styles.short}>-${officeSummary.expenses_amount.toFixed(2)}</strong></div>
                                </div>
                            </>
                        ) : <p>No reports found for this office on the selected day.</p>}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2>Your Report Details</h2>
                            {isReportEditable && <button onClick={handleEdit} className={styles.editButton}>Edit</button>}
                        </div>
                        {agentReport ? (
                            <>
                                <div className={styles.summaryGrid}>
                                    <div><span>Trust Deposit</span><strong>${(agentReport.trust_deposit || 0).toFixed(2)}</strong></div>
                                    <div><span>DMV Deposit</span><strong>${(agentReport.dmv_deposit || 0).toFixed(2)}</strong></div>
                                    <div><span>Revenue Deposit</span><strong>${(agentReport.revenue_deposit || 0).toFixed(2)}</strong></div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Your Auto-Calculated Summary</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>NB/RW Count</span><strong>{agentReport.nb_rw_count}</strong></div>
                                    <div><span>DMV Count</span><strong>{agentReport.dmv_count}</strong></div>
                                    <div><span>Cash Premium</span><strong>${(agentReport.cash_premium || 0).toFixed(2)}</strong></div>
                                    <div><span>Cash Fee</span><strong>${(agentReport.cash_fee || 0).toFixed(2)}</strong></div>
                                    <div><span>Expenses</span><strong className={styles.short}>-${(agentReport.expenses_amount || 0).toFixed(2)}</strong></div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Your Cash Balancing</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>Expected Cash</span><strong>${((agentReport.total_cash_in_hand || 0) - (agentReport.cash_difference || 0)).toFixed(2)}</strong></div>
                                    <div><span>Actual Cash</span><strong>${(agentReport.total_cash_in_hand || 0).toFixed(2)}</strong></div>
                                    <div><span>Difference</span><strong className={agentReport.cash_difference < 0 ? styles.short : ''}>${(agentReport.cash_difference || 0).toFixed(2)}</strong></div>
                                </div>
                                <div className={styles.receiptsSection}>
                                    <h3>Uploaded Receipts</h3>
                                    {agentReport.receipt_urls && agentReport.receipt_urls.length > 0 ? (
                                        <ul>
                                            {agentReport.receipt_urls.map((url, index) => (
                                                <li key={index}><a href={url} target="_blank" rel="noopener noreferrer">View Receipt {index + 1}</a></li>
                                            ))}
                                        </ul>
                                    ) : <p>No receipts were uploaded with this report.</p>}
                                </div>
                            </>
                        ) : <p>You did not submit a report on the selected day.</p>}
                    </div>
                </div>
            )}
        </main>
    );
};

export default EODHistory;