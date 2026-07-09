// src/pages/admin/marketing/utils/marketingHelpers.js

import { DEFAULT_REGION, DEFAULT_MARKETING_TYPE } from '../constants/marketingTypes';
import { DEFAULT_STATUS, MARKETING_STATUS, STATUS_META } from '../constants/statusColors';

export const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

export const formatDate = (dateKey) => {
  if (!dateKey) return '—';

  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatShortDate = (dateKey) => {
  if (!dateKey) return '—';

  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
};

export const getTodayKey = () => new Date().toISOString().split('T')[0];

export const getDaysUntil = (dateKey) => {
  if (!dateKey) return null;

  const today = new Date(`${getTodayKey()}T12:00:00`);
  const target = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
};

export const cleanNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
};

export const getStatusMeta = (status) => STATUS_META[status] || STATUS_META[DEFAULT_STATUS];

export const calculateAutoStatus = (item) => {
  if (!item) return DEFAULT_STATUS;

  if (item.type === 'event') {
    if (!item.eventDate) return item.status || MARKETING_STATUS.PLANNED;

    const daysUntilEvent = getDaysUntil(item.eventDate);
    if (daysUntilEvent === null) return item.status || MARKETING_STATUS.PLANNED;
    if (daysUntilEvent < 0) return MARKETING_STATUS.EXPIRED;
    return item.status || MARKETING_STATUS.PLANNED;
  }

  if (item.type !== 'billboard') return item.status || DEFAULT_STATUS;

  const endDate = item.contractEnd || item.renewalDate;
  const daysUntilEnd = getDaysUntil(endDate);

  if (daysUntilEnd === null) return item.status || DEFAULT_STATUS;
  if (daysUntilEnd < 0) return MARKETING_STATUS.EXPIRED;
  if (daysUntilEnd <= 60) return MARKETING_STATUS.RENEWAL;

  return item.status || DEFAULT_STATUS;
};

export const getContractDateRange = (location) => {
  const start = location?.contractStart || '';
  const end = location?.contractEnd || location?.renewalDate || '';

  return {
    start,
    end,
    label: `${formatShortDate(start)} → ${formatShortDate(end)}`,
  };
};

export const getContractProgress = (location) => {
  const start = location?.contractStart;
  const end = location?.contractEnd || location?.renewalDate;

  if (!start || !end) {
    return {
      percent: 0,
      daysRemaining: null,
      label: 'No contract dates',
      tone: 'neutral',
    };
  }

  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const today = new Date(`${getTodayKey()}T12:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      percent: 0,
      daysRemaining: null,
      label: 'Invalid contract dates',
      tone: 'neutral',
    };
  }

  const total = endDate - startDate;
  const elapsed = today - startDate;
  const rawPercent = total <= 0 ? 100 : (elapsed / total) * 100;
  const percent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const daysRemaining = getDaysUntil(end);

  let tone = 'green';
  let label = `${daysRemaining} days remaining`;

  if (daysRemaining === null) {
    tone = 'neutral';
    label = 'No renewal date';
  } else if (daysRemaining < 0) {
    tone = 'red';
    label = `Expired ${Math.abs(daysRemaining)} day(s) ago`;
  } else if (daysRemaining <= 60) {
    tone = 'yellow';
    label = `${daysRemaining} days remaining`;
  }

  return {
    percent,
    daysRemaining,
    label,
    tone,
  };
};

export const groupByLocationId = (rows = []) => {
  return rows.reduce((acc, row) => {
    const locationId = row.location_id;
    if (!locationId) return acc;
    if (!acc[locationId]) acc[locationId] = [];
    acc[locationId].push(row);
    return acc;
  }, {});
};

export const getSearchHaystack = (item) => {
  return [
    item?.name,
    item?.city,
    item?.region,
    item?.office,
    item?.vendor,
    item?.campaign,
    item?.type,
    item?.status,
    item?.address,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const createEmptyLocationForm = () => ({
  type: DEFAULT_MARKETING_TYPE,
  name: '',
  city: '',
  region: DEFAULT_REGION,
  office: '',
  status: DEFAULT_STATUS,
  vendor: '',
  address: '',
  billboardWidth: '',
  billboardHeight: '',
  billboardSizeUnit: 'ft',
  placementType: '',
  photoUrl: '',
  photoFile: null,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  x: 45,
  y: 45,
  lat: '',
  lng: '',
  contractStart: '',
  contractEnd: '',
  renewalDate: '',
  eventDate: '',
  monthlyCost: '',
  traffic: '',
  campaign: '',
  graphicText: '',
  graphicUrl: '',
  contractUrl: '',
  notes: '',
});
