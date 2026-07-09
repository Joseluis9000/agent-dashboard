// src/pages/admin/marketing/hooks/useMarketingMap.js

import { useCallback, useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import {
  GOOGLE_MAPS_API_KEY,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FIT_BOUNDS_PADDING,
  MAP_OPTIONS,
  MAP_SELECTED_ZOOM,
} from '../constants/mapConfig';
import {
  createAdvancedMarkerContent,
  createInfoWindowHtml,
  getMapPosition,
  getValidMapLocations,
} from '../utils/mapHelpers';

let googleMapsConfigured = false;

const configureGoogleMaps = () => {
  if (googleMapsConfigured) return;

  setOptions({
    key: GOOGLE_MAPS_API_KEY,
    v: 'weekly',
  });

  googleMapsConfigured = true;
};

const clearMarkers = (markersRef) => {
  markersRef.current.forEach((markerRecord) => {
    if (markerRecord?.listener?.remove) {
      markerRecord.listener.remove();
    }

    if (markerRecord?.marker?.map !== undefined) {
      markerRecord.marker.map = null;
    }

    if (typeof markerRecord?.marker?.setMap === 'function') {
      markerRecord.marker.setMap(null);
    }
  });

  markersRef.current = [];
};

const clearCircle = (circleRef) => {
  if (circleRef.current) {
    circleRef.current.setMap(null);
    circleRef.current = null;
  }
};

const getMarkerByLocationId = (markersRef, locationId) => {
  return markersRef.current.find((markerRecord) => markerRecord.locationId === locationId) || null;
};

const getMarkerAnchor = (markerRecord) => markerRecord?.marker || null;

const createLegacyMarker = ({ google, map, location, isSelected, onLocationSelect }) => {
  const position = getMapPosition(location);
  const content = createAdvancedMarkerContent({ location, isSelected });
  const background = content.style.background || '#0ea5e9';

  const marker = new google.maps.Marker({
    position,
    map,
    title: location.name || 'Marketing Location',
    animation: isSelected ? google.maps.Animation.DROP : null,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: background,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
      scale: isSelected ? 11 : 8,
    },
  });

  const listener = marker.addListener('click', () => onLocationSelect(location));

  return { marker, listener };
};

const createAdvancedMarker = async ({ google, markerLibrary, map, location, isSelected, onLocationSelect }) => {
  const position = getMapPosition(location);
  const content = createAdvancedMarkerContent({ location, isSelected });

  if (!markerLibrary?.AdvancedMarkerElement) {
    return createLegacyMarker({ google, map, location, isSelected, onLocationSelect });
  }

  try {
    const marker = new markerLibrary.AdvancedMarkerElement({
      map,
      position,
      title: location.name || 'Marketing Location',
      content,
      zIndex: isSelected ? 1000 : 1,
    });

    const listener = marker.addListener('click', () => onLocationSelect(location));

    return { marker, listener };
  } catch (error) {
    console.warn('AdvancedMarkerElement failed. Falling back to google.maps.Marker.', error);
    return createLegacyMarker({ google, map, location, isSelected, onLocationSelect });
  }
};

const metersFromMiles = (miles) => Number(miles || 0) * 1609.344;

