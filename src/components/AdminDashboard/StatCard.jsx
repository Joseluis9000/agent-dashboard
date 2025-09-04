// src/components/AdminDashboard/StatCard.jsx

import React from 'react';
// ✅ Corrected path to use the AdminDashboard stylesheet
import styles from './AdminDashboard.module.css'; 

const StatCard = ({ title, value, previousValue, formatAs = 'number' }) => {
    let percentageChange = 0;
    if (previousValue > 0) {
        percentageChange = ((value - previousValue) / previousValue) * 100;
    }

    const formatValue = (val) => {
        if (formatAs === 'currency') {
            return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
        return val.toLocaleString();
    };

    const changeStyle = {
        color: percentageChange >= 0 ? '#2ecc71' : '#e74c3c',
    };

    return (
        <div className={styles.summaryCard}> {/* Use summaryCard for consistent styling */}
            <h4>{title}</h4>
            <p>{formatValue(value)}</p>
            <span style={changeStyle}>
                {percentageChange === 0 ? '' : (percentageChange > 0 ? '▲' : '▼')} {Math.abs(percentageChange).toFixed(1)}% vs. last month
            </span>
        </div>
    );
};

export default StatCard;