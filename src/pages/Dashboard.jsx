// src/pages/DashboardPage.jsx

import React from 'react';
import { useAuth } from '../AuthContext';
import SalesDashboard from '../components/AgentDashboard/SalesDashboard';

export default function DashboardPage() {
  const { user, supabaseClient } = useAuth();

  // Shows a "Loading..." message while your app confirms the user is logged in.
  if (!user || !supabaseClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading Dashboard...</p>
      </div>
    );
  }

  // Once the user is confirmed, this renders the SalesDashboard and passes
  // the vital props: the authenticated client and the user's email.
  return (
    <SalesDashboard
      supabaseClient={supabaseClient}
      currentUserEmail={user.email}
    />
  );
}
