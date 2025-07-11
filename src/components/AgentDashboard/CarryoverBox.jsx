// src/components/AgentDashboard/CarryoverBox.jsx

import React from 'react';
import styles from './Dashboard.module.css';

// ✅ NEW: Helper function to format the value as currency.
const formatCurrency = (value) => {
  const num = Number(String(value).replace(/[$,]/g, '')) || 0;
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

const CarryoverBox = ({ label, value }) => {
    const numberValue = Number(value) || 0;

    return (
        <div className={styles.carryoverBox}>
            <strong>{label}</strong>
            {/* ✅ UPDATED: The span now formats the value and applies a
                conditional style if the amount is greater than zero. */}
            <span className={numberValue > 0 ? styles.carryoverAmountRed : ''}>
                {formatCurrency(numberValue)}
            </span>
        </div>
    );
};

export default CarryoverBox;CarryoverBox;