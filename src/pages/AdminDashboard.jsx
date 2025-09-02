// src/pages/AdminDashboard.jsx

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminDashboard/AdminSidebar';
// ✅ Use the new styles from the AdminDashboard component folder
import styles from '../components/AdminDashboard/AdminDashboard.module.css'; 

const AdminDashboard = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('userEmail');
        navigate('/login');
    };

    return (
        <div className={styles.dashboardContainer}>
            <AdminSidebar onLogout={handleLogout} />
            <main className={styles.mainContent}>
                <Outlet /> {/* Child routes like AdminTickets will render here */}
            </main>
        </div>
    );
};

export default AdminDashboard;