// src/pages/admin/marketing/MarketingAssets.jsx

import React from 'react';
import styles from '../MarketingOps.module.css';

const MarketingAssets = () => {
  return (
    <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Assets</h2>
      <p style={{ margin: 0, color: '#64748b', fontWeight: 750 }}>
        Future home for artwork, photos, mailers, flyers, proofs, contracts, invoices, and brand files.
      </p>
      <div className={styles.emptyState}>Asset library will be built after Campaign Manager.</div>
    </section>
  );
};

export default MarketingAssets;
