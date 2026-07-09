// src/pages/admin/marketing/utils/mapHelpers.js

import { MAP_DEFAULT_CENTER } from '../constants/mapConfig';
import { getStatusMeta, cleanNumberOrNull } from './marketingHelpers';
import { TYPE_MARKER_META } from '../constants/statusColors';

export const getMapPosition = (item) => {
  const lat = cleanNumberOrNull(item?.lat);
  const lng = cleanNumberOrNull(item?.lng);

  if (lat === null || lng === null) return null;

  return { lat, lng };
};

export const hasMapPosition = (item) => !!getMapPosition(item);

export const getValidMapLocations = (locations = []) => locations.filter(hasMapPosition);

export const getFallbackMapCenter = () => ({ ...MAP_DEFAULT_CENTER });

export const getMarkerMeta = (location, isSelected = false) => {
  const status = getStatusMeta(location?.status);
  const typeMeta = TYPE_MARKER_META[location?.type] || TYPE_MARKER_META.billboard;

  return {
    label: typeMeta.label,
    icon: typeMeta.icon,
    color: location?.type === 'office' ? typeMeta.color : status.color,
    statusColor: status.color,
    statusLabel: status.label,
    isSelected,
  };
};

export const escapeHtml = (value = '') => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const createInfoWindowHtml = (location) => {
  const status = getStatusMeta(location?.status);

  return `
    <div style="font-family:Inter,Arial,sans-serif;min-width:180px;">
      <div style="font-weight:800;color:#0f172a;margin-bottom:2px;">${escapeHtml(location?.name || 'Marketing Location')}</div>
      <div style="font-size:12px;color:#64748b;">${escapeHtml(location?.city || '—')} &bull; ${escapeHtml(location?.region || '—')}</div>
      <div style="font-size:12px;margin-top:6px;color:${status.text};font-weight:800;">${escapeHtml(status.label)}</div>
    </div>
  `;
};

export const createAdvancedMarkerContent = ({ location, isSelected = false }) => {
  const marker = document.createElement('div');
  const meta = getMarkerMeta(location, isSelected);

  marker.style.width = isSelected ? '42px' : '30px';
  marker.style.height = isSelected ? '42px' : '30px';
  marker.style.borderRadius = '999px';
  marker.style.display = 'grid';
  marker.style.placeItems = 'center';
  marker.style.background = meta.color;
  marker.style.color = '#ffffff';
  marker.style.border = '3px solid #ffffff';
  marker.style.boxShadow = isSelected
    ? '0 0 0 5px rgba(14,165,233,0.22), 0 14px 30px rgba(15,23,42,0.28)'
    : '0 8px 18px rgba(15,23,42,0.20)';
  marker.style.fontSize = location?.type === 'billboard' ? '13px' : '15px';
  marker.style.fontWeight = '900';
  marker.style.transform = isSelected ? 'translateY(-4px) scale(1.04)' : 'translateY(0)';
  marker.style.transition = 'transform 160ms ease, box-shadow 160ms ease, width 160ms ease, height 160ms ease';
  marker.style.cursor = 'pointer';
  marker.title = location?.name || '';

  marker.textContent = location?.type === 'billboard' ? 'BB' : meta.icon;

  return marker;
};
