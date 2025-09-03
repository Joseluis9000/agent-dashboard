// src/pages/OfficeNumbers.jsx
import React, { useState, useEffect } from 'react';
import supabase from '../supabaseClient'; // default export from src/supabaseClient.js
import styles from '../components/AdminDashboard/AdminDashboard.module.css';

const toDay = (s) => new Date(s).toISOString().slice(0, 10); // 'YYYY-MM-DD'
const formatMonth = (s) =>
  new Date(s).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtMoney = (n) =>
  (n ?? n === 0)
    ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

export default function OfficeNumbers() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthOptions, setMonthOptions] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // quick sanity logs (remove later)
        console.log('Supabase exists?', !!supabase);

        const { data, error } = await supabase
          .from('monthly_sales')
          .select('*')
          .order('month_start_date', { ascending: false });

        if (error) {
          setError(error.message);
          return;
        }

        const rows = data ?? [];
        setSalesData(rows);

        const months = [...new Set(rows.map((r) => toDay(r.month_start_date)))];
        setMonthOptions(months);
        if (months.length) setSelectedMonth(months[0]);
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredData = selectedMonth
    ? salesData.filter((r) => toDay(r.month_start_date) === selectedMonth)
    : salesData;

  if (loading) return <h2>Loading Office Numbers...</h2>;
  if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Office Numbers & Performance</h1>
        {monthOptions.length > 0 && (
          <div>
            <label htmlFor="month-select" style={{ marginRight: 10 }}>
              Select Month:
            </label>
            <select
              id="month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: 8, fontSize: '1rem', borderRadius: 5 }}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
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
            {filteredData.length ? (
              filteredData.map((row) => (
                <tr key={row.id}>
                  <td>{row.office}</td>
                  <td>{row.region}</td>
                  <td>{row.new_business_count}</td>
                  <td>${fmtMoney(row.new_business_fees)}</td>
                  <td>${fmtMoney(row.nb_avg)}</td>
                  <td>{row.cc_transactions}</td>
                  <td>${fmtMoney(row.cc_fees)}</td>
                  <td>${fmtMoney(row.cc_avg)}</td>
                  <td>{row.endorsement_count}</td>
                  <td>${fmtMoney(row.endorsement_fees)}</td>
                  <td>${fmtMoney(row.endorsement_avg)}</td>
                  <td>{row.installment_count}</td>
                  <td>${fmtMoney(row.installment_fees)}</td>
                  <td>${fmtMoney(row.installment_avg)}</td>
                  <td>{row.dmv_count}</td>
                  <td>${fmtMoney(row.dmv_fees)}</td>
                  <td>${fmtMoney(row.dmv_avg)}</td>
                  <td>{row.reissue_count}</td>
                  <td>${fmtMoney(row.reissue_fees)}</td>
                  <td>${fmtMoney(row.reissue_avg)}</td>
                  <td>{row.renewal_count}</td>
                  <td>${fmtMoney(row.renewal_fees)}</td>
                  <td>${fmtMoney(row.renewal_avg)}</td>
                  <td>{row.taxes_count}</td>
                  <td>${fmtMoney(row.tax_fees)}</td>
                  <td>${fmtMoney(row.tax_avg)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="26" style={{ textAlign: 'center', padding: 20 }}>
                  No data found for the selected month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
