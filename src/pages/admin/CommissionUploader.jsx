import React, { useState } from 'react';
import Papa from 'papaparse';
// ✅ FIXED: Changed path from '../' to '../../' to correctly reach src/supabaseClient
import { supabase } from '../../supabaseClient'; 
import styles from './CommissionUploader.module.css';

const GROSS_ASSUMPTION = 800;

const CommissionUploader = () => {
    const [reportData, setReportData] = useState([]);
    const [weekRange, setWeekRange] = useState({ start: '', end: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                try {
                    const processed = processCSVData(results.data);
                    setReportData(processed);
                    setUploadError(null);
                } catch (err) {
                    setUploadError("Error processing CSV. Please check format.");
                }
            }
        });
    };

    const processCSVData = (data) => {
        const agents = {};

        data.forEach(row => {
            const rawName = row.CSR || 'Unknown Agent';
            const cleanName = rawName.replace(/[,"]+/g, '').trim();

            if (!agents[cleanName]) {
                agents[cleanName] = { nbCount: 0, brokerFees: 0, enFees: 0, totalPremium: 0 };
            }

            const type = (row.Type || '').toUpperCase();
            const company = (row.Company || '');
            const fee = parseFloat(String(row.Fee || 0).replace(/,/g, '')) || 0;
            const total = parseFloat(String(row.Total || 0).replace(/,/g, '')) || 0;
            const premium = parseFloat(String(row.Premium || 0).replace(/,/g, '')) || 0;

            if ((type === 'NEW' || type === 'RWR') && total > 0) {
                agents[cleanName].nbCount += 1;
            }

            if (company.includes('Broker Fee')) {
                agents[cleanName].brokerFees += fee;
            } else if (company.includes('Endorsement Fee')) {
                agents[cleanName].enFees += fee;
            }
            
            agents[cleanName].totalPremium += premium;
        });

        return Object.entries(agents).map(([name, stats]) => {
            const preDeduction = stats.brokerFees + stats.enFees;
            const nbDeduction = 20 * stats.nbCount;
            const enDeduction = 0.2 * stats.enFees;
            const afterDeductions = preDeduction - nbDeduction - enDeduction - GROSS_ASSUMPTION;

            let rate = 0;
            if (stats.nbCount >= 17 && preDeduction >= 3500 && afterDeductions >= 500) {
                rate = 0.125;
            } else if (stats.nbCount >= 10) {
                rate = 0.10;
            }

            return {
                name,
                ...stats,
                preDeduction,
                afterDeductions,
                rate,
                estimatedCommission: Math.max(0, afterDeductions * rate)
            };
        }).sort((a, b) => b.nbCount - a.nbCount);
    };

    const handleSaveReport = async () => {
        if (!weekRange.start || !weekRange.end) return alert("Please select date range.");
        setIsSubmitting(true);

        try {
            const { data: report, error: reportErr } = await supabase
                .from('weekly_commission_reports')
                .insert([{
                    week_label: `${weekRange.start} to ${weekRange.end}`,
                    report_range_start: weekRange.start,
                    report_range_end: weekRange.end,
                    total_commission_payout: reportData.reduce((sum, a) => sum + a.estimatedCommission, 0)
                }])
                .select().single();

            if (reportErr) throw reportErr;

            const agentRows = reportData.map(a => ({
                report_id: report.id,
                agent_name: a.name,
                nb_count: a.nbCount,
                total_broker_fees: a.brokerFees,
                total_en_fees: a.enFees,
                after_deductions_revenue: a.afterDeductions,
                commission_rate: a.rate,
                final_commission: a.estimatedCommission
            }));

            const { error: agentErr } = await supabase.from('agent_weekly_stats').insert(agentRows);
            if (agentErr) throw agentErr;

            alert("Weekly Commission Report Saved Successfully!");
            setReportData([]);
        } catch (err) {
            alert("Error saving: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Weekly Commission Upload</h1>
                <div className={styles.controls}>
                    <input type="date" value={weekRange.start} onChange={e => setWeekRange({...weekRange, start: e.target.value})} />
                    <span>to</span>
                    <input type="date" value={weekRange.end} onChange={e => setWeekRange({...weekRange, end: e.target.value})} />
                    <input type="file" accept=".csv" onChange={handleFileUpload} className={styles.fileInput} />
                </div>
            </header>

            {uploadError && <div className={styles.error}>{uploadError}</div>}

            {reportData.length > 0 && (
                <div className={styles.previewCard}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>NB Count</th>
                                <th>Broker Fees</th>
                                <th>EN Fees</th>
                                <th>Pre-Deduction</th>
                                <th>After-Deduction</th>
                                <th>Rate</th>
                                <th>Commission</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.map((row, i) => (
                                <tr key={i} className={row.afterDeductions < 500 ? styles.lowRevenue : ''}>
                                    <td>{row.name}</td>
                                    <td>{row.nbCount}</td>
                                    <td>${row.brokerFees.toFixed(2)}</td>
                                    <td>${row.enFees.toFixed(2)}</td>
                                    <td>${row.preDeduction.toFixed(2)}</td>
                                    <td style={{ color: row.afterDeductions >= 500 ? 'green' : 'red' }}>
                                        ${row.afterDeductions.toFixed(2)}
                                    </td>
                                    <td>{(row.rate * 100).toFixed(1)}%</td>
                                    <td className={styles.bold}>${row.estimatedCommission.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={handleSaveReport} disabled={isSubmitting} className={styles.saveButton}>
                        {isSubmitting ? 'Saving...' : 'Finalize & Save Weekly Report'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default CommissionUploader;