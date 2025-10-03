// src/pages/Dashboard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import styles from './DashboardPlaceholder.module.css';

function Dashboard() {
  const { user, profile } = useAuth();
  const agentFirstName =
    user?.user_metadata?.full_name?.split(' ')[0] ||
    profile?.full_name?.split(' ')[0] ||
    'Agent';

  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  return (
    <main className={styles.mainContent}>
      <div className={styles.placeholderCard}>
        <div className={styles.icon}>🚧</div>
        <h1>Welcome, {agentFirstName}!</h1>
        <h2>Dashboard Under Construction</h2>
        <p>
          This page is being upgraded to our new, faster Supabase data system.
          In the meantime, use the shortcuts below to access key tools.
        </p>

        {/* NEW: Quick CTA buttons */}
        <div className={styles.ctaRow}>
          <Link to="/uw/submit" className={styles.ctaButton}>
            Submit to Underwriting
          </Link>
          <Link to="/agent/violations" className={styles.ctaButtonSecondary}>
            My Violations
          </Link>
          {isUW && (
            <Link to="/uw/dashboard" className={styles.ctaButtonAccent}>
              UW Queue
            </Link>
          )}
        </div>

        <p className={styles.helperText}>
          You can also find these links in the left sidebar.
        </p>
      </div>
    </main>
  );
}

export default Dashboard;
