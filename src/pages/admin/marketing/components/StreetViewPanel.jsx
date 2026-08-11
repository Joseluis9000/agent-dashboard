// src/pages/admin/marketing/components/StreetViewPanel.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '../../../../supabaseClient';
import styles from '../../MarketingOps.module.css';

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

let googleMapsScriptPromise = null;

const normalizeNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const hasNumber = (value) =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value));

const loadGoogleMapsScript = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps requires a browser window.'));
  }

  if (window.google?.maps?.StreetViewPanorama) {
    return Promise.resolve(window.google.maps);
  }

  if (!API_KEY) {
    return Promise.reject(
      new Error('REACT_APP_GOOGLE_MAPS_API_KEY is missing.')
    );
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise;
  }

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-marketing-google-maps="true"]'
    );

    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) {
          resolve(window.google.maps);
        } else {
          reject(new Error('Google Maps loaded but was unavailable.'));
        }
      });

      existing.addEventListener('error', () => {
        reject(new Error('Could not load Google Maps JavaScript API.'));
      });

      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      API_KEY
    )}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.marketingGoogleMaps = 'true';

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps loaded but was unavailable.'));
      }
    };

    script.onerror = () => {
      reject(new Error('Could not load Google Maps JavaScript API.'));
    };

    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
};

const getBillboardSize = (location) => {
  if (!location?.billboardWidth || !location?.billboardHeight) return '—';

  return `${location.billboardWidth} x ${location.billboardHeight} ${
    location.billboardSizeUnit || 'ft'
  }`;
};

const getInitialStreetViewState = (location) => {
  const baseLat = normalizeNumber(location?.lat, 0);
  const baseLng = normalizeNumber(location?.lng, 0);

  return {
    lat: normalizeNumber(
      location?.streetviewLat ?? location?.streetview_lat,
      baseLat
    ),
    lng: normalizeNumber(
      location?.streetviewLng ?? location?.streetview_lng,
      baseLng
    ),
    heading: normalizeNumber(
      location?.streetviewHeading ?? location?.streetview_heading,
      0
    ),
    pitch: normalizeNumber(
      location?.streetviewPitch ?? location?.streetview_pitch,
      0
    ),
    zoom: normalizeNumber(
      location?.streetviewZoom ?? location?.streetview_zoom,
      1
    ),
  };
};

