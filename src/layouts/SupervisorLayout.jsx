// src/layouts/SupervisorLayout.jsx

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

// 1. Import the correct SUPERVISOR sidebar, not the admin one.
import SupervisorSidebar from '../components/SupervisorDashboard/SupervisorSidebar';

// 2. Use the styles associated with the supervisor dashboard for consistency.
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css';

const SupervisorLayout = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        // This can be expanded with supabase.auth.signOut() if needed
        localStorage.clear();
        navigate('/login');
    };

    return (
        <div className={styles.dashboardContainer}>
            {/* 3. Render the correct SupervisorSidebar component */}
            <SupervisorSidebar onLogout={handleLogout} />
            
            <main className={styles.mainContent}>
                {/* Child routes like SupervisorTickets will render here */}
                <Outlet />
            </main>
        </div>
    );
};

export default SupervisorLayout;