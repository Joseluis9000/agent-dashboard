// src/pages/admin/marketing/CampaignWorkspace.jsx

import React from 'react';
import CampaignWorkspacePanel from './components/CampaignWorkspacePanel';

const CampaignWorkspace = ({ campaignId, onBack, onEditCampaign, onNavigate }) => {
  return (
    <CampaignWorkspacePanel
      campaignId={campaignId}
      onBack={onBack}
      onEditCampaign={onEditCampaign}
      onNavigate={onNavigate}
    />
  );
};

export default CampaignWorkspace;
