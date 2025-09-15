import React from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import AdminSidebar from '../components/AdminDashboard/AdminSidebar'; // Adjust path if needed
import styles from './AdminLayout.module.css'; // We can reuse the same layout styles

const AdminLayout = () => {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login', { replace: true });
    };

    if (loading) {
        return <div>Loading session...</div>;
    }

    // 1. Check if a user is logged in
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    // 2. Check if the logged-in user has the 'admin' role
    if (user.user_metadata?.role !== 'admin') {
        // If not an admin, redirect them to their default dashboard
        return <Navigate to="/dashboard" replace />;
    }

    // If all checks pass, show the admin sidebar and the specific admin page
    return (
        <div className={styles.layoutContainer}>
            <AdminSidebar onLogout={handleLogout} />
            <main className={styles.content}>
                <Outlet /> {/* Admin pages like Manage Users will render here */}
            </main>
        </div>
    );
};

export default AdminLayout;