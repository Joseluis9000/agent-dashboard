// src/pages/OfficeNumbers.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from '../components/AdminDashboard/AdminDashboard.module.css';

const OfficeNumbers = () => {
    const [salesData, setSalesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monthOptions, setMonthOptions] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState('');

    useEffect(() => {
        const fetchSalesData = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('monthly_sales')
                .select('*')
                .order('month_start_date', { ascending: false });

            if (error) {
                setError(error.message);
            } else {
                setSalesData(data || []);
                if (data) {
                    const uniqueMonths = [...new Set(data.map(item => item.month_start_date))];
                    setMonthOptions(uniqueMonths);
                    if (uniqueMonths.length > 0) {
                        setSelectedMonth(uniqueMonths[0]);
                    }
                }
            }
            setLoading(false);
        };

        fetchSalesData();
    }, []);

    const filteredData = salesData.filter(item => item.month_start_date === selectedMonth);

    const formatMonth = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    };

    if (loading) return <h2>Loading Office Numbers...</h2>;
    if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

    return (
        <div>
            <div className={styles.pageHeader}>
                <h1>Office Numbers & Performance</h1>
                {monthOptions.length > 0 && (
                    <div>
                        <label htmlFor="month-select" style={{ marginRight: '10px' }}>Select Month:</label>
                        <select 
                            id="month-select"
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{ padding: '8px', fontSize: '1rem', borderRadius: '5px' }}
                        >
                            {monthOptions.map(month => (
                                <option key={month} value={month}>
                                    {formatMonth(month)}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ✅ Table updated to match your final list of columns */}
            <div style={{ overflowX: 'auto' }}> {/* Makes the table scrollable on small screens */}
                <table className={styles.ticketsTable}>
                    <thead>
                        <tr>
                            <th>Office</th>
                            <th>Region</th>
                            <th>New Business #</th>
                            <th>New Business Fees</th>
                            <th>NB Avg</th>
                            <th>CC Transactions</th>
                            <th>CC Fees</th>
                            <th>CC Avg</th>
                            <th>Endorsement #</th>
                            <th>Endorsement Fees</th>
                            <th>Endorsement Avg</th>
                            <th>Installment #</th>
                            <th>Installment Fees</th>
                            <th>Installment Avg</th>
                            <th>DMV #</th>
                            <th>DMV Fees</th>
                            <th>DMV Avg</th>
                            <th>Reissue #</th>
                            <th>Reissue Fees</th>
                            <th>Reissue Avg</th>
                            <th>Renewal #</th>
                            <th>Renewal Fees</th>
                            <th>Renewal Avg</th>
                            <th>Taxes #</th>
                            <th>Tax Fees</th>
                            <th>Tax Avg</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length > 0 ? (
                            filteredData.map(row => (
                                <tr key={row.id}>
                                    <td>{row.office}</td>
                                    <td>{row.region}</td>
                                    <td>{row.new_business_count}</td>
                                    <td>{row.new_business_fees}</td>
                                    <td>{row.nb_avg}</td>
                                    <td>{row.cc_transactions}</td>
                                    <td>{row.cc_fees}</td>
                                    <td>{row.cc_avg}</td>
                                    <td>{row.endorsement_count}</td>
                                    <td>{row.endorsement_fees}</td>
                                    <td>{row.endorsement_avg}</td>
                                    <td>{row.installment_count}</td>
                                    <td>{row.installment_fees}</td>
                                    <td>{row.installment_avg}</td>
                                    <td>{row.dmv_count}</td>
                                    <td>{row.dmv_fees}</td>
                                    <td>{row.dmv_avg}</td>
                                    <td>{row.reissue_count}</td>
                                    <td>{row.reissue_fees}</td>
                                    <td>{row.reissue_avg}</td>
                                    <td>{row.renewal_count}</td>
                                    <td>{row.renewal_fees}</td>
                                    <td>{row.renewal_avg}</td>
                                    <td>{row.taxes_count}</td>
                                    <td>{row.tax_fees}</td>
                                    <td>{row.tax_avg}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="26" style={{textAlign: 'center', padding: '20px'}}>
                                    No data found for the selected month.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OfficeNumbers;