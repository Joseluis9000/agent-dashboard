// src/layouts/AdminLayout.jsx
import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import AdminSidebar from '../components/AdminDashboard/AdminSidebar';
import styles from './AdminLayout.module.css';

const AdminLayout = () => {
  // ✅ Use signOut from context to keep app state in sync
  const { user, loading, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    // No need to manually navigate; App.jsx will detect !user and redirect to /login
  };

  if (loading) {
    return <div>Loading session...</div>;
  }

  // 1. Must be logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. Must be admin role
  if (user.user_metadata?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // 3. Sidebar + content
  return (
    <div className={styles.layoutContainer}>
      <AdminSidebar onLogout={handleLogout} />
      <main className={styles.content}>
        {/* Admin pages (OfficeNumbers, ManageUsers, Commission Log) render here */}
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;