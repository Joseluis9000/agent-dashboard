// src/layouts/AuthLayout.jsx

import React, { useState } from 'react';
// ✅ ADD 'Navigate' TO THIS IMPORT
import { Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/AgentDashboard/Sidebar';
import styles from './AuthLayout.module.css';
import TerritorySidebar from '../components/AgentDashboard/TerritorySidebar';
import territoryStyles from './TerritoryLayout.module.css';

const AuthLayout = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [territoryCollapsed, setTerritoryCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const isTerritoryManager = String(profile?.role || '').trim().toLowerCase() === 'territory_manager';

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

  if (isTerritoryManager) {
    return (
      <div className={territoryStyles.layout} style={{ '--territory-sidebar-width': territoryCollapsed ? '76px' : '260px' }}>
        <TerritorySidebar onLogout={handleLogout} collapsed={territoryCollapsed} onToggle={() => setTerritoryCollapsed((value) => !value)} />
        <main className={territoryStyles.content}><Outlet /></main>
      </div>
    );
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
