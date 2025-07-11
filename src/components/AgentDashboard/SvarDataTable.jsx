// src/components/AgentDashboard/SvarDataTable.jsx

import React from 'react';
import styles from './SVARPage.module.css';

// Helper to format header keys into readable text
const formatHeader = (key) => {
  const cleanKey = key.replace(/^(ar|sv)/i, ''); // Remove ar/sv prefix
  return cleanKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase());
};

// Helper to format date strings
const formatDate = (dateStr) => {
  if (!dateStr || !dateStr.includes('T')) return "N/A";
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// A small component to render the actual key-value table
const DetailsTable = ({ data }) => (
  <table className={styles.svarTable}>
    <tbody>
      {Object.entries(data).map(([key, value]) => (
        <tr key={key}>
          <td>{formatHeader(key)}</td>
          <td>{key.toLowerCase().includes('date') ? formatDate(value) : (value || "N/A")}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const SvarDataTable = ({ title, data }) => {
  if (!data || data.length === 0) {
    return (
      <div className={styles.card}>
        <h3>{title}</h3>
        <p>No data available.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3>{title}</h3>
      {data.map((item, index) => {
        // ✅ NEW: Logic to separate fields into AR, SV, and General groups
        const generalData = {};
        const arData = {};
        const svData = {};

        Object.entries(item).forEach(([key, value]) => {
          if (key.toLowerCase().startsWith('ar')) {
            arData[key] = value;
          } else if (key.toLowerCase().startsWith('sv')) {
            svData[key] = value;
          } else {
            generalData[key] = value;
          }
        });

        return (
          <div key={index} className={styles.tableWrapper}>
            {/* Render general data first if it exists */}
            {Object.keys(generalData).length > 0 && <DetailsTable data={generalData} />}

            {/* Container for the two horizontal boxes */}
            <div className={styles.horizontalContainer}>
              <div className={styles.violationBox}>
                <h4>AR Details</h4>
                <DetailsTable data={arData} />
              </div>
              <div className={styles.violationBox}>
                <h4>SV Details</h4>
                <DetailsTable data={svData} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SvarDataTable;