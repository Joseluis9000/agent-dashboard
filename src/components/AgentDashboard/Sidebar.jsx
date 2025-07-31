// src/components/AgentDashboard/Sidebar.jsx

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Dashboard.module.css';

const Sidebar = ({ onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // ✅ MAKE SURE THIS ARRAY CONTAINS THE NEW OBJECT
    const menuItems = [
        { path: '/dashboard', label: 'Dashboard' },
        { path: '/sv-ar', label: "Scanning Violations & AR's" },
        { path: '/disqualified-policies', label: 'Disqualified Policies' } // <-- THIS IS THE KEY
    ];

    return (
        <aside className={styles.sidebar}>
            <img src="/fiesta-logo.png" alt="Fiesta Insurance Logo" className={styles.logo} />
            <nav>
                {menuItems.map(item => (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={location.pathname === item.path ? styles.active : ''}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
            <button onClick={onLogout} className={styles.logoutButton}>
                Logout
            </button>
        </aside>
    );
};

export default Sidebar;