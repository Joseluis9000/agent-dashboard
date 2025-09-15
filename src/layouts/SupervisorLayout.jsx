import React from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import AdminSidebar from '../components/AdminDashboard/AdminSidebar'; // Assuming supervisors use the AdminSidebar
import styles from './AdminLayout.module.css'; // Reusing the same layout styles

const SupervisorLayout = () => {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login', { replace: true });
    };

    if (loading) {
        return <div>Loading session...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    const userRole = user.user_metadata?.role;
    if (userRole !== 'supervisor' && userRole !== 'admin') {
        // If not a supervisor or admin, redirect to their default dashboard
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className={styles.layoutContainer}>
            {/* You can create a dedicated SupervisorSidebar later if needed */}
            <AdminSidebar onLogout={handleLogout} />
            <main className={styles.content}>
                <Outlet />
            </main>
        </div>
    );
};

export default SupervisorLayout;