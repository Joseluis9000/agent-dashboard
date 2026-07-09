// src/pages/admin/marketing/constants/statusColors.js

export const MARKETING_STATUS = Object.freeze({
  ACTIVE: 'active',
  RENEWAL: 'renewal',
  EXPIRED: 'expired',
  PLANNED: 'planned',
});

export const STATUS_OPTIONS = Object.freeze([
  { value: MARKETING_STATUS.ACTIVE, label: 'Active' },
  { value: MARKETING_STATUS.RENEWAL, label: 'Renewal Soon' },
  { value: MARKETING_STATUS.EXPIRED, label: 'Expired' },
  { value: MARKETING_STATUS.PLANNED, label: 'Planned' },
]);

export const STATUS_META = Object.freeze({
  [MARKETING_STATUS.ACTIVE]: {
    label: 'Active',
    className: 'green',
    color: '#22c55e',
    background: '#dcfce7',
    text: '#166534',
  },
  [MARKETING_STATUS.RENEWAL]: {
    label: 'Renewal Soon',
    className: 'yellow',
    color: '#eab308',
    background: '#fef3c7',
    text: '#92400e',
  },
  [MARKETING_STATUS.EXPIRED]: {
    label: 'Expired',
    className: 'red',
    color: '#ef4444',
    background: '#fee2e2',
    text: '#991b1b',
  },
  [MARKETING_STATUS.PLANNED]: {
    label: 'Planned',
    className: 'purple',
    color: '#a855f7',
    background: '#ede9fe',
    text: '#5b21b6',
  },
});

export const TYPE_MARKER_META = Object.freeze({
  billboard: {
    label: 'Billboard',
    icon: '▣',
    color: '#0ea5e9',
  },
  office: {
    label: 'Office',
    icon: '🏢',
    color: '#2563eb',
  },
  event: {
    label: 'Event',
    icon: '🎪',
    color: '#a855f7',
  },
  sponsorship: {
    label: 'Sponsorship',
    icon: '🤝',
    color: '#64748b',
  },
});

export const DEFAULT_STATUS = MARKETING_STATUS.ACTIVE;
