import React, { useState } from 'react';
import styles from './ReportDetailModal.module.css';

const formatCurrency = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '$0.00';
};

const ReportDetailModal = ({ report, onClose }) => {
  const [activeTab, setActiveTab] = useState('summary');

  const {
    raw_transactions = [],
    receipt_urls = [],
    referrals = [],
    ar_corrections = [],
  } = report;

  const renderSummary = () => (
    <div className={styles.resultsGrid}>
      {Object.entries(report)
        .filter(([key]) => key.endsWith('_count') || key.endsWith('_fee') || key.endsWith('_premium'))
        .map(([key, value]) => (
          <div key={key} className={styles.resultItem}>
            <span className={styles.resultKey}>{key.replace(/_/g, ' ')}:</span>
            <span className={styles.resultValue}>
              {key.includes('count') ? value : formatCurrency(value)}
            </span>
          </div>
        ))}
    </div>
  );

  const renderBalancing = () => {
    const totalReferralsPaid = referrals.reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);
    const expectedCashInHand = report.total_cash_in_hand - report.cash_difference;

    return (
      <>
        <h4>Payouts</h4>
        <div className={styles.detailSection}>
          <p><strong>Expenses:</strong> {formatCurrency(report.expenses_amount)}</p>
          <p><em>{report.expenses_explanation || 'No explanation provided.'}</em></p>
          <p><strong>Referrals Paid:</strong> {formatCurrency(totalReferralsPaid)}</p>
          {referrals.length > 0 && (
            <ul>
              {referrals.map((ref, i) => <li key={i}>{ref.clientName} - {ref.policyNumber} - {formatCurrency(ref.amount)}</li>)}
            </ul>
          )}
        </div>
        <h4>Cash Balancing</h4>
        <div className={styles.balancingGrid}>
            <div>Expected Cash:</div><div>{formatCurrency(expectedCashInHand)}</div>
            <div>Actual Cash:</div><div>{formatCurrency(report.total_cash_in_hand)}</div>
            <div>Difference:</div><div style={{color: report.cash_difference < 0 ? '#e53e3e' : '#38a169', fontWeight: 'bold'}}>{formatCurrency(report.cash_difference)}</div>
        </div>
         <h4>A/R Corrections</h4>
        <div className={styles.detailSection}>
          {ar_corrections.length > 0 ? (
            <ul>
              {ar_corrections.map((ar, i) => <li key={i}>Receipt #{ar.receiptNumber} - Premium: {formatCurrency(ar.premium)}, Fee: {formatCurrency(ar.fee)}</li>)}
            </ul>
          ) : <p>No A/R Corrections were made.</p>}
        </div>
      </>
    );
  };
  
  const renderTransactions = () => (
    <div className={styles.tableContainer}>
        <table className={styles.subTable}>
            <thead>
                <tr>
                    <th>Receipt</th><th>ID</th><th>Customer</th><th>Office</th><th>Type</th><th>Method</th><th>Premium</th><th>Fee</th><th>Total</th>
                </tr>
            </thead>
            <tbody>
                {raw_transactions.map((t, index) => (
                    <tr key={`${t.Receipt}-${index}`}>
                        <td>{t.Receipt}</td>
                        <td>{t.ID}</td>
                        <td>{t['Customer']}</td>
                        <td>{t['Office']}</td>
                        <td>{t['Type']}</td>
                        <td>{t['Method']}</td>
                        <td>{formatCurrency(t.Premium)}</td>
                        <td>{formatCurrency(t.Fee)}</td>
                        <td>{formatCurrency(t.Total)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
  );

  const renderReceipts = () => (
    <div className={styles.receiptList}>
      <h4>Uploaded Files</h4>
      {receipt_urls.length > 0 ? (
        <ul>
          {receipt_urls.map((url, index) => (
            <li key={index}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                View Receipt/Slip {index + 1}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No receipts were uploaded for this report.</p>
      )}
    </div>
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>&times;</button>
        <h3>EOD Details for {report.office_number} on {report.report_date}</h3>
        <p className={styles.subHeader}>Submitted by {report.agent_email}</p>

        <div className={styles.tabContainer}>
          <button onClick={() => setActiveTab('summary')} className={activeTab === 'summary' ? styles.activeTab : ''}>Summary</button>
          <button onClick={() => setActiveTab('balancing')} className={activeTab === 'balancing' ? styles.activeTab : ''}>Balancing & Payouts</button>
          <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? styles.activeTab : ''}>Transaction Log</button>
          <button onClick={() => setActiveTab('receipts')} className={activeTab === 'receipts' ? styles.activeTab : ''}>Receipts</button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'summary' && renderSummary()}
          {activeTab === 'balancing' && renderBalancing()}
          {activeTab === 'transactions' && renderTransactions()}
          {activeTab === 'receipts' && renderReceipts()}
        </div>
      </div>
    </div>
  );
};

export default ReportDetailModal;