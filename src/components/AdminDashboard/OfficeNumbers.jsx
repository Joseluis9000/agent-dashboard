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
                .from('office_numbers') // Changed from monthly_sales
                .select('*')
                .order('month_start_date', { ascending: false });

            if (error) {
                setError(error.message);
            } else {
                setSalesData(data || []);
                if (data && data.length > 0) {
                    const uniqueMonths = [...new Set(data.map(item => item.month_start_date))];
                    setMonthOptions(uniqueMonths);
                    setSelectedMonth(uniqueMonths[0]);
                }
            }
            setLoading(false);
        };
        fetchSalesData();
    }, []);

    const formatMonth = (dateString) => new Date(dateString).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const formatCurrency = (number) => parseFloat(number || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    // --- Data Processing ---
    const filteredData = salesData.filter(item => item.month_start_date === selectedMonth);

    const regionalData = filteredData.reduce((acc, row) => {
        const region = row.region || 'Unknown';
        if (!acc[region]) {
            acc[region] = { offices: [], totals: {} };
        }
        acc[region].offices.push(row);
        return acc;
    }, {});

    let grandTotal = { total_policies: 0, total_premium: 0 };
    for (const region in regionalData) {
        const regionTotals = regionalData[region].offices.reduce((acc, office) => {
            acc.total_policies = (acc.total_policies || 0) + (office.total_policies || 0);
            acc.total_premium = (acc.total_premium || 0) + (office.total_premium || 0);
            return acc;
        }, { total_policies: 0, total_premium: 0 });
        regionalData[region].totals = regionTotals;
        grandTotal.total_policies += regionTotals.total_policies;
        grandTotal.total_premium += regionTotals.total_premium;
    }

    if (loading) return <h2>Loading Office Numbers...</h2>;
    if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

    return (
        <div>
            <div className={styles.pageHeader}>
                <h1>Office Performance</h1>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: '8px', fontSize: '1rem' }}>
                    {monthOptions.map(month => (
                        <option key={month} value={month}>{formatMonth(month)}</option>
                    ))}
                </select>
            </div>

            {/* Region Totals Cards */}
            <div className={styles.regionTotalsContainer}>
                {Object.keys(regionalData).sort().map(region => (
                    <div key={region} className={styles.regionCard}>
                        <h3>{region}</h3>
                        <p>{regionalData[region].totals.total_policies.toLocaleString()} <span>Policies</span></p>
                        <p>{formatCurrency(regionalData[region].totals.total_premium)} <span>Premium</span></p>
                    </div>
                ))}
                <div className={styles.regionCard} style={{borderColor: '#2ecc71'}}>
                    <h3>Grand Total</h3>
                    <p>{grandTotal.total_policies.toLocaleString()} <span>Policies</span></p>
                    <p>{formatCurrency(grandTotal.total_premium)} <span>Premium</span></p>
                </div>
            </div>

            {/* Tables for each region */}
            {Object.keys(regionalData).sort().map(region => (
                <div key={region} className={styles.regionTableContainer}>
                    <h2>{region}</h2>
                    <table className={styles.ticketsTable}>
                        <thead>
                            <tr>
                                <th>Office</th>
                                <th>New Business #</th>
                                <th>New Business Fees</th>
                                <th>NB Avg</th>
                                <th style={{width: '20px'}}></th>
                                <th>Renewal #</th>
                                <th>Renewal Fees</th>
                                <th>Renewal Avg</th>
                                <th style={{width: '20px'}}></th>
                                <th>Taxes #</th>
                                <th>Tax Fees</th>
                                <th>Tax Avg</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regionalData[region].offices.sort((a, b) => a.office.localeCompare(b.office)).map((row, index) => (
                                <React.Fragment key={row.id}>
                                    <tr>
                                        <td>{row.office}</td>
                                        <td>{row.new_business_count}</td>
                                        <td>{row.new_business_fees}</td>
                                        <td>{row.nb_avg}</td>
                                        <td></td>
                                        <td>{row.renewal_count}</td>
                                        <td>{row.renewal_fees}</td>
                                        <td>{row.renewal_avg}</td>
                                        <td></td>
                                        <td>{row.taxes_count}</td>
                                        <td>{row.tax_fees}</td>
                                        <td>{row.tax_avg}</td>
                                    </tr>
                                    {/* Add separator row, but not after the last item */}
                                    {index < regionalData[region].offices.length - 1 && (
                                        <tr><td colSpan="12" className={styles.separatorRow}></td></tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export default OfficeNumbers;