const StreetViewPanel = ({
  location,
  height = 340,
  showPhoto = true,
  showSpecs = true,
}) => {
  const panoramaContainerRef = useRef(null);
  const panoramaRef = useRef(null);
  const listenersRef = useRef([]);

  const [viewMode, setViewMode] = useState('street');
  const [isLoadingView, setIsLoadingView] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const [savedView, setSavedView] = useState(() =>
    getInitialStreetViewState(location)
  );

  const [liveView, setLiveView] = useState(() =>
    getInitialStreetViewState(location)
  );

  const baseLat = location?.lat;
  const baseLng = location?.lng;

  const isSettingsOffice =
    location?.source === 'settings_office' ||
    Boolean(location?.settingsOfficeId);

  const resolvedRecordId = isSettingsOffice
    ? location?.settingsOfficeId || location?.sourceId || ''
    : location?.id || '';

  const resolvedTable = isSettingsOffice
    ? 'marketing_offices'
    : 'marketing_locations';

  const targetLabel = isSettingsOffice
    ? 'office'
    : location?.type === 'billboard'
      ? 'billboard'
      : location?.type === 'dmv_video'
        ? 'DMV location'
        : 'location';

  const targetPinLabel = isSettingsOffice
    ? 'Office'
    : location?.type === 'billboard'
      ? 'Billboard'
      : location?.type === 'dmv_video'
        ? 'DMV'
        : 'Location';

  const hasCoordinates =
    hasNumber(baseLat) &&
    hasNumber(baseLng);

  const uploadedPhoto =
    location?.photoUrl ||
    location?.graphicUrl ||
    '';

  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${baseLat},${baseLng}`
    : '';

  const directionsUrl = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${baseLat},${baseLng}`
    : '';

  const clearPanoramaListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener?.remove?.();
      } catch (error) {
        // Ignore cleanup errors from Google Maps listeners.
      }
    });

    listenersRef.current = [];
  }, []);

  const readPanoramaState = useCallback(() => {
    const panorama = panoramaRef.current;
    if (!panorama) return null;

    const position = panorama.getPosition();
    const pov = panorama.getPov();
    const zoom = panorama.getZoom();

    if (!position) return null;

    return {
      lat: position.lat(),
      lng: position.lng(),
      heading: normalizeNumber(pov?.heading, 0),
      pitch: normalizeNumber(pov?.pitch, 0),
      zoom: normalizeNumber(zoom, 1),
    };
  }, []);

  const loadSavedViewFromSupabase = useCallback(async () => {
    if (!resolvedRecordId) {
      const fallback = getInitialStreetViewState(location);
      setSavedView(fallback);
      setLiveView(fallback);
      return fallback;
    }

    try {
      const { data, error } = await supabase
        .from(resolvedTable)
        .select(
          'streetview_lat, streetview_lng, streetview_heading, streetview_pitch, streetview_zoom'
        )
        .eq('id', resolvedRecordId)
        .maybeSingle();

      if (error) throw error;

      const fallback = getInitialStreetViewState(location);

      const nextView = {
        lat: hasNumber(data?.streetview_lat)
          ? Number(data.streetview_lat)
          : fallback.lat,

        lng: hasNumber(data?.streetview_lng)
          ? Number(data.streetview_lng)
          : fallback.lng,

        heading: hasNumber(data?.streetview_heading)
          ? Number(data.streetview_heading)
          : fallback.heading,

        pitch: hasNumber(data?.streetview_pitch)
          ? Number(data.streetview_pitch)
          : fallback.pitch,

        zoom: hasNumber(data?.streetview_zoom)
          ? Number(data.streetview_zoom)
          : fallback.zoom,
      };

      setSavedView(nextView);
      setLiveView(nextView);

      return nextView;
    } catch (error) {
      console.error('Error loading saved Street View position:', error);

      const fallback = getInitialStreetViewState(location);
      setSavedView(fallback);
      setLiveView(fallback);

      return fallback;
    }
  }, [location, resolvedRecordId, resolvedTable]);

  useEffect(() => {
    loadSavedViewFromSupabase();
  }, [loadSavedViewFromSupabase]);

  useEffect(() => {
    if (
      viewMode !== 'street' ||
      !hasCoordinates ||
      !panoramaContainerRef.current
    ) {
      return undefined;
    }

    let cancelled = false;

    const initialize = async () => {
      setIsLoadingView(true);
      setLoadError('');
      setSavedMessage('');

      try {
        const maps = await loadGoogleMapsScript();

        if (cancelled || !panoramaContainerRef.current) return;

        const initialView = await loadSavedViewFromSupabase();

        clearPanoramaListeners();

        const panorama = new maps.StreetViewPanorama(
          panoramaContainerRef.current,
          {
            position: {
              lat: Number(initialView.lat),
              lng: Number(initialView.lng),
            },

            pov: {
              heading: Number(initialView.heading || 0),
              pitch: Number(initialView.pitch || 0),
            },

            zoom: Number(initialView.zoom || 1),

            addressControl: true,
            clickToGo: true,
            linksControl: true,
            motionTracking: false,
            motionTrackingControl: false,
            panControl: true,
            fullscreenControl: true,
            zoomControl: true,
            enableCloseButton: false,
            visible: true,
          }
        );

        panoramaRef.current = panorama;

        const syncLiveState = () => {
          const state = readPanoramaState();

          if (!state) return;

          // Google Street View can fire position/pov/zoom events repeatedly
          // with tiny floating-point differences. Avoid rerendering the whole
          // sidebar unless the visible camera state actually changed.
          setLiveView((previous) => {
            const tolerance = 0.000001;

            const isSame =
              Math.abs(Number(previous?.lat) - Number(state.lat)) <= tolerance &&
              Math.abs(Number(previous?.lng) - Number(state.lng)) <= tolerance &&
              Math.abs(Number(previous?.heading) - Number(state.heading)) <= 0.1 &&
              Math.abs(Number(previous?.pitch) - Number(state.pitch)) <= 0.1 &&
              Math.abs(Number(previous?.zoom) - Number(state.zoom)) <= 0.01;

            return isSame ? previous : state;
          });
        };

        listenersRef.current = [
          panorama.addListener('position_changed', syncLiveState),
          panorama.addListener('pov_changed', syncLiveState),
          panorama.addListener('zoom_changed', syncLiveState),
        ];

        // Street View can snap to the nearest panorama after initialization.
        // Give it a moment, then capture the actual position it resolved to.
        window.setTimeout(() => {
          if (!cancelled) syncLiveState();
        }, 500);
      } catch (error) {
        console.error('Street View initialization error:', error);
        setLoadError(
          error?.message ||
            'Could not initialize Google Street View.'
        );
      } finally {
        if (!cancelled) {
          setIsLoadingView(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      clearPanoramaListeners();
      panoramaRef.current = null;
    };
  }, [
    viewMode,
    hasCoordinates,
    location?.id,
    clearPanoramaListeners,
    loadSavedViewFromSupabase,
    readPanoramaState,
  ]);

  const handleSaveStreetView = async () => {
    if (!resolvedRecordId) {
      setSaveError(
        isSettingsOffice
          ? 'This office must be saved before Street View can be saved.'
          : 'This marketing location must be saved before Street View can be saved.'
      );
      return;
    }

    const current = readPanoramaState();

    if (!current) {
      setSaveError(
        'Street View is not ready yet. Move the panorama and try again.'
      );
      return;
    }

    setIsSavingView(true);
    setSaveError('');
    setSavedMessage('');

    try {
      const payload = {
        streetview_lat: current.lat,
        streetview_lng: current.lng,
        streetview_heading: current.heading,
        streetview_pitch: current.pitch,
        streetview_zoom: current.zoom,
      };

      const { error } = await supabase
        .from(resolvedTable)
        .update(payload)
        .eq('id', resolvedRecordId);

      if (error) throw error;

      setSavedView(current);
      setLiveView(current);
      setSavedMessage('Street View position saved.');
    } catch (error) {
      console.error('Error saving Street View position:', error);

      setSaveError(
        error?.message ||
          'Could not save the Street View position.'
      );
    } finally {
      setIsSavingView(false);
    }
  };

  const handleResetToSavedView = () => {
    const panorama = panoramaRef.current;
    if (!panorama) return;

    panorama.setPosition({
      lat: Number(savedView.lat),
      lng: Number(savedView.lng),
    });

    panorama.setPov({
      heading: Number(savedView.heading || 0),
      pitch: Number(savedView.pitch || 0),
    });

    panorama.setZoom(
      Number(savedView.zoom || 1)
    );

    setLiveView(savedView);
    setSavedMessage('');
    setSaveError('');
  };

  const handleResetToTarget = () => {
    const panorama = panoramaRef.current;

    if (
      !panorama ||
      !hasCoordinates
    ) {
      return;
    }

    const resetState = {
      lat: Number(baseLat),
      lng: Number(baseLng),
      heading: 0,
      pitch: 0,
      zoom: 1,
    };

    panorama.setPosition({
      lat: resetState.lat,
      lng: resetState.lng,
    });

    panorama.setPov({
      heading: resetState.heading,
      pitch: resetState.pitch,
    });

    panorama.setZoom(resetState.zoom);

    setLiveView(resetState);
    setSavedMessage('');
    setSaveError('');
  };

  const hasUnsavedChanges = useMemo(() => {
    const tolerance = 0.000001;

    return (
      Math.abs(Number(liveView.lat) - Number(savedView.lat)) > tolerance ||
      Math.abs(Number(liveView.lng) - Number(savedView.lng)) > tolerance ||
      Math.abs(Number(liveView.heading) - Number(savedView.heading)) > 0.1 ||
      Math.abs(Number(liveView.pitch) - Number(savedView.pitch)) > 0.1 ||
      Math.abs(Number(liveView.zoom) - Number(savedView.zoom)) > 0.01
    );
  }, [liveView, savedView]);

  if (!location) {
    return (
      <section className={styles.infoSection}>
        <h3>Street View</h3>
        <p>Select a marketing location to view Street View.</p>
      </section>
    );
  }

  if (!hasCoordinates) {
    return (
      <section className={styles.infoSection}>
        <h3>Street View</h3>
        <p>Add latitude and longitude to display Google Street View.</p>
      </section>
    );
  }

  return (
    <section
      className={styles.infoSection}
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Street View</h3>

          <p
            style={{
              margin: '4px 0 0',
              color: '#64748b',
              fontWeight: 750,
              fontSize: 12,
            }}
          >
            {location.address || location.city || location.name}
          </p>
        </div>

        {showPhoto && uploadedPhoto && (
          <div
            style={{
              display: 'flex',
              gap: 5,
              padding: 4,
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('photo')}
              style={{
                border: 0,
                borderRadius: 9,
                padding: '6px 9px',
                fontWeight: 900,
                fontSize: 11,
                cursor: 'pointer',
                background:
                  viewMode === 'photo'
                    ? '#ffffff'
                    : 'transparent',
                color:
                  viewMode === 'photo'
                    ? '#0369a1'
                    : '#64748b',
              }}
            >
              Photo
            </button>

            <button
              type="button"
              onClick={() => setViewMode('street')}
              style={{
                border: 0,
                borderRadius: 9,
                padding: '6px 9px',
                fontWeight: 900,
                fontSize: 11,
                cursor: 'pointer',
                background:
                  viewMode === 'street'
                    ? '#ffffff'
                    : 'transparent',
                color:
                  viewMode === 'street'
                    ? '#0369a1'
                    : '#64748b',
              }}
            >
              Street
            </button>
          </div>
        )}
      </div>

      {viewMode === 'photo' && uploadedPhoto ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            overflow: 'hidden',
            background: '#f8fafc',
            minHeight: height,
            display: 'grid',
            placeItems: 'center',
            padding: 10,
          }}
        >
          <img
            src={uploadedPhoto}
            alt={location.name || 'Uploaded marketing view'}
            style={{
              width: '100%',
              maxHeight: height,
              objectFit: 'contain',
              borderRadius: 10,
            }}
          />
        </div>
      ) : (
        <>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              overflow: 'hidden',
              background: '#f8fafc',
              position: 'relative',
            }}
          >
            {!API_KEY ? (
              <div
                style={{
                  minHeight: height,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 18,
                  color: '#64748b',
                  fontWeight: 850,
                  textAlign: 'center',
                }}
              >
                Google Maps API key is missing.
              </div>
            ) : (
              <div
                ref={panoramaContainerRef}
                style={{
                  width: '100%',
                  height,
                  minHeight: height,
                }}
              />
            )}

            {isLoadingView && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(248,250,252,0.78)',
                  color: '#475569',
                  fontWeight: 900,
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              >
                Loading interactive Street View...
              </div>
            )}
          </div>

          <div
            style={{
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              borderRadius: 12,
              padding: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <div>
              <strong
                style={{
                  display: 'block',
                  color: '#075985',
                  fontSize: 12,
                }}
              >
                Position the Street View at the {targetLabel}
              </strong>

              <span
                style={{
                  display: 'block',
                  marginTop: 3,
                  color: '#64748b',
                  fontSize: 11,
                  fontWeight: 750,
                  lineHeight: 1.45,
                }}
              >
                Move down the road, rotate the camera, and zoom until the {targetLabel}
                is framed the way you want. Then click Save Street View Position.
              </span>
            </div>

            {loadError && (
              <div className={styles.errorBanner} style={{ margin: 0 }}>
                {loadError}
              </div>
            )}

            {saveError && (
              <div className={styles.errorBanner} style={{ margin: 0 }}>
                {saveError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleSaveStreetView}
                disabled={isSavingView || !API_KEY}
              >
                {isSavingView
                  ? 'Saving...'
                  : 'Save Street View Position'}
              </button>

              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleResetToSavedView}
                disabled={!API_KEY}
              >
                Reset to Saved
              </button>

              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleResetToTarget}
                disabled={!API_KEY}
              >
                Start at {targetPinLabel} Pin
              </button>
            </div>

            {savedMessage && (
              <span
                style={{
                  color: '#166534',
                  background: '#dcfce7',
                  border: '1px solid #bbf7d0',
                  borderRadius: 999,
                  padding: '6px 9px',
                  fontSize: 11,
                  fontWeight: 900,
                  width: 'fit-content',
                }}
              >
                ✓ {savedMessage}
              </span>
            )}

            {!savedMessage && hasUnsavedChanges && (
              <span
                style={{
                  color: '#92400e',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: 999,
                  padding: '6px 9px',
                  fontSize: 11,
                  fontWeight: 900,
                  width: 'fit-content',
                }}
              >
                Unsaved Street View changes
              </span>
            )}
          </div>
        </>
      )}

      {showSpecs && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <Spec
            label="Heading"
            value={`${Math.round(normalizeNumber(liveView.heading, 0))}°`}
          />

          <Spec
            label="Pitch"
            value={`${Math.round(normalizeNumber(liveView.pitch, 0))}°`}
          />

          <Spec
            label="Zoom"
            value={normalizeNumber(liveView.zoom, 1).toFixed(1)}
          />

          <Spec
            label="Size"
            value={getBillboardSize(location)}
          />

          <Spec
            label="Face"
            value={
              location.billboardFace ||
              location.billboard_face ||
              '—'
            }
          />

          <Spec
            label="Illumination"
            value={location.illumination || '—'}
          />

          <Spec
            label="Traffic Direction"
            value={
              location.trafficDirection ||
              location.traffic_direction ||
              '—'
            }
          />

          <Spec
            label="Daily Impressions"
            value={
              location.dailyImpressions ||
              location.daily_impressions ||
              location.estimatedImpressions ||
              '—'
            }
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.secondaryBtn}
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Open Map
        </a>

        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.secondaryBtn}
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Directions
        </a>
      </div>
    </section>
  );
};

const Spec = ({ label, value }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 9,
      background: '#f8fafc',
      minWidth: 0,
    }}
  >
    <span
      style={{
        display: 'block',
        color: '#64748b',
        fontSize: 10,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>

    <strong
      style={{
        display: 'block',
        color: '#0f172a',
        fontSize: 12,
        marginTop: 3,
        overflowWrap: 'anywhere',
      }}
    >
      {value || '—'}
    </strong>
  </div>
);

export default StreetViewPanel;