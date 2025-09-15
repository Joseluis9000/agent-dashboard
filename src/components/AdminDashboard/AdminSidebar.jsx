// src/components/AdminDashboard/AdminSidebar.jsx

import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './AdminDashboard.module.css'; 

const AdminSidebar = ({ onLogout }) => {
    return (
        <div className={styles.sidebar}>
            <img src="/fiesta-logo.png" alt="Fiesta Insurance Logo" className={styles.logo} />
            <h3>Admin Panel</h3>
            <nav className={styles.nav}>
                <NavLink 
                    to="/admin/tickets" 
                    className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                >
                    Manage Tickets
                </NavLink>
                <NavLink 
                    to="/admin/office-numbers" 
                    className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                >
                    Office Numbers
                </NavLink>

                {/* ✅ New link for User Management added below */}
                <NavLink 
                    to="/admin/manage-users" 
                    className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                >
                    Manage Users
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

export default AdminSidebar;