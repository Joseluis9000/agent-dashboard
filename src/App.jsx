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
import EODReport from './pages/EODReport'; // ✅ 1. Import the new page

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Login />} />

        {/* Agent Routes */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sv-ar" element={<SVARPage />} />
        <Route path="/disqualified-policies" element={<DisqualifiedPolicies />} />
        <Route path="/ticketing-system" element={<TicketingSystem />} />
        <Route path="/eod-report" element={<EODReport />} /> {/* ✅ 2. Add the new route */}

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