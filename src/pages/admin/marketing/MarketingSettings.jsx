// src/pages/admin/marketing/MarketingSettings.jsx

import React from 'react';
import styles from '../MarketingOps.module.css';

const MarketingSettings = () => {
  return (
    <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Settings</h2>
      <p style={{ margin: 0, color: '#64748b', fontWeight: 750 }}>
        Future home for vendors, offices, activity types, campaign defaults, and admin settings.
      </p>
      <div className={styles.emptyState}>Settings will be built once the core workflows are complete.</div>
    </section>
  );
};

export default MarketingSettings;
