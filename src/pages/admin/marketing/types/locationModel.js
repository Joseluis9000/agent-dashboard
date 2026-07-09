// src/pages/admin/marketing/types/locationModel.js

import { DEFAULT_MARKETING_TYPE, DEFAULT_REGION } from '../constants/marketingTypes';
import { DEFAULT_STATUS } from '../constants/statusColors';
import { calculateAutoStatus, cleanNumberOrNull } from '../utils/marketingHelpers';

const normalizeNumber = (value, fallback = 0) => {
  const cleaned = cleanNumberOrNull(value);
  return cleaned === null ? fallback : cleaned;
};

const normalizeOptionalNumber = (value) => {
  const cleaned = cleanNumberOrNull(value);
  return cleaned === null ? '' : cleaned;
};

export const dbRowToLocation = (row = {}) => {
  const baseLocation = {
    id: row.id,
    type: row.type || DEFAULT_MARKETING_TYPE,
    status: row.status || DEFAULT_STATUS,

    name: row.name || '',
    city: row.city || '',
    region: row.region || DEFAULT_REGION,
    office: row.office || '',
    vendor: row.vendor || '',
    address: row.address || '',

    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',

    lat: cleanNumberOrNull(row.lat),
    lng: cleanNumberOrNull(row.lng),

    contractStart: row.contract_start || '',
    contractEnd: row.contract_end || '',
    renewalDate: row.renewal_date || '',
    eventDate: row.event_date || '',
    contractUrl: row.contract_url || '',

    monthlyCost: normalizeNumber(row.monthly_cost, 0),
    dailyImpressions: normalizeNumber(row.daily_impressions ?? row.estimated_impressions, 0),
    estimatedImpressions: normalizeNumber(row.estimated_impressions, 0),
    traffic: row.traffic || '',
    trafficDirection: row.traffic_direction || '',

    campaign: row.campaign || '',
    graphicText: row.graphic_text || '',
    graphicUrl: row.graphic_url || '',
    photoUrl: row.photo_url || '',

    billboardWidth: normalizeOptionalNumber(row.billboard_width),
    billboardHeight: normalizeOptionalNumber(row.billboard_height),
    billboardSizeUnit: row.billboard_size_unit || 'ft',
    placementType: row.placement_type || '',
    billboardFace: row.billboard_face || '',
    illumination: row.illumination || '',

    streetViewHeading: normalizeNumber(row.streetview_heading, 0),
    streetViewPitch: normalizeNumber(row.streetview_pitch, 0),
    streetViewZoom: normalizeNumber(row.streetview_zoom, 1),

    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',

    legacy: {
      mapX: normalizeNumber(row.map_x, 45),
      mapY: normalizeNumber(row.map_y, 45),
      latitude: cleanNumberOrNull(row.latitude),
      longitude: cleanNumberOrNull(row.longitude),
    },

    media: {
      photos: [],
      primaryPhoto: row.photo_url || row.graphic_url || '',
      legacyPhotoUrl: row.photo_url || '',
      graphicUrl: row.graphic_url || '',
    },
  };

  return {
    ...baseLocation,
    status: calculateAutoStatus(baseLocation),
  };
};

export const locationToDbPayload = (form = {}) => ({
  type: form.type || DEFAULT_MARKETING_TYPE,
  name: form.name?.trim() || '',
  city: form.city?.trim() || '',
  region: form.region || DEFAULT_REGION,
  office: form.office?.trim() || '',
  status: form.status || DEFAULT_STATUS,
  vendor: form.vendor?.trim() || '',
  address: form.address?.trim() || '',

  contact_name: form.contactName?.trim() || '',
  contact_phone: form.contactPhone?.trim() || '',
  contact_email: form.contactEmail?.trim() || '',

  lat: cleanNumberOrNull(form.lat),
  lng: cleanNumberOrNull(form.lng),

  contract_start: form.contractStart || null,
  contract_end: form.contractEnd || null,
  renewal_date: form.renewalDate || null,
  event_date: form.eventDate || null,
  contract_url: form.contractUrl?.trim() || '',

  monthly_cost: Number(form.monthlyCost || 0),
  traffic: form.traffic?.trim() || '',
  campaign: form.campaign?.trim() || '',
  graphic_text: form.graphicText?.trim() || '',
  graphic_url: form.graphicUrl?.trim() || '',
  photo_url: form.photoUrl?.trim() || '',

  billboard_width: cleanNumberOrNull(form.billboardWidth),
  billboard_height: cleanNumberOrNull(form.billboardHeight),
  billboard_size_unit: form.billboardSizeUnit || 'ft',
  placement_type: form.placementType?.trim() || '',
  billboard_face: form.billboardFace?.trim() || null,
  illumination: form.illumination?.trim() || null,
  daily_impressions: cleanNumberOrNull(form.dailyImpressions),
  traffic_direction: form.trafficDirection?.trim() || null,

  notes: form.notes?.trim() || '',
});

export const locationToForm = (location = {}) => ({
  type: location.type || DEFAULT_MARKETING_TYPE,
  name: location.name || '',
  city: location.city || '',
  region: location.region || DEFAULT_REGION,
  office: location.office || '',
  status: location.status || DEFAULT_STATUS,
  vendor: location.vendor || '',
  address: location.address || '',

  contactName: location.contactName || '',
  contactPhone: location.contactPhone || '',
  contactEmail: location.contactEmail || '',

  lat: location.lat ?? '',
  lng: location.lng ?? '',

  contractStart: location.contractStart || '',
  contractEnd: location.contractEnd || '',
  renewalDate: location.renewalDate || '',
  eventDate: location.eventDate || '',
  contractUrl: location.contractUrl || '',

  monthlyCost: location.monthlyCost || '',
  traffic: location.traffic || '',
  campaign: location.campaign || '',
  graphicText: location.graphicText || '',
  graphicUrl: location.graphicUrl || '',
  photoUrl: location.photoUrl || '',
  photoFile: null,

  billboardWidth: location.billboardWidth ?? '',
  billboardHeight: location.billboardHeight ?? '',
  billboardSizeUnit: location.billboardSizeUnit || 'ft',
  placementType: location.placementType || '',
  billboardFace: location.billboardFace || '',
  illumination: location.illumination || '',
  dailyImpressions: location.dailyImpressions || '',
  trafficDirection: location.trafficDirection || '',

  notes: location.notes || '',
});

export const attachPhotosToLocations = (locations = [], photosByLocationId = {}) => {
  return locations.map((location) => {
    const photos = photosByLocationId[location.id] || [];
    const primaryPhoto =
      photos.find((photo) => photo.is_primary)?.photo_url ||
      photos[0]?.photo_url ||
      location.media?.primaryPhoto ||
      location.photoUrl ||
      location.graphicUrl ||
      '';

    return {
      ...location,
      media: {
        ...location.media,
        photos,
        primaryPhoto,
      },
    };
  });
};
