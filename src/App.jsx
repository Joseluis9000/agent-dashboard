// src/App.jsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

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
import ForgotPassword from './pages/ForgotPassword'; // ✅ 1. Import new page
import ResetPassword from './pages/ResetPassword';   // ✅ 2. Import new page

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} /> {/* ✅ 3. Add route */}
        <Route path="/reset-password" element={<ResetPassword />} />   {/* ✅ 4. Add route */}

        {/* Protected Agent Routes */}
        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />
        <Route
          path="/sv-ar"
          element={<ProtectedRoute><SVARPage /></ProtectedRoute>}
        />
        <Route
          path="/disqualified-policies"
          element={<ProtectedRoute><DisqualifiedPolicies /></ProtectedRoute>}
        />
        <Route
          path="/ticketing-system"
          element={<ProtectedRoute><TicketingSystem /></ProtectedRoute>}
        />
        <Route
          path="/eod-report"
          element={<ProtectedRoute><EODReport /></ProtectedRoute>}
        />
        <Route
          path="/office-eods"
          element={<ProtectedRoute><EODHistory /></ProtectedRoute>}
        />

        {/* Protected Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="office-numbers" element={<OfficeNumbers />} />
        </Route>

        {/* Protected Supervisor Routes */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute allowedRoles={['supervisor', 'admin']}>
              <SupervisorDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="office-numbers" element={<OfficeNumbers />} />
          <Route path="tickets" element={<SupervisorTickets />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;