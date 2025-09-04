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
      try {
        const { data, error } = await supabase
          .from('monthly_sales')
          .select('*')
          .order('month_start_date', { ascending: false });

        if (error) throw error;
        setSalesData(data || []);
        if (data && data.length > 0) {
          const uniqueMonths = [...new Set(data.map(item => item.month_start_date))];
          setMonthOptions(uniqueMonths);
          setSelectedMonth(uniqueMonths[0]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSalesData();
  }, []);

  const formatMonth = (dateString) =>
    new Date(dateString).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const formatCurrency = (numberStr) =>
    parseFloat(numberStr || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const formatCount = (number) => (number || 0).toLocaleString();

  // helpers for averages
  const safeDivide = (fees, count) => {
    const f = parseFloat(fees || 0);
    const c = parseFloat(count || 0);
    if (!c) return 0;
    return f / c;
  };
  const formatAvg = (fees, count) => safeDivide(fees, count).toFixed(2);

  // --- Data Processing ---
  const filteredData = salesData.filter(item => item.month_start_date === selectedMonth);

  const regionalData = filteredData.reduce((acc, row) => {
    const region = row.region || 'Unknown';
    if (!acc[region]) {
      acc[region] = { offices: [], totals: {}, totalsAvg: {} };
    }
    acc[region].offices.push(row);
    return acc;
  }, {});

  // ✅ --- FULL AND CORRECT TOTALS CALCULATION ---
  const columnsToSum = [
    'new_business_count', 'new_business_fees', 'endorsement_count',
    'endorsement_fees', 'installment_count', 'installment_fees', 'dmv_count',
    'dmv_fees', 'reissue_count', 'reissue_fees', 'renewal_count',
    'renewal_fees', 'taxes_count', 'tax_fees'
  ];
  const initialTotals = columnsToSum.reduce((acc, col) => ({ ...acc, [col]: 0 }), {});
  const grandTotal = { ...initialTotals };

  for (const region in regionalData) {
    const regionTotals = regionalData[region].offices.reduce((acc, office) => {
      columnsToSum.forEach(col => {
        acc[col] += parseFloat(office[col]) || 0;
      });
      return acc;
    }, { ...initialTotals });

    // compute per-region averages from summed totals
    const regionAverages = {
      nb_avg:          formatAvg(regionTotals.new_business_fees, regionTotals.new_business_count),
      endorsement_avg: formatAvg(regionTotals.endorsement_fees,  regionTotals.endorsement_count),
      installment_avg: formatAvg(regionTotals.installment_fees,  regionTotals.installment_count),
      dmv_avg:         formatAvg(regionTotals.dmv_fees,          regionTotals.dmv_count),
      reissue_avg:     formatAvg(regionTotals.reissue_fees,      regionTotals.reissue_count),
      renewal_avg:     formatAvg(regionTotals.renewal_fees,      regionTotals.renewal_count),
      tax_avg:         formatAvg(regionTotals.tax_fees,          regionTotals.taxes_count),
    };

    regionalData[region].totals = regionTotals;
    regionalData[region].totalsAvg = regionAverages;

    columnsToSum.forEach(col => {
      grandTotal[col] += regionTotals[col];
    });
  }

  // 🔢 Grand-total averages (fees ÷ count)
  const grandAverages = {
    nb_avg:          formatAvg(grandTotal.new_business_fees, grandTotal.new_business_count),
    endorsement_avg: formatAvg(grandTotal.endorsement_fees,  grandTotal.endorsement_count),
    installment_avg: formatAvg(grandTotal.installment_fees,  grandTotal.installment_count),
    dmv_avg:         formatAvg(grandTotal.dmv_fees,          grandTotal.dmv_count),
    reissue_avg:     formatAvg(grandTotal.reissue_fees,      grandTotal.reissue_count),
    renewal_avg:     formatAvg(grandTotal.renewal_fees,      grandTotal.renewal_count),
    tax_avg:         formatAvg(grandTotal.tax_fees,          grandTotal.taxes_count),
  };

  if (loading) return <h2>Loading Office Numbers...</h2>;
  if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Office Performance</h1>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className={styles.monthSelector}   // ⬅️ use the red/white big selector style
          aria-label="Select month and year"
        >
          {monthOptions.map(month => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </select>
      </div>

      {/* Region cards */}
      <div className={styles.regionTotalsContainer}>
        {Object.keys(regionalData).sort().map(region => (
          <div key={region} className={styles.regionCard}>
            <h3>{region}</h3>
            <p>{formatCount(regionalData[region].totals.new_business_count)} <span>New Business</span></p>
            <p>{formatCurrency(regionalData[region].totals.new_business_fees)} <span>Fees</span></p>
          </div>
        ))}
        <div key="grand-total" className={styles.regionCard} style={{ borderColor: '#2ecc71' }}>
          <h3>Grand Total</h3>
          <p>{formatCount(grandTotal.new_business_count)} <span>New Business</span></p>
          <p>{formatCurrency(grandTotal.new_business_fees)} <span>Fees</span></p>
          <p>{grandAverages.nb_avg} <span>NB Avg</span></p>
        </div>
      </div>

      {/* Grand Total table right below the cards */}
      <div className={styles.regionTableContainer}>
        <h2>Grand Total</h2>
        <table className={styles.ticketsTable}>
          <thead>
            <tr>
              <th>Scope</th>
              <th>New Business #</th>
              <th>New Business Fees</th>
              <th>NB Avg</th>
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
            <tr className={styles.totalRow}>
              <td>ALL REGIONS</td>
              <td>{formatCount(grandTotal.new_business_count)}</td>
              <td>{formatCurrency(grandTotal.new_business_fees)}</td>
              <td>{grandAverages.nb_avg}</td>

              <td>{formatCount(grandTotal.endorsement_count)}</td>
              <td>{formatCurrency(grandTotal.endorsement_fees)}</td>
              <td>{grandAverages.endorsement_avg}</td>

              <td>{formatCount(grandTotal.installment_count)}</td>
              <td>{formatCurrency(grandTotal.installment_fees)}</td>
              <td>{grandAverages.installment_avg}</td>

              <td>{formatCount(grandTotal.dmv_count)}</td>
              <td>{formatCurrency(grandTotal.dmv_fees)}</td>
              <td>{grandAverages.dmv_avg}</td>

              <td>{formatCount(grandTotal.reissue_count)}</td>
              <td>{formatCurrency(grandTotal.reissue_fees)}</td>
              <td>{grandAverages.reissue_avg}</td>

              <td>{formatCount(grandTotal.renewal_count)}</td>
              <td>{formatCurrency(grandTotal.renewal_fees)}</td>
              <td>{grandAverages.renewal_avg}</td>

              <td>{formatCount(grandTotal.taxes_count)}</td>
              <td>{formatCurrency(grandTotal.tax_fees)}</td>
              <td>{grandAverages.tax_avg}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Region-level tables */}
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
              {regionalData[region].offices
                .sort((a, b) => a.office.localeCompare(b.office))
                .map(row => (
                  <tr key={row.id}>
                    <td>{row.office}</td>
                    <td>{formatCount(row.new_business_count)}</td>
                    <td>{formatCurrency(row.new_business_fees)}</td>
                    <td>{row.nb_avg}</td>
                    <td>{formatCount(row.endorsement_count)}</td>
                    <td>{formatCurrency(row.endorsement_fees)}</td>
                    <td>{row.endorsement_avg}</td>
                    <td>{formatCount(row.installment_count)}</td>
                    <td>{formatCurrency(row.installment_fees)}</td>
                    <td>{row.installment_avg}</td>
                    <td>{formatCount(row.dmv_count)}</td>
                    <td>{formatCurrency(row.dmv_fees)}</td>
                    <td>{row.dmv_avg}</td>
                    <td>{formatCount(row.reissue_count)}</td>
                    <td>{formatCurrency(row.reissue_fees)}</td>
                    <td>{row.reissue_avg}</td>
                    <td>{formatCount(row.renewal_count)}</td>
                    <td>{formatCurrency(row.renewal_fees)}</td>
                    <td>{row.renewal_avg}</td>
                    <td>{formatCount(row.taxes_count)}</td>
                    <td>{formatCurrency(row.tax_fees)}</td>
                    <td>{row.tax_avg}</td>
                  </tr>
                ))}

              {/* Totals row with computed averages */}
              <tr key={`${region}-totals`} className={styles.totalRow}>
                <td>{region} TOTALS</td>
                <td>{formatCount(regionalData[region].totals.new_business_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.new_business_fees)}</td>
                <td>{regionalData[region].totalsAvg.nb_avg}</td>

                <td>{formatCount(regionalData[region].totals.endorsement_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.endorsement_fees)}</td>
                <td>{regionalData[region].totalsAvg.endorsement_avg}</td>

                <td>{formatCount(regionalData[region].totals.installment_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.installment_fees)}</td>
                <td>{regionalData[region].totalsAvg.installment_avg}</td>

                <td>{formatCount(regionalData[region].totals.dmv_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.dmv_fees)}</td>
                <td>{regionalData[region].totalsAvg.dmv_avg}</td>

                <td>{formatCount(regionalData[region].totals.reissue_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.reissue_fees)}</td>
                <td>{regionalData[region].totalsAvg.reissue_avg}</td>

                <td>{formatCount(regionalData[region].totals.renewal_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.renewal_fees)}</td>
                <td>{regionalData[region].totalsAvg.renewal_avg}</td>

                <td>{formatCount(regionalData[region].totals.taxes_count)}</td>
                <td>{formatCurrency(regionalData[region].totals.tax_fees)}</td>
                <td>{regionalData[region].totalsAvg.tax_avg}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default OfficeNumbers;


