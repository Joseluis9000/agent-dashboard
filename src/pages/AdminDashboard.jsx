// src/pages/AdminDashboard.jsx

import React from 'react';
import { useAuth } from '../AuthContext'; // Import useAuth to get user info
// ✅ Use the new styles from the AdminDashboard component folder
import styles from '../components/AdminDashboard/AdminDashboard.module.css'; 

const AdminDashboard = () => {
    const { user } = useAuth();

    // Get the admin's name from the secure user metadata
    const adminName = user?.user_metadata?.full_name || 'Admin';

    // This component no longer needs to manage the sidebar or logout.
    // It only needs to display the content for the main admin dashboard page.
    
    return (
        // REMOVED: The outer div and the <AdminSidebar /> component.
        // The <Outlet/> is also removed because this is now a child page, not a layout.
        <main className={styles.mainContent}>
            <div className={styles.pageHeader}>
                <h1>Welcome, {adminName}</h1>
            </div>
            <div className={styles.card}>
                <h2>Admin Dashboard Overview</h2>
                <p>This is the main dashboard for administrators. Key metrics and summaries will be displayed here.</p>
                <p>Use the navigation on the left to manage tickets, office numbers, and users.</p>
            </div>
        </main>
    );
};

export default AdminDashboard;