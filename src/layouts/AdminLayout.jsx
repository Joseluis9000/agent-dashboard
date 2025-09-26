import React from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import AdminSidebar from '../components/AdminDashboard/AdminSidebar';
import styles from './AdminLayout.module.css';

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
        <Outlet /> {/* Admin pages (OfficeNumbers, ManageUsers, etc.) render here */}
      </main>
    </div>
  );
};

export default AdminLayout;
