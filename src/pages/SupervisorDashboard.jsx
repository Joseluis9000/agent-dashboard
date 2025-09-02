// src/pages/SupervisorDashboard.jsx

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import SupervisorSidebar from '../components/SupervisorDashboard/SupervisorSidebar';
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css'; 

const SupervisorDashboard = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.clear(); // Clears all user data
        navigate('/login');
    };

    return (
        <div className={styles.dashboardContainer}>
            <SupervisorSidebar onLogout={handleLogout} />
            <main className={styles.mainContent}>
                <Outlet /> {/* Child pages like OfficeNumbers will render here */}
            </main>
        </div>
    );
};

export default SupervisorDashboard;