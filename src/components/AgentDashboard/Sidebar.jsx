// src/components/AgentDashboard/Sidebar.jsx

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Dashboard.module.css';

const Sidebar = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Consider a path active if it matches exactly OR is a parent of the current path
  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/sv-ar', label: "Scanning Violations & AR's" },
    { path: '/agent/violations', label: 'My Violations' }, // ✅ NEW
    { path: '/disqualified-policies', label: 'Disqualified Policies' },
    { path: '/ticketing-system', label: 'Submit a Ticket' },
    { path: '/eod-report', label: 'EOD Report' },
    { path: '/office-eods', label: 'Office & Agent EODs' },
  ];

  return (
    <aside className={styles.sidebar}>
      <img
        src="/fiesta-logo.png"
        alt="Fiesta Insurance Logo"
        className={styles.logo}
      />
      <nav>
        {menuItems.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className={isActive(item.path) ? styles.active : ''}
            aria-current={isActive(item.path) ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button onClick={onLogout} className={styles.logoutButton} type="button">
        Logout
      </button>
    </aside>
  );
};

export default Sidebar;

