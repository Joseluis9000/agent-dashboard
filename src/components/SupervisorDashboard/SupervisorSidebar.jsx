// src/components/SupervisorDashboard/SupervisorSidebar.jsx

import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './SupervisorDashboard.module.css';

const SupervisorSidebar = ({ onLogout }) => {
    return (
        <div className={styles.sidebar}>
            <img src="/fiesta-logo.png" alt="Fiesta Insurance Logo" className={styles.logo} />
            <h3>Supervisor Panel</h3>
            <nav className={styles.nav}>
                <NavLink 
                    to="/supervisor/office-numbers" 
                    className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                >
                    Office Numbers
                </NavLink>
                
                {/* ✅ New link for managing tickets added below */}
                <NavLink 
                    to="/supervisor/tickets" 
                    className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                >
                    Manage Tickets
                </NavLink>
            </nav>
            <div className={styles.logoutSection}>
                <button onClick={onLogout} className={styles.logoutButton}>
                    Logout
                </button>
            </div>
        </div>
    );
};

export default SupervisorSidebar;