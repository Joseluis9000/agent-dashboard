// Region assignments are scope data, never a substitute for database authorization.
export const TERRITORY_MANAGER_ROLE = 'territory_manager';

export function normalizeRegionName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
}

export function isRegionManager(role) {
  return role === 'regional' || role === TERRITORY_MANAGER_ROLE;
}

export function getAssignedRegions(profile) {
  const role = String(profile?.role || '').trim().toLowerCase();
  // A TM must have explicit assignments. Never fall back to one legacy region
  // or interpret an empty assignment as company-wide access.
  const values = role === TERRITORY_MANAGER_ROLE
    ? (Array.isArray(profile?.assigned_regions) ? profile.assigned_regions : [])
    : role === 'regional' ? [profile?.region] : [];
  return [...new Set(values.map(normalizeRegionName).filter(Boolean))].sort();
}
