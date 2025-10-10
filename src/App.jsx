// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Components
import ProtectedRoute from './components/ProtectedRoute';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import SupervisorLayout from './layouts/SupervisorLayout';
import UnderwriterLayout from './layouts/UnderwriterLayout'; // Underwriter-only shell

// Pages
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
import ManageViolations from './pages/admin/ManageViolations';
import AgentViolations from './pages/AgentViolations';

// Underwriting pages
import UnderwritingSubmit from './pages/agent/UnderwritingSubmit';
import UnderwritingDashboard from './pages/uw/UnderwritingDashboard';
import UnderwritingLog from './pages/uw/UnderwritingLog';
import PendingUnderwriting from './pages/uw/PendingUnderwriting'; // ✅ NEW

// NEW: Admin EODs (component you added under src/components)
import OfficeEODs from './components/OfficeEODs';

function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <div>Loading session...</div>;

  const getHomeRoute = () => {
    if (!user || !profile) return '/login';
    const role = profile.role || 'agent';
    switch (role) {
      case 'admin':
        return '/admin';
      case 'supervisor':
        return '/supervisor';
      case 'underwriter':
      case 'uw_manager':
        return '/uw';
      case 'agent':
      default:
        return '/dashboard';
    }
  };

  return (
    <Router>
      <Routes>
        {/* PUBLIC */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to={getHomeRoute()} replace />} />
        <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to={getHomeRoute()} replace />} />
        <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to={getHomeRoute()} replace />} />
        <Route path="/" element={<Navigate to={getHomeRoute()} replace />} />

        {/* PROTECTED: Agent area */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sv-ar" element={<SVARPage />} />
            <Route path="/disqualified-policies" element={<DisqualifiedPolicies />} />
            <Route path="/ticketing-system" element={<TicketingSystem />} />
            <Route path="/eod-report" element={<EODReport />} />
            <Route path="/office-eods" element={<EODHistory />} />
            <Route path="/agent/violations" element={<AgentViolations />} />
            {/* Agents submit UW requests here (agent-facing) */}
            <Route path="/uw/submit" element={<UnderwritingSubmit />} />
          </Route>
        </Route>

        {/* PROTECTED: Underwriter area (separate layout) */}
        <Route element={<ProtectedRoute allowedRoles={['underwriter', 'uw_manager', 'supervisor', 'admin']} />}>
          <Route path="/uw" element={<UnderwriterLayout />}>
            <Route index element={<UnderwritingDashboard />} />
            <Route path="dashboard" element={<UnderwritingDashboard />} />
            <Route path="pending" element={<PendingUnderwriting />} /> {/* ✅ NEW route */}
            <Route path="log" element={<UnderwritingLog />} />
          </Route>
        </Route>

        {/* PROTECTED: Supervisor area */}
        <Route element={<ProtectedRoute allowedRoles={['supervisor', 'admin']} />}>
          <Route path="/supervisor" element={<SupervisorLayout />}>
            <Route index element={<SupervisorDashboard />} />
            <Route path="office-numbers" element={<OfficeNumbers />} />
            <Route path="tickets" element={<SupervisorTickets />} />
          </Route>
        </Route>

        {/* PROTECTED: Admin area */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="office-numbers" element={<OfficeNumbers />} />
            <Route path="manage-users" element={<AdminManageUsers />} />
            <Route path="violations" element={<ManageViolations />} />
            <Route path="enter-violation" element={<EnterViolation />} />

            {/* NEW: Admin-specific Office EODs */}
            <Route path="office-eods" element={<OfficeEODs />} />
            {/* Optional deep link to open a particular report in a modal within OfficeEODs */}
            <Route path="office-eods/:reportId" element={<OfficeEODs />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<div>404 - Page Not Found</div>} />
      </Routes>
    </Router>
  );
}

export default App;




