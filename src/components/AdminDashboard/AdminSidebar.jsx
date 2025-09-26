import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './AdminDashboard.module.css';

const AdminSidebar = ({ onLogout, collapsed = false, onToggle }) => {
  return (
    <aside className={styles.sidebar} aria-label="Admin navigation">
      <div className={styles.sidebarTop}>
        <img
          src="/fiesta-logo.png"
          alt="Fiesta Insurance Logo"
          className={styles.logo}
        />
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggle}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          ☰
        </button>
      </div>

      <h3 className={styles.sidebarTitle}>Admin Panel</h3>

      <nav className={styles.nav}>
        <NavLink
          to="/admin/tickets"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.activeLink : ''}`
          }
          end
        >
          Manage Tickets
        </NavLink>

        <NavLink
          to="/admin/office-numbers"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.activeLink : ''}`
          }
        >
          Office Numbers
        </NavLink>

        <NavLink
          to="/admin/manage-users"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.activeLink : ''}`
          }
        >
          Manage Users
        </NavLink>

        {/* ✅ Updated Link */}
        <NavLink
          to="/admin/violations" // Points to the new dashboard page
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.activeLink : ''}`
          }
        >
          Manage Violations
        </NavLink>
        
      </nav>

      <div className={styles.logoutSection}>
        <button onClick={onLogout} className={styles.logoutButton}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
