// src/pages/admin/marketing/utils/campaignHelpers.js

import { CAMPAIGN_STATUS } from '../services/campaignService';

export const CAMPAIGN_STATUS_META = Object.freeze({
  [CAMPAIGN_STATUS.PLANNED]: {
    label: 'Planned',
    color: '#7e22ce',
    background: '#faf5ff',
    border: '#e9d5ff',
  },
  [CAMPAIGN_STATUS.ACTIVE]: {
    label: 'Active',
    color: '#166534',
    background: '#ecfdf5',
    border: '#bbf7d0',
  },
  [CAMPAIGN_STATUS.PAUSED]: {
    label: 'Paused',
    color: '#92400e',
    background: '#fffbeb',
    border: '#fde68a',
  },
  [CAMPAIGN_STATUS.COMPLETED]: {
    label: 'Completed',
    color: '#0369a1',
    background: '#eff6ff',
    border: '#bfdbfe',
  },
  [CAMPAIGN_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: '#991b1b',
    background: '#fef2f2',
    border: '#fecaca',
  },
});

export const getCampaignStatusMeta = (status) =>
  CAMPAIGN_STATUS_META[status] || CAMPAIGN_STATUS_META[CAMPAIGN_STATUS.PLANNED];

export const formatCampaignDate = (dateKey) => {
  if (!dateKey) return '—';

  const date = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatCampaignBudget = (value) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export const getCampaignProgress = (campaign = {}) => {
  if (!campaign.startDate || !campaign.endDate) return null;

  const start = new Date(`${campaign.startDate}T12:00:00`);
  const end = new Date(`${campaign.endDate}T12:00:00`);
  const today = new Date();

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return null;
  }

  const total = end.getTime() - start.getTime();
  const elapsed = today.getTime() - start.getTime();

  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
};

export const campaignMatchesSearch = (campaign, searchText = '') => {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) return true;

  return [
    campaign.name,
    campaign.description,
    campaign.status,
    campaign.goal,
    campaign.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
};
