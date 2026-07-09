// src/pages/admin/marketing/MarketingDashboard.jsx

import React from 'react';
import MarketingDashboardPanel from './components/MarketingDashboardPanel';

const MarketingDashboard = ({ onNavigate }) => {
  return <MarketingDashboardPanel onNavigate={onNavigate} />;
};

export default MarketingDashboard;
