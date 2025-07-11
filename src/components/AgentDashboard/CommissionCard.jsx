// src/components/AgentDashboard/CommissionCard.jsx

import React, { useState } from 'react';
import styles from './Dashboard.module.css';
import CarryoverBox from './CarryoverBox';

// Helper to format currency
const formatCurrency = (value) => {
  const num = Number(String(value).replace(/[$,]/g, '')) || 0;
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

// Helper to determine text color based on value
const getStatusColor = (value, threshold = 0) => {
  const num = Number(value);
  return (isNaN(num) || value === "No Bonus" || num < threshold) ? styles.textRed : styles.textGreen;
};

// Helper to format the bonus tier as a percentage
const formatBonusTier = (tier) => {
  const num = Number(tier);
  // If it's a valid number and not zero, format as a percent
  if (!isNaN(num) && num > 0) {
    // ✅ UPDATED: Allows for up to 2 decimal places in the percentage
    return num.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 2 });
  }
  // Otherwise, return the original text (e.g., "Not Met")
  return tier;
};


const CommissionCard = ({ title, data, isHistory = false }) => {
  const [showQualifications, setShowQualifications] = useState(false);

  // If no data is provided, don't render anything
  if (!data) return null;

  const weekRange = `${data.week_start_date?.split('T')[0] || ''} - ${data.week_end_date?.split('T')[0] || ''}`;

  return (
    <div className={styles.card}>
      <h3>{title}</h3>
      <p className={styles.weekRange}>{weekRange}</p>

      {/*-- Fees --*/}
      <div className={styles.dataRow}><span>NB/RW Fees:</span> <span>{formatCurrency(data.nbrwfee)}</span></div>
      <div className={styles.dataRow}><span>EN Fees:</span> <span>{formatCurrency(data.enfee)}</span></div>
      <div className={styles.dataRow}><strong>Total:</strong> <strong>{formatCurrency(data.totalnben)}</strong></div>

      <hr className={styles.divider} />

      {/*-- Expenses --*/}
      <strong className={styles.sectionTitle}>EXPENSES</strong>
      <div className={styles.dataRow}><span>Gross Pay:</span> <span>{formatCurrency(data.grosspay)}</span></div>
      <div className={styles.dataRow}>
        <span>Total NBs: {data.totalnbs}</span>
        <span>NB Corp Fee: {formatCurrency(data.nbcorpfee)}</span>
      </div>
      <div className={styles.dataRow}><span>EN Corp Fee:</span> <span>{formatCurrency(data.encorpfee)}</span></div>
      <div className={styles.dataRow}><span>Referrals/Pay Out:</span> <span>{formatCurrency(data.refferalspayout)}</span></div>
      <div className={`${styles.dataRow} ${getStatusColor(data['nben(afterfees)'], 500)}`}>
        <strong>Total:</strong>
        <strong>{formatCurrency(data['nben(afterfees)'])}</strong>
      </div>
      <p className={styles.disclaimer}>*must be $500 or more to qualify for COMMISSION</p>

      {/*-- Commission --*/}
      <div className={styles.dataRow}><span>Re-Issue and Renewals:</span> <span>{formatCurrency(data.reissuerenewaltotal)}</span></div>
      <div className={styles.dataRow}><span>Total Rev After Deductions:</span> <span>{formatCurrency(data['totalrev(afterfees)2'])}</span></div>
      <div className={styles.dataRow}><span>Commission Tier:</span> <span>{formatBonusTier(data.bonustier)}</span></div>
      <div className={styles.dataRow}><span>Commission:</span> <span>{formatCurrency(data.totalbonus)}</span></div>
      <div className={styles.dataRow}><span>Total Violations:</span> <span>{formatCurrency(data.totalviolations)}</span></div>
      <div className={`${styles.dataRow} ${getStatusColor(data.commissionafterarfeescanningviolations)}`}>
        <strong>Total Commission:</strong>
        <strong>{formatCurrency(data.commissionafterarfeescanningviolations)}</strong>
      </div>

      {/*-- Carryovers --*/}
      <strong className={styles.sectionTitle}>A.R. Fee Carry Overs</strong>
      <div className={styles.carryoverGrid}>
          <CarryoverBox label="4+ Weeks Old" value={data.arcarryoverolderthan4weeks} />
          <CarryoverBox label="3 Weeks Old" value={data.arcarryoverthreeweeks} />
          <CarryoverBox label="2 Weeks Old" value={data.arcarryovertwoweeks} />
          <CarryoverBox label="Current Week" value={data.arcurrentweek} />
      </div>

      <strong className={styles.sectionTitle}>Scanning Violations Carry Overs</strong>
      <div className={styles.carryoverGrid}>
          <CarryoverBox label="4+ Weeks Old" value={data.svcarryoverolderthan4weeks} />
          <CarryoverBox label="3 Weeks Old" value={data.svcarryoverthreeweeks} />
          <CarryoverBox label="2 Weeks Old" value={data.svcarryovertwoweeks} />
          <CarryoverBox label="Current Week" value={data.svcurrentweek} />
      </div>

      {/*-- Qualifications Toggle --*/}
      {!isHistory && (
        <>
          <button onClick={() => setShowQualifications(!showQualifications)} className={styles.qualificationsButton}>
            Commission Qualifications
          </button>
          {showQualifications && (
            <div className={styles.qualificationsBox}>
              <p><b>10% Commission:</b> Agents qualify if they sell a minimum of 10 NBS.</p>
              <p><b>12.5% Commission:</b> Agents qualify if they sell a minimum of 17 NBS and achieve at least $3,500 in combined NBS & Endorsement revenue before deductions.</p>
              <p><b>Minimum COMMISSION Qualification:</b> Must have $500+ after deductions to qualify for commission.</p>
              <p><b>Revenue Calculation:</b> NB/RW + Endo - deductions.</p>
              <p><b>AR Fees and Scanning Violations:</b> Deducted from final commission.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommissionCard;