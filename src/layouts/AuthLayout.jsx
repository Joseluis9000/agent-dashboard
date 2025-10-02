// src/layouts/AuthLayout.jsx

import React from 'react';
// ✅ ADD 'Navigate' TO THIS IMPORT
import { Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/AgentDashboard/Sidebar';
import styles from './AuthLayout.module.css';

const AuthLayout = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error logging out:', error);
      }
    } finally {
      // ✅ Keep agent pages consistent: they read userEmail from localStorage
      localStorage.removeItem('userEmail');
      navigate('/login', { replace: true });
    }
  };

  if (loading) {
    return <div>Loading session...</div>;
  }

  if (!user) {
    // This is where 'Navigate' is used
    return <Navigate to="/login" replace />;
  }

  // If there is a user, show the sidebar and the specific page content
  return (
    <div className={styles.layoutContainer}>
      <Sidebar onLogout={handleLogout} />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
};

export default AuthLayout; // ✅ make sure it’s exported
