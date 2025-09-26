// src/App.jsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import SupervisorLayout from './layouts/SupervisorLayout';

// Page Imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SVARPage from './pages/SVARPage';
import DisqualifiedPolicies from './pages/DisqualifiedPolicies';
import TicketingSystem from './pages/TicketingSystem';
import AdminDashboard from './pages/AdminDashboard';
import AdminTickets from './pages/AdminTickets';
import SupervisorDashboard from './pages/SupervisorDashboard';
import OfficeNumbers from './pages/OfficeNumbers';
import SupervisorTickets from './pages/SupervisorTickets';
import EODReport from './pages/EODReport';
import EODHistory from './pages/EODHistory';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminManageUsers from './pages/AdminManageUsers';
import EnterViolation from './pages/admin/EnterViolation';
import ManageViolations from './pages/admin/ManageViolations'; // ✅ 1. IMPORT THE NEW DASHBOARD

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected Agent Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sv-ar" element={<SVARPage />} />
            <Route path="/disqualified-policies" element={<DisqualifiedPolicies />} />
            <Route path="/ticketing-system" element={<TicketingSystem />} />
            <Route path="/eod-report" element={<EODReport />} />
            <Route path="/office-eods" element={<EODHistory />} />
          </Route>

          {/* Protected Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="office-numbers" element={<OfficeNumbers />} />
            <Route path="manage-users" element={<AdminManageUsers />} />
            
            {/* ✅ 2. REPLACE the old route with these two new ones */}
            <Route path="violations" element={<ManageViolations />} />
            <Route path="enter-violation" element={<EnterViolation />} />
          </Route>

          {/* Protected Supervisor Routes */}
          <Route path="/supervisor" element={<SupervisorLayout />}>
            <Route index element={<SupervisorDashboard />} />
            <Route path="office-numbers" element={<OfficeNumbers />} />
            <Route path="tickets" element={<SupervisorTickets />} />
          </Route>

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;