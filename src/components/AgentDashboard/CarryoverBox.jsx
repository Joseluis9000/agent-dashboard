// src/components/AgentDashboard/CarryoverBox.jsx

import React from 'react';
import styles from './Dashboard.module.css';

const CarryoverBox = ({ label, value }) => {
    return (
        <div className={styles.carryoverBox}>
            <strong>{label}</strong>
            <span>{value || 0}</span>
        </div>
    );
};

export default CarryoverBox;