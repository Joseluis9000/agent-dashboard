// src/pages/SupervisorDashboard.jsx

import React from 'react';
import { Outlet } from 'react-router-dom';

const SupervisorDashboard = () => {
  // This page component now only returns the content that will
  // appear inside the layout you already fixed.
  return (
    <div>
      <h1>Welcome, Supervisor!</h1>
      <p>Select an option from the sidebar to get started.</p>

      {/* This <Outlet> allows nested routes like /supervisor/tickets to render here */}
      <Outlet />
    </div>
  );
};

export default SupervisorDashboard;