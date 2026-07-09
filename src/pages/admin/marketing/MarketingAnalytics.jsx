// src/pages/admin/marketing/MarketingAnalytics.jsx

import React from 'react';
import styles from '../MarketingOps.module.css';

const MarketingAnalytics = () => {
  return (
    <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Analytics</h2>
      <p style={{ margin: 0, color: '#64748b', fontWeight: 750 }}>
        Future home for spend, reach, coverage, impressions, heat maps, and ROI reporting.
      </p>
      <div className={styles.emptyState}>Analytics will be wired after campaign rollups are complete.</div>
    </section>
  );
};

export default MarketingAnalytics;
