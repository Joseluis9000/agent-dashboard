import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './EODHistory.module.css';

// --- HELPER FUNCTIONS ---

const formatCurrency = (value = 0) => {
    if (value < 0) {
        return `($${Math.abs(value).toFixed(2)})`;
    }
    return `$${value.toFixed(2)}`;
};

const adjustDepositsForDisplay = (trust = 0, revenue = 0) => {
    let displayTrust = trust;
    let displayRevenue = revenue;
    if (trust < 0) {
        displayRevenue = revenue + trust;
        displayTrust = 0;
    }
    return {
        trust: displayTrust,
        revenue: displayRevenue,
        isCorpOwed: displayRevenue < 0,
    };
};

const calculateSummary = (trans) => {
    const summary = {
        nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0,
        credit_premium: 0, credit_fee: 0,
    };
    for (const t of trans) {
        const total = parseFloat(t.Total) || 0;
        const premium = parseFloat(t.Premium) || 0;
        const fee = parseFloat(t.Fee) || 0;
        const type = t.Type || '';
        const company = t.Company || '';
        const method = t.Method || '';
        if (type.includes('NEW') || type.includes('RWR')) summary.nb_rw_count += Math.sign(total);
        if (company.includes('Registration Fee')) summary.dmv_count += Math.sign(total);
        if (method.includes('Cash')) {
            summary.cash_premium += premium;
            summary.cash_fee += fee;
        } else if (method.includes('Credit Card')) {
            summary.credit_premium += premium;
            summary.credit_fee += fee;
        }
    }
    return summary;
};

const getCommissionableSummary = (report) => {
    if (!report) return null;
    const rawSummary = {
        nb_rw_count: report.nb_rw_count || 0, dmv_count: report.dmv_count || 0,
        cash_premium: report.cash_premium || 0, cash_fee: report.cash_fee || 0,
        credit_premium: report.credit_premium || 0, credit_fee: report.credit_fee || 0,
        expenses_amount: report.expenses_amount || 0,
    };
    const { ar_corrections, raw_transactions } = report;
    if (!ar_corrections || ar_corrections.length === 0 || !raw_transactions) return rawSummary;
    const arReceiptNumbers = new Set(ar_corrections.map(c => c.receiptNumber?.trim()).filter(Boolean));
    if (arReceiptNumbers.size === 0) return rawSummary;
    const arCorrectedTransactions = raw_transactions.filter(t => arReceiptNumbers.has(t.Receipt));
    if (arCorrectedTransactions.length === 0) return rawSummary;
    const arSubSummary = calculateSummary(arCorrectedTransactions);
    const finalSummary = { ...rawSummary };
    Object.keys(arSubSummary).forEach(key => {
        if (finalSummary.hasOwnProperty(key) && typeof finalSummary[key] === 'number') {
            finalSummary[key] -= arSubSummary[key];
        }
    });
    return finalSummary;
};


