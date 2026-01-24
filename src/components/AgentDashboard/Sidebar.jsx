// src/components/AgentDashboard/Sidebar.jsx
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import styles from './Dashboard.module.css';

const Sidebar = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  // Active if exact match OR a parent of current path
  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  // role from profiles first, then user_metadata fallback
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const menuItems = useMemo(() => {
    const items = [
      { path: '/dashboard', label: 'Dashboard' },

      // Agent items
      { path: '/agent/commission', label: 'Tax Commission Log' }, // ✅ ADDED
      { path: '/agent/violations', label: 'My Violations' },

      // Shared tools
      { path: '/uw/submit', label: 'Underwriting Submit' },
      { path: '/disqualified-policies', label: 'Disqualified Policies' },
      { path: '/ticketing-system', label: 'Appointment Calendar' },
      { path: '/eod-report', label: 'EOD Report' },
      { path: '/office-eods', label: 'Office & Agent EODs' },
    ];

    // Optional: show UW queue shortcut only for UW-capable roles
    if (isUW) {
      items.push({ path: '/uw/dashboard', label: 'Underwriting Queue' });
    }

    return items;
  }, [isUW]);

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



