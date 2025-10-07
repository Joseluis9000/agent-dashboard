// src/layouts/SupervisorLayout.jsx

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import SupervisorSidebar from '../components/SupervisorDashboard/SupervisorSidebar';
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css';

// 1. Import your Supabase client
import { supabase } from '../supabaseClient';

const SupervisorLayout = () => {
    const navigate = useNavigate();

    // 2. Make the function 'async' to handle the Supabase sign-out
    const handleLogout = async () => {
        // 3. Add the command to sign out from Supabase
        await supabase.auth.signOut();
        
        // These lines clean up local data and redirect the user
        localStorage.clear();
        navigate('/login', { replace: true });
    };

    return (
        <div className={styles.dashboardContainer}>
            <SupervisorSidebar onLogout={handleLogout} />
            
            <main className={styles.mainContent}>
                {/* Child routes like SupervisorTickets will render here */}
                <Outlet />
            </main>
        </div>
    );
};

export default SupervisorLayout;