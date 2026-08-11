// src/pages/admin/marketing/utils/activityHelpers.js

import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
} from '../services/activityService';

export const ACTIVITY_TYPE_META = Object.freeze({
  [ACTIVITY_TYPES.MAILER]: {
    label: 'Mailer',
    plural: 'Mailers',
    icon: '📬',
    color: '#0369a1',
    background: '#eff6ff',
    border: '#bfdbfe',
  },
  [ACTIVITY_TYPES.CAR_TO_CAR_FLYERS]: {
    label: 'Car-to-Car Flyers',
    plural: 'Car-to-Car Flyers',
    icon: '🚗',
    color: '#166534',
    background: '#ecfdf5',
    border: '#bbf7d0',
  },
  [ACTIVITY_TYPES.BUSINESS_TO_BUSINESS_FLYERS]: {
    label: 'B2B Flyers',
    plural: 'B2B Flyers',
    icon: '🏢',
    color: '#7e22ce',
    background: '#faf5ff',
    border: '#e9d5ff',
  },
  [ACTIVITY_TYPES.BUSINESS_CARDS]: {
    label: 'Business Cards',
    plural: 'Business Cards',
    icon: '💳',
    color: '#92400e',
    background: '#fffbeb',
    border: '#fde68a',
  },
  [ACTIVITY_TYPES.GORILLA_STREET_FLYERS]: {
    label: 'Gorilla Street Flyers',
    plural: 'Gorilla Street Flyers',
    icon: '🦍',
    color: '#be123c',
    background: '#fff1f2',
    border: '#fecdd3',
  },
  [ACTIVITY_TYPES.DOOR_HANGERS]: {
    label: 'Door Hangers',
    plural: 'Door Hangers',
    icon: '🚪',
    color: '#0f766e',
    background: '#f0fdfa',
    border: '#99f6e4',
  },
  [ACTIVITY_TYPES.EVENT]: {
    label: 'Event',
    plural: 'Events',
    icon: '🎪',
    color: '#6d28d9',
    background: '#f5f3ff',
    border: '#ddd6fe',
  },
  [ACTIVITY_TYPES.SPONSORSHIP_DROP_OFF]: {
    label: 'Sponsorship Drop-Off',
    plural: 'Sponsorship Drop-Offs',
    icon: '🤝',
    color: '#1d4ed8',
    background: '#eff6ff',
    border: '#bfdbfe',
  },
  [ACTIVITY_TYPES.OTHER]: {
    label: 'Other',
    plural: 'Other',
    icon: '📌',
    color: '#475569',
    background: '#f8fafc',
    border: '#e2e8f0',
  },
});

export const ACTIVITY_STATUS_META = Object.freeze({
  [ACTIVITY_STATUS.PLANNED]: {
    label: 'Planned',
    color: '#7e22ce',
    background: '#faf5ff',
    border: '#e9d5ff',
    className: 'purple',
  },
  [ACTIVITY_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    color: '#0369a1',
    background: '#eff6ff',
    border: '#bfdbfe',
    className: 'blue',
  },
  [ACTIVITY_STATUS.COMPLETED]: {
    label: 'Completed',
    color: '#166534',
    background: '#ecfdf5',
    border: '#bbf7d0',
    className: 'green',
  },
  [ACTIVITY_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: '#991b1b',
    background: '#fef2f2',
    border: '#fecaca',
    className: 'red',
  },
});

export const ACTIVITY_PRIORITY_META = Object.freeze({
  [ACTIVITY_PRIORITIES.LOW]: { label: 'Low', color: '#64748b' },
  [ACTIVITY_PRIORITIES.NORMAL]: { label: 'Normal', color: '#0369a1' },
  [ACTIVITY_PRIORITIES.HIGH]: { label: 'High', color: '#92400e' },
  [ACTIVITY_PRIORITIES.URGENT]: { label: 'Urgent', color: '#be123c' },
});

export const getActivityTypeMeta = (activityType) =>
  ACTIVITY_TYPE_META[activityType] || ACTIVITY_TYPE_META[ACTIVITY_TYPES.OTHER];

export const getActivityStatusMeta = (status) =>
  ACTIVITY_STATUS_META[status] || ACTIVITY_STATUS_META[ACTIVITY_STATUS.COMPLETED];

export const getActivityPriorityMeta = (priority) =>
  ACTIVITY_PRIORITY_META[priority] || ACTIVITY_PRIORITY_META[ACTIVITY_PRIORITIES.NORMAL];

export const formatActivityType = (activityType) => getActivityTypeMeta(activityType).label;

export const formatActivityStatus = (status) => getActivityStatusMeta(status).label;

export const formatQuantity = (value) => Number(value || 0).toLocaleString();

export const formatActivityCost = (value) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export const formatActivityDate = (dateKey) => {
  if (!dateKey) return '—';
  const date = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const parseCsvText = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const activityMatchesSearch = (activity, searchText = '') => {
  const normalizedSearch = searchText.trim().toLowerCase();
  if (!normalizedSearch) return true;

  const haystack = [
    activity.office,
    activity.region,
    activity.supervisorName,
    activity.completedBy,
    activity.activityType,
    formatActivityType(activity.activityType),
    activity.campaignName,
    activity.city,
    activity.areaDescription,
    activity.notes,
    ...(activity.zipCodes || []),
    ...(activity.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(normalizedSearch);
};

export const validateMarketingActivity = (activity = {}) => {
  const errors = [];
  if (!activity.office?.trim()) errors.push('Office is required.');
  if (!activity.activityType) errors.push('Activity type is required.');
  if (!activity.activityDate) errors.push('Activity date is required.');
  if (Number(activity.quantity || 0) < 0) errors.push('Quantity cannot be negative.');
  if (Number(activity.purchasedQuantity || 0) < 0) errors.push('Purchased quantity cannot be negative.');
  if (Number(activity.distributedQuantity || 0) < 0) errors.push('Distributed quantity cannot be negative.');
  if (activity.activityType === ACTIVITY_TYPES.MAILER) {
    const purchased = Number(activity.purchasedQuantity || 0);
    const distributed = Number(activity.distributedQuantity || 0);
    if (distributed > purchased && purchased > 0) {
      errors.push('Distributed quantity cannot be greater than purchased quantity.');
    }
  }
  if (Number(activity.productionCost || 0) < 0) errors.push('Production cost cannot be negative.');
  if (Number(activity.distributionCost || 0) < 0) errors.push('Distribution cost cannot be negative.');
  if (Number(activity.otherCost || 0) < 0) errors.push('Other cost cannot be negative.');
  if (Number(activity.cost || 0) < 0) errors.push('Total cost cannot be negative.');
  return errors;
};

export const getActivityOfficeOptions = (activities = []) =>
  [...new Set(activities.map((activity) => activity.office).filter(Boolean))].sort();

export const getActivityCampaignOptions = (activities = []) =>
  [...new Set(activities.map((activity) => activity.campaignName).filter(Boolean))].sort();