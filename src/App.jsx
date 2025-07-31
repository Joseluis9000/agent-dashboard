// src/App.jsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SVARPage from './pages/SVARPage';
import RegionalDashboard from './pages/RegionalDashboard';
import RegionalSVARPage from './pages/RegionalSVARPage';
import RegionalTardyWarning from './pages/RegionalTardyWarning';

import DisqualifiedPolicies from './pages/DisqualifiedPolicies';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sv-ar" element={<SVARPage />} />
        <Route path="/regional-dashboard" element={<RegionalDashboard />} />
        <Route path="/regional-svar" element={<RegionalSVARPage />} />
        <Route path="/regional-tardy-warning" element={<RegionalTardyWarning />} />
        <Route path="/disqualified-policies" element={<DisqualifiedPolicies />} />
      </Routes>
    </Router>
  );
}

export default App;