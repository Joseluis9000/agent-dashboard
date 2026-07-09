// src/pages/admin/marketing/utils/distance.js

export const EARTH_RADIUS_MILES = 3958.8;

export const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

export const hasValidCoordinates = (item) => {
  if (!item) return false;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
};

export const getCoordinates = (item) => {
  if (!hasValidCoordinates(item)) return null;
  return {
    lat: Number(item.lat),
    lng: Number(item.lng),
  };
};

export const calculateDistanceMiles = (from, to) => {
  const pointA = getCoordinates(from);
  const pointB = getCoordinates(to);

  if (!pointA || !pointB) return null;

  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLng = toRadians(pointB.lng - pointA.lng);

  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
};

export const formatMiles = (miles) => {
  if (miles === null || miles === undefined || Number.isNaN(Number(miles))) return '—';
  const value = Number(miles);
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
};

export const getNearbyLocations = ({
  selectedLocation,
  locations = [],
  radiusMiles = 50,
  type = 'all',
  limit = 8,
}) => {
  if (!selectedLocation || !hasValidCoordinates(selectedLocation)) return [];

  return locations
    .filter((item) => item?.id && item.id !== selectedLocation.id)
    .filter((item) => type === 'all' || item.type === type)
    .map((item) => ({
      ...item,
      distanceMiles: calculateDistanceMiles(selectedLocation, item),
    }))
    .filter((item) => item.distanceMiles !== null && item.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
};
