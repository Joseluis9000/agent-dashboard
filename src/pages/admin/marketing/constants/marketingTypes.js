// src/pages/admin/marketing/constants/marketingTypes.js

export const MARKETING_TYPES = Object.freeze({
  BILLBOARD: 'billboard',
  EVENT: 'event',
  OFFICE: 'office',
  SPONSORSHIP: 'sponsorship',
});

export const TYPE_OPTIONS = Object.freeze([
  { value: MARKETING_TYPES.BILLBOARD, label: 'Billboard' },
  { value: MARKETING_TYPES.EVENT, label: 'Event' },
  { value: MARKETING_TYPES.OFFICE, label: 'Office' },
  { value: MARKETING_TYPES.SPONSORSHIP, label: 'Sponsorship' },
]);

export const REGION_OPTIONS = Object.freeze([
  'Bay Area',
  'Cen-Cal',
  'Kern County',
  'The Valley',
  'Southern Cali',
]);

export const COVERAGE_RADIUS_OPTIONS = Object.freeze([25, 50, 75, 100]);

export const DEFAULT_REGION = 'Bay Area';
export const DEFAULT_MARKETING_TYPE = MARKETING_TYPES.BILLBOARD;
