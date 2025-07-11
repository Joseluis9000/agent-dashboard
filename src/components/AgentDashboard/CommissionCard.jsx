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
  if (!isNaN(num) && num > 0) {
    return num.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 2 });
  }
  return tier;
};

const CommissionCard = ({ title, data, isHistory = false }) => {
  const [showQualifications, setShowQualifications] = useState(false);

  if (!data) return null;

  const weekRange = `${data.week_start_date?.split('T')[0] || ''} - ${data.week_end_date?.split('T')[0] || ''}`;

  return (
    <div className={styles.card}>
      {/* ... (rest of the component JSX is the same) ... */}
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
            // ✅ UPDATED QUALIFICATIONS BOX CONTENT
            <div className={styles.qualificationsBox}>
              <h4>1. Commission Qualification</h4>
              <p>✅ <strong>10% Commission:</strong> Agents qualify for a 10% commission if they sell a minimum of <strong>10 NBs</strong>.</p>
              <p>✅ <strong>12.5% Commission:</strong> Agents qualify for a 12.5% commission if they sell a minimum of <strong>17 NBs</strong> and achieve at least <strong>$3,500</strong> in combined NB & Endorsement revenue before deductions.</p>
              <p>✅ <strong>Minimum Commission Qualification:</strong> The amount remaining after NB/RW, Endorsement, and Gross Pay deductions must be <strong>$500 or more</strong> to qualify for commission for that week.</p>

              <h4>2. Revenue Calculation</h4>
              <p>✅ <strong>Calculate Total Revenue:</strong> NB/RW Revenue and Endorsement Revenue are added together.</p>
              <p>✅ <strong>Apply Deductions:</strong></p>
              <ul className={styles.deductionList}>
                <li>NB Sales Deduction: Deduct <strong>$20 per NB</strong> sold from the total revenue.</li>
                <li>Endorsement Fee: Deduct <strong>20%</strong> of total Endorsement Revenue.</li>
                <li>Referrals/Pay Out: Deducted from total revenue.</li>
                <li>Gross Pay Deduction: Deduct the agent’s gross pay.</li>
              </ul>
              <p>✅ <strong>After Deduction Revenue:</strong> Must be <strong>$500 or more</strong> to qualify for commission.</p>
              <p>✅ <strong>Re-Issues & Renewals:</strong> Revenue from re-issues and renewals is subject to a <strong>20% Corp charge</strong>. The remaining revenue is added after other deductions.</p>

              <h4>3. Commission Calculation</h4>
              <p>✅ <strong>Determine Commission Rate:</strong> Agents receive either 10% or 12.5% based on the qualification criteria.</p>
              <p>✅ <strong>Calculate Commission:</strong> The final revenue amount is multiplied by the applicable commission rate.</p>

              <h4>4. Adjustments</h4>
              <p>✅ <strong>AR Fees and Scanning Violations:</strong> Any AR fees or scanning violations will be deducted from the agent’s final commission. If the agent did not make commission, the fee is carried over.</p>
              
              <h4>5. After-Hours Posting Policy (New Rule)</h4>
              <p>✅ Policies posted after hours to the underwriting group will be <strong>disqualified</strong> from the NB# count needed for commission.</p>
              <p>✅ BF (Bind Fees) for such policies will also be <strong>disqualified</strong> from being added to NB Fees for that week.</p>
              <p>🔴 <strong>Exception:</strong> If the policy was sold at closing and that was the reason for the late post, it will still count.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommissionCard;