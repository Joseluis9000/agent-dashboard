// src/pages/admin/marketing/constants/mapConfig.js

export const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_MAP_ID = process.env.REACT_APP_GOOGLE_MAPS_MAP_ID || '';

export const MAP_DEFAULT_CENTER = Object.freeze({
  lat: 37.2,
  lng: -119.4,
});

export const MAP_DEFAULT_ZOOM = 6;
export const MAP_SELECTED_ZOOM = 10;
export const MAP_FIT_BOUNDS_PADDING = 70;

export const MAP_OPTIONS = Object.freeze({
  center: MAP_DEFAULT_CENTER,
  zoom: MAP_DEFAULT_ZOOM,
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  clickableIcons: false,
mapId: GOOGLE_MAPS_MAP_ID,
});

export const MARKER_SIZES = Object.freeze({
  DEFAULT: 30,
  SELECTED: 42,
});

export const STREET_VIEW_DEFAULTS = Object.freeze({
  heading: 0,
  pitch: 0,
  zoom: 1,
});
