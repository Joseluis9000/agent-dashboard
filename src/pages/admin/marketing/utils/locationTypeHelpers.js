// src/pages/admin/marketing/utils/locationTypeHelpers.js

export const OFFICE_LOCATION_TYPE = 'office';

export const MARKETING_ASSET_TYPES = Object.freeze([
  'billboard',
  'event',
  'sponsorship',
]);

export const LOCATION_GROUPS = Object.freeze({
  OFFICE: 'office',
  MARKETING: 'marketing',
});

export const isOfficeLocation = (location = {}) => {
  return String(location.type || '').toLowerCase() === OFFICE_LOCATION_TYPE;
};

export const isMarketingAssetLocation = (location = {}) => {
  return !isOfficeLocation(location);
};

export const splitOfficeAndMarketingLocations = (locations = []) => {
  return (locations || []).reduce(
    (acc, location) => {
      if (isOfficeLocation(location)) {
        acc.officeLocations.push(location);
      } else {
        acc.marketingAssets.push(location);
      }

      return acc;
    },
    {
      officeLocations: [],
      marketingAssets: [],
    }
  );
};

export const getLocationTypeLabel = (type = '') => {
  const normalized = String(type || '').toLowerCase();

  const labels = {
    billboard: 'Billboard',
    event: 'Event',
    office: 'Office',
    sponsorship: 'Sponsorship',
  };

  return labels[normalized] || 'Marketing Asset';
};

export const getLocationGroupLabel = (location = {}) => {
  return isOfficeLocation(location) ? 'Office Location' : 'Marketing Asset';
};

export const getOfficeDisplayName = (office = {}) => {
  return [
    office.office,
    office.city,
  ].filter(Boolean).join(' • ') || office.name || 'Office Location';
};
