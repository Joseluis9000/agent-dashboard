// src/layouts/UnderwriterLayout.jsx
import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './UnderwriterLayout.module.css';

const UnderwriterLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Brand */}
        <div
          className={styles.brand}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/uw')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/uw')}
          aria-label="Underwriting home"
        >
          <img src="/fiesta-logo.png" alt="Fiesta Insurance" className={styles.logo} />
          <span className={styles.brandText}>Underwriting</span>
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          <button
            type="button"
            onClick={() => navigate('/uw')}
            className={`${styles.navItem} ${isActive('/uw') ? styles.active : ''}`}
            aria-current={isActive('/uw') ? 'page' : undefined}
          >
            Underwriting Queue
          </button>

          <button
            type="button"
            onClick={() => navigate('/uw/pending')}
            className={`${styles.navItem} ${isActive('/uw/pending') ? styles.active : ''}`}
            aria-current={isActive('/uw/pending') ? 'page' : undefined}
          >
            Pending Underwriting Log
          </button>

          <button
            type="button"
            onClick={() => navigate('/uw/log')}
            className={`${styles.navItem} ${isActive('/uw/log') ? styles.active : ''}`}
            aria-current={isActive('/uw/log') ? 'page' : undefined}
          >
            Underwriting Log
          </button>

          {/* ✅ NEW: Tax Reconciliation */}
          <button
            type="button"
            onClick={() => navigate('/uw/tax-reconciliation')}
            className={`${styles.navItem} ${
              isActive('/uw/tax-reconciliation') ? styles.active : ''
            }`}
            aria-current={isActive('/uw/tax-reconciliation') ? 'page' : undefined}
          >
            Tax Reconciliation
          </button>
        </nav>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.logout} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
};

export default UnderwriterLayout;
