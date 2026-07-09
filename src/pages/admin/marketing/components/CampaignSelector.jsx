// src/pages/admin/marketing/components/CampaignSelector.jsx

import React, { useEffect, useState } from 'react';
import { getMarketingCampaigns } from '../services/campaignService';

const CampaignSelector = ({
  value = '',
  onChange,
  includeEmpty = true,
  emptyLabel = 'No Campaign',
  disabled = false,
}) => {
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCampaigns = async () => {
      setIsLoading(true);

      try {
        const rows = await getMarketingCampaigns({ limit: 250 });
        if (isMounted) setCampaigns(rows);
      } catch (error) {
        console.error('Error loading campaigns:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadCampaigns();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <select
      value={value || ''}
      onChange={(event) => typeof onChange === 'function' && onChange(event.target.value)}
      disabled={disabled || isLoading}
    >
      {includeEmpty && <option value="">{isLoading ? 'Loading campaigns...' : emptyLabel}</option>}

      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.name}
        </option>
      ))}
    </select>
  );
};

export default CampaignSelector;
