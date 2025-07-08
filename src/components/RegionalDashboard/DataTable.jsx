import React from 'react';
import styles from './RegionalDashboard.module.css';

const formatCell = (cellValue, header) => {
  const lowerHeader = header.toLowerCase().trim();

  if (lowerHeader.includes('date') || lowerHeader === 'month') {
    if (typeof cellValue === 'string' && cellValue.includes('T')) {
      return cellValue.split('T')[0];
    }
  }
  
  if (lowerHeader.includes('fee') || lowerHeader.includes('avg')) {
    if (typeof cellValue !== 'string' && typeof cellValue !== 'number' || String(cellValue).includes('#')) {
      return cellValue;
    }
    const numberValue = parseFloat(String(cellValue).replace(/[^0-9.-]+/g, ''));
    if (!isNaN(numberValue)) {
      return numberValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      });
    }
  }

  return cellValue;
};


const DataTable = ({ title, data, dataType }) => {
  if (!data || data.length === 0) {
    return (
      <div className={styles.card}>
        <h2>{title}</h2>
        <p>No data available.</p>
      </div>
    );
  }

  let headers;
  let rows;

  if (dataType === 'objectArray') {
    headers = data[0] ? Object.keys(data[0]) : [];
    rows = data;
  } else { // arrayArray
    // Ensure we don't try to slice an empty array
    if (data.length < 2) {
        return (
            <div className={styles.card}>
              <h2>{title}</h2>
              <p>No data available.</p>
            </div>
        );
    }
    headers = data[0];
    rows = data.slice(1);
  }

  if (headers.length === 0 || rows.length === 0) {
    return (
      <div className={styles.card}>
        <h2>{title}</h2>
        <p>No data available.</p>
      </div>
    );
  }

  // --- Totals and Averages Calculation ---
  const sums = {};
  headers.forEach((header, colIndex) => {
    const lowerHeader = header.toLowerCase().trim();
    const total = rows.reduce((sum, currentRow) => {
      const cellValue = dataType === 'objectArray' ? currentRow[header] : currentRow[colIndex];
      const number = parseFloat(String(cellValue).replace(/[^0-9.-]+/g, '')) || 0;
      return sum + number;
    }, 0);
    sums[lowerHeader] = total;
  });

  const footerValues = headers.map(header => {
    const lowerHeader = header.toLowerCase().trim();
    
    if (lowerHeader.includes('avg')) {
      if (lowerHeader.includes('nb')) return sums['nb'] > 0 ? sums['nb fee'] / sums['nb'] : 0;
      if (lowerHeader.includes('en')) return sums['en'] > 0 ? sums['en fee'] / sums['en'] : 0;
      if (lowerHeader.includes('rnwl')) return sums['rnwl'] > 0 ? sums['rnwl fee'] / sums['rnwl'] : 0;
      if (lowerHeader.includes('reissue')) return sums['reissue'] > 0 ? sums['reissue fee'] / sums['reissue'] : 0;
      if (lowerHeader.includes('dmv')) return sums['dmv'] > 0 ? sums['dmv fee'] / sums['dmv'] : 0;
      if (lowerHeader.includes('tax')) return sums['taxes'] > 0 ? sums['tax fee'] / sums['taxes'] : 0;
    }

    // ✅ FIX: Simplified the check to correctly include all specified columns
    const columnsToSum = ['nb', 'nb goal', 'pacing nb', 'en', 'rnwl', 'reissue', 'dmv', 'taxes', 'nb fee', 'en fee', 'rnwl fee', 'reissue fee', 'dmv fee', 'tax fee', 'total fee', 'arfeeamount', 'svfeeamount'];
    if (columnsToSum.includes(lowerHeader)) {
        return sums[lowerHeader];
    }
    
    return null;
  });

  return (
    <div className={styles.card}>
      <h2>{title}</h2>
      <div className={styles.tableContainer}>
        <table>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {headers.map((header, cellIndex) => {
                  const cell = dataType === 'objectArray' ? row[header] : row[cellIndex];
                  return <td key={cellIndex}>{formatCell(cell, header)}</td>
                })}
              </tr>
            ))}
          </tbody>
          {footerValues.some(val => val !== null) && (
            <tfoot>
                <tr className={styles.totalsRow}>
                {footerValues.map((value, index) => (
                    <td key={index}>
                    {value !== null ? formatCell(String(value), headers[index]) : (headers[index].toLowerCase().trim() === 'office' || headers[index].toLowerCase().trim() === 'agentname' ? 'Totals' : '')}
                    </td>
                ))}
                </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default DataTable;