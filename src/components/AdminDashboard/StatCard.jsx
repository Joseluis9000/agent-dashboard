import React from 'react';
import styles from './AdminDashboard.module.css';

/**
 * StatCard for the Office Performance page.
 *
 * This version is updated to work directly with the props being sent from OfficeNumbers.jsx.
 * It accepts `totalFees`, `avgFee`, and `isGrandTotal`.
 */
const StatCard = ({
  // The props that OfficeNumbers.jsx is sending
  title,
  totalBusiness = 0,
  totalFees = '$0',
  avgFee = '$0',
  isGrandTotal = false,
}) => {
  // Helper to format the number for new business count
  const fmtNumber = (n) => Number(n || 0).toLocaleString();

  return (
    <div
      // Use isGrandTotal to apply the highlight style
      className={`${styles.summaryCard} ${
        isGrandTotal ? styles.summaryCardHighlight : ''
      }`}
    >
      <h4 className={styles.summaryCardTitle}>{title}</h4>
      <p className={styles.summaryCardBig}>
        {fmtNumber(totalBusiness)}{' '}
        <span className={styles.dim}>New Business</span>
      </p>
      {/* Display the total and average fees */}
      <p className={styles.summaryCardMid}>{totalFees}</p>
      <span className={styles.dim}>{avgFee} Avg</span>
    </div>
  );
};

export default StatCard;