const EODHistory = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedOffice, setSelectedOffice] = useState('');
    const [officeList, setOfficeList] = useState([]);
    const [officeReports, setOfficeReports] = useState([]);
    const [agentReport, setAgentReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const initializePage = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (!user) {
                setLoading(false);
                return;
            }

            // --- START OF CHANGE ---
            // Calculate date 7 days ago to ensure we capture all currently active offices
            // without hitting the 1000-row limit on the full history.
            const dateSevenDaysAgo = new Date();
            dateSevenDaysAgo.setDate(dateSevenDaysAgo.getDate() - 7);
            const dateString = dateSevenDaysAgo.toISOString().split('T')[0];

            const { data: allOfficesData, error: officeError } = await supabase
                .from('eod_reports')
                .select('office_number')
                .gte('report_date', dateString); // Only look at last 7 days
            // --- END OF CHANGE ---

            if (officeError) {
                setError("Could not fetch office list.");
                setLoading(false);
                return;
            } 
            
            const uniqueOffices = [...new Set(allOfficesData.map(item => item.office_number).filter(Boolean))].sort();
            setOfficeList(uniqueOffices);

            const { data: latestReport } = await supabase
                .from('eod_reports')
                .select('office_number, report_date')
                .eq('agent_email', user.email)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestReport && latestReport.report_date) {
                setSelectedOffice(latestReport.office_number);
                setSelectedDate(latestReport.report_date);
            } else {
                const defaultOffice = latestReport?.office_number || (uniqueOffices.length > 0 ? uniqueOffices[0] : '');
                setSelectedOffice(defaultOffice);
                setSelectedDate(new Date().toISOString().split('T')[0]);
            }
        };
        initializePage();
    }, []);

    useEffect(() => {
        if (!selectedOffice || !selectedDate || !user) {
            if(loading) return;
            setLoading(false);
            return;
        };

        const fetchDailyData = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data, error } = await supabase
                    .from('eod_reports')
                    .select('*')
                    .eq('office_number', selectedOffice)
                    .eq('report_date', selectedDate);

                if (error) throw error;
                setOfficeReports(data || []);
                setAgentReport(data.find(report => report.agent_email === user.email) || null);
            } catch (err) {
                setError(err.message);
                console.error("Error fetching reports:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDailyData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDate, selectedOffice, user]);

    const { officeTotals, agentBreakdown, officeSummary } = useMemo(() => {
        const rawTotals = officeReports.reduce((acc, report) => {
            acc.trust += report.trust_deposit || 0;
            acc.dmv += report.dmv_deposit || 0;
            acc.revenue += report.revenue_deposit || 0;
            return acc;
        }, { trust: 0, dmv: 0, revenue: 0 });

        const adjustedOffice = adjustDepositsForDisplay(rawTotals.trust, rawTotals.revenue);
        const totals = { ...rawTotals, ...adjustedOffice };

        const breakdown = officeReports.map(report => {
            const adjusted = adjustDepositsForDisplay(report.trust_deposit, report.revenue_deposit);
            const agentName = (report.raw_transactions && report.raw_transactions.length > 0)
                ? report.raw_transactions[0]['CSR']
                : report.agent_email.split('@')[0];

            return {
                agentName,
                trust: adjusted.trust,
                dmv: report.dmv_deposit || 0,
                revenue: adjusted.revenue,
                isCorpOwed: adjusted.isCorpOwed,
                cashDifference: report.cash_difference || 0,
            };
        });
        
        const summary = officeReports.reduce((acc, report) => {
            const commissionable = getCommissionableSummary(report);
            if (commissionable) {
                Object.keys(acc).forEach(key => {
                    acc[key] += commissionable[key] || 0;
                });
            }
            return acc;
        }, { nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0, credit_premium: 0, credit_fee: 0, expenses_amount: 0 });
        
        return { officeTotals: totals, agentBreakdown: breakdown, officeSummary: summary };
    }, [officeReports]);

    const commissionableAgentSummary = useMemo(() => getCommissionableSummary(agentReport), [agentReport]);
    const adjustedAgentDeposits = useMemo(() => agentReport ? adjustDepositsForDisplay(agentReport.trust_deposit, agentReport.revenue_deposit) : null, [agentReport]);

    const isToday = (someDate) => {
        if (!someDate) return false;
        const today = new Date();
        const dateToCompare = new Date(someDate);
        return dateToCompare.getUTCFullYear() === today.getUTCFullYear() &&
               dateToCompare.getUTCMonth() === today.getUTCMonth() &&
               dateToCompare.getUTCDate() === today.getUTCDate();
    };
    
    const isReportEditable = agentReport && isToday(agentReport.created_at);

    const handleEdit = () => navigate('/eod-report', { state: { reportToEdit: agentReport } });
    const handleDateChange = (e) => setSelectedDate(e.target.value);
    const handleOfficeChange = (e) => setSelectedOffice(e.target.value);

    return (
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
                        <h2>Office Summary for {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString() : '...'}</h2>
                        {officeReports.length > 0 ? (
                            <>
                                <div className={styles.summaryGrid}>
                                    <div><span>Trust Deposit</span><strong>{formatCurrency(officeTotals.trust)}</strong></div>
                                    <div><span>DMV Deposit</span><strong>{formatCurrency(officeTotals.dmv)}</strong></div>
                                    <div className={styles.depositItem}>
                                        <span>Revenue Deposit</span>
                                        <strong>{formatCurrency(officeTotals.revenue)}</strong>
                                        {officeTotals.isCorpOwed && <small className={styles.corpOwes}>Corp Owes</small>}
                                    </div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Agent Breakdown</h3>
                                <table className={styles.breakdownTable}>
                                    <thead><tr><th>Agent</th><th>Trust</th><th>DMV</th><th>Revenue</th><th>Difference</th></tr></thead>
                                    <tbody>
                                        {agentBreakdown.map((agent, index) => (
                                            <tr key={index}>
                                                <td>{agent.agentName}</td>
                                                <td>{formatCurrency(agent.trust)}</td>
                                                <td>{formatCurrency(agent.dmv)}</td>
                                                <td>
                                                    {formatCurrency(agent.revenue)}
                                                    {agent.isCorpOwed && <span className={styles.corpOwesTable}>Corp Owes</span>}
                                                </td>
                                                {/* **MODIFIED**: This is the new logic for highlighting */}
                                                <td className={
                                                    (agent.cashDifference < 0 || agent.cashDifference > 5) ? styles.short : 
                                                    (agent.cashDifference > 0 && agent.cashDifference <= 5) ? styles.over : ''
                                                }>
                                                    {formatCurrency(agent.cashDifference)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <h3 className={styles.breakdownTitle}>Office Auto-Calculated Summary</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>NB/RW Count</span><strong>{officeSummary.nb_rw_count}</strong></div>
                                    <div><span>DMV Count</span><strong>{officeSummary.dmv_count}</strong></div>
                                    <div><span>Cash Premium</span><strong>{formatCurrency(officeSummary.cash_premium)}</strong></div>
                                    <div><span>Cash Fee</span><strong>{formatCurrency(officeSummary.cash_fee)}</strong></div>
                                    <div><span>Credit Premium</span><strong>{formatCurrency(officeSummary.credit_premium)}</strong></div>
                                    <div><span>Credit Fee</span><strong>{formatCurrency(officeSummary.credit_fee)}</strong></div>
                                    <div><span>Expenses</span><strong>-${(officeSummary.expenses_amount || 0).toFixed(2)}</strong></div>
                                </div>
                            </>
                        ) : <p>No reports found for this office on the selected day.</p>}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2>Your Report Details</h2>
                            {isReportEditable && <button onClick={handleEdit} className={styles.editButton}>Edit</button>}
                        </div>
                        {agentReport && commissionableAgentSummary && adjustedAgentDeposits ? (
                            <>
                                <div className={styles.summaryGrid}>
                                    <div><span>Trust Deposit</span><strong>{formatCurrency(adjustedAgentDeposits.trust)}</strong></div>
                                    <div><span>DMV Deposit</span><strong>{formatCurrency(agentReport.dmv_deposit)}</strong></div>
                                    <div className={styles.depositItem}>
                                        <span>Revenue Deposit</span>
                                        <strong>{formatCurrency(adjustedAgentDeposits.revenue)}</strong>
                                        {adjustedAgentDeposits.isCorpOwed && <small className={styles.corpOwes}>Corp Owes</small>}
                                    </div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Your Auto-Calculated Summary</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>NB/RW Count</span><strong>{commissionableAgentSummary.nb_rw_count}</strong></div>
                                    <div><span>DMV Count</span><strong>{commissionableAgentSummary.dmv_count}</strong></div>
                                    <div><span>Cash Premium</span><strong>{formatCurrency(commissionableAgentSummary.cash_premium)}</strong></div>
                                    <div><span>Cash Fee</span><strong>{formatCurrency(commissionableAgentSummary.cash_fee)}</strong></div>
                                    <div><span>Credit Premium</span><strong>{formatCurrency(commissionableAgentSummary.credit_premium)}</strong></div>
                                    <div><span>Credit Fee</span><strong>{formatCurrency(commissionableAgentSummary.credit_fee)}</strong></div>
                                    <div><span>Expenses</span><strong>-${(commissionableAgentSummary.expenses_amount || 0).toFixed(2)}</strong></div>
                                </div>
                                <h3 className={styles.breakdownTitle}>Your Cash Balancing</h3>
                                <div className={styles.detailGrid}>
                                    <div><span>Expected Cash</span><strong>{formatCurrency((agentReport.total_cash_in_hand || 0) - (agentReport.cash_difference || 0))}</strong></div>
                                    <div><span>Actual Cash</span><strong>{formatCurrency(agentReport.total_cash_in_hand)}</strong></div>
                                    <div><span>Difference</span><strong className={agentReport.cash_difference < 0 ? styles.short : ''}>{formatCurrency(agentReport.cash_difference)}</strong></div>
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