const useMarketingMap = ({
  locations = [],
  selectedLocation = null,
  onLocationSelect,
  enabled = true,
  coverageRadiusMiles = null,
  showCoverageRadius = false,
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const googleRef = useRef(null);
  const markerLibraryRef = useRef(null);
  const infoWindowRef = useRef(null);
  const markersRef = useRef([]);
  const coverageCircleRef = useRef(null);
  const isUnmountedRef = useRef(false);

  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const destroyMap = useCallback(() => {
    clearMarkers(markersRef);
    clearCircle(coverageCircleRef);

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }

    mapRef.current = null;
    googleRef.current = null;
    markerLibraryRef.current = null;
    setIsMapReady(false);
  }, []);

  const panToLocation = useCallback((location, zoom = MAP_SELECTED_ZOOM) => {
    const map = mapRef.current;
    const position = getMapPosition(location);

    if (!map || !position) return;

    map.panTo(position);

    if (zoom && map.getZoom() < zoom) {
      map.setZoom(zoom);
    }
  }, []);

  const fitLocations = useCallback((nextLocations = locations) => {
    const google = googleRef.current;
    const map = mapRef.current;
    const validLocations = getValidMapLocations(nextLocations);

    if (!google || !map || validLocations.length === 0) return;

    if (validLocations.length === 1) {
      const position = getMapPosition(validLocations[0]);
      map.setCenter(position);
      map.setZoom(MAP_SELECTED_ZOOM);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    validLocations.forEach((location) => bounds.extend(getMapPosition(location)));
    map.fitBounds(bounds, MAP_FIT_BOUNDS_PADDING);
  }, [locations]);

  const openInfoWindow = useCallback((location) => {
    const google = googleRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    const markerRecord = getMarkerByLocationId(markersRef, location?.id);
    const marker = getMarkerAnchor(markerRecord);

    if (!google || !map || !infoWindow || !marker || !location) return;

    infoWindow.setContent(createInfoWindowHtml(location));

    try {
      infoWindow.open({
        anchor: marker,
        map,
      });
    } catch (error) {
      infoWindow.setPosition(getMapPosition(location));
      infoWindow.open(map);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !mapContainerRef.current) return undefined;

    isUnmountedRef.current = false;
    let cancelled = false;

    const initializeMap = async () => {
      try {
        setMapError('');

        if (!GOOGLE_MAPS_API_KEY) {
          throw new Error('Missing REACT_APP_GOOGLE_MAPS_API_KEY in your .env file.');
        }

        configureGoogleMaps();

        const mapsLibrary = await importLibrary('maps');
        const markerLibrary = await importLibrary('marker').catch((error) => {
          console.warn('Google marker library failed to load. Falling back to legacy markers.', error);
          return null;
        });

        if (cancelled || isUnmountedRef.current || !mapContainerRef.current) return;

        const map = new mapsLibrary.Map(mapContainerRef.current, {
          ...MAP_OPTIONS,
          center: { ...MAP_DEFAULT_CENTER },
          zoom: MAP_DEFAULT_ZOOM,
        });

        mapRef.current = map;
        googleRef.current = window.google;
        markerLibraryRef.current = markerLibrary;
        infoWindowRef.current = new window.google.maps.InfoWindow();

        setIsMapReady(true);
      } catch (error) {
        console.error('Error initializing Google Map:', error);
        setMapError(error?.message || 'Could not load Google Map.');
        destroyMap();
      }
    };

    initializeMap();

    return () => {
      cancelled = true;
      isUnmountedRef.current = true;
      destroyMap();
    };
  }, [destroyMap, enabled]);

  useEffect(() => {
    const google = googleRef.current;
    const markerLibrary = markerLibraryRef.current;
    const map = mapRef.current;

    if (!enabled || !isMapReady || !google || !map) return;

    let cancelled = false;

    const updateMarkers = async () => {
      clearMarkers(markersRef);

      const validLocations = getValidMapLocations(locations);

      if (validLocations.length === 0) {
        map.setCenter({ ...MAP_DEFAULT_CENTER });
        map.setZoom(MAP_DEFAULT_ZOOM);
        return;
      }

      const markerRecords = await Promise.all(
        validLocations.map(async (location) => {
          const isSelected = selectedLocation?.id === location.id;
          const { marker, listener } = await createAdvancedMarker({
            google,
            markerLibrary,
            map,
            location,
            isSelected,
            onLocationSelect: (clickedLocation) => {
              if (typeof onLocationSelect === 'function') {
                onLocationSelect(clickedLocation);
              }
            },
          });

          return {
            locationId: location.id,
            marker,
            listener,
          };
        })
      );

      if (cancelled) {
        markerRecords.forEach((record) => {
          if (record?.listener?.remove) record.listener.remove();
          if (record?.marker?.map !== undefined) record.marker.map = null;
          if (typeof record?.marker?.setMap === 'function') record.marker.setMap(null);
        });
        return;
      }

      markersRef.current = markerRecords;

      const selectedPosition = getMapPosition(selectedLocation);

      if (selectedPosition) {
        panToLocation(selectedLocation, MAP_SELECTED_ZOOM);
        window.setTimeout(() => openInfoWindow(selectedLocation), 120);
      } else {
        fitLocations(validLocations);
      }
    };

    updateMarkers();

    return () => {
      cancelled = true;
    };
  }, [enabled, fitLocations, isMapReady, locations, onLocationSelect, openInfoWindow, panToLocation, selectedLocation]);

  useEffect(() => {
    const google = googleRef.current;
    const map = mapRef.current;
    const selectedPosition = getMapPosition(selectedLocation);

    if (!enabled || !isMapReady || !google || !map) return;

    clearCircle(coverageCircleRef);

    if (!showCoverageRadius || !selectedPosition || !coverageRadiusMiles) return;

    coverageCircleRef.current = new google.maps.Circle({
      strokeColor: '#0ea5e9',
      strokeOpacity: 0.65,
      strokeWeight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 0.08,
      map,
      center: selectedPosition,
      radius: metersFromMiles(coverageRadiusMiles),
      clickable: false,
    });
  }, [coverageRadiusMiles, enabled, isMapReady, selectedLocation, showCoverageRadius]);

  return {
    mapContainerRef,
    map: mapRef.current,
    isMapReady,
    mapError,
    panToLocation,
    fitLocations,
    openInfoWindow,
    destroyMap,
  };
};

export default useMarketingMap;
