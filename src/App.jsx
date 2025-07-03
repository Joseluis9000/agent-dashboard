import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SVARPage from './pages/SVARPage';
import RegionalDashboard from './pages/RegionalDashboard'; // ✅ Added
import RegionalSVARPage from './pages/RegionalSVARPage';   // ✅ Added

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sv-ar" element={<SVARPage />} />
        <Route path="/regional-dashboard" element={<RegionalDashboard />} /> {/* ✅ Added */}
        <Route path="/regional-svar" element={<RegionalSVARPage />} />       {/* ✅ Added */}
      </Routes>
    </Router>
  );
}

export default App;
