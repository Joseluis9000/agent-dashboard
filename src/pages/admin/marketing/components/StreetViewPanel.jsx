// src/pages/admin/marketing/components/StreetViewPanel.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const normalizeNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getStreetViewSettings = (location) => ({
  heading: normalizeNumber(location?.streetviewHeading ?? location?.streetview_heading, 0),
  pitch: normalizeNumber(location?.streetviewPitch ?? location?.streetview_pitch, 0),
  zoom: normalizeNumber(location?.streetviewZoom ?? location?.streetview_zoom, 1),
});

const getBillboardSize = (location) => {
  if (!location?.billboardWidth || !location?.billboardHeight) return '—';
  return `${location.billboardWidth} x ${location.billboardHeight} ${location.billboardSizeUnit || 'ft'}`;
};

const StreetViewPanel = ({
  location,
  height = 340,
  showPhoto = true,
  showSpecs = true,
}) => {
  const [viewMode, setViewMode] = useState('street');

  const lat = location?.lat;
  const lng = location?.lng;
  const hasCoordinates = lat !== null && lat !== undefined && lng !== null && lng !== undefined;
  const uploadedPhoto = location?.photoUrl || location?.graphicUrl || '';

  const settings = useMemo(() => getStreetViewSettings(location), [location]);

  const streetViewUrl = useMemo(() => {
    if (!hasCoordinates || !API_KEY) return '';

    const fov = Math.max(20, Math.min(120, 90 / Math.max(settings.zoom, 1)));

    return `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&location=${lat},${lng}&heading=${settings.heading}&pitch=${settings.pitch}&fov=${fov}`;
  }, [hasCoordinates, lat, lng, settings.heading, settings.pitch, settings.zoom]);

  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : '';

  const directionsUrl = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : '';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Street View</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
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
                background: viewMode === 'photo' ? '#ffffff' : 'transparent',
                color: viewMode === 'photo' ? '#0369a1' : '#64748b',
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
                background: viewMode === 'street' ? '#ffffff' : 'transparent',
                color: viewMode === 'street' ? '#0369a1' : '#64748b',
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
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            overflow: 'hidden',
            background: '#f8fafc',
          }}
        >
          {streetViewUrl ? (
            <iframe
              title={`${location.name || 'Marketing Location'} Street View`}
              src={streetViewUrl}
              width="100%"
              height={height}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              style={{ border: 0, display: 'block' }}
            />
          ) : (
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
          )}
        </div>
      )}

      {showSpecs && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <Spec label="Heading" value={`${settings.heading}°`} />
          <Spec label="Pitch" value={`${settings.pitch}°`} />
          <Spec label="Zoom" value={settings.zoom} />
          <Spec label="Size" value={getBillboardSize(location)} />
          <Spec label="Face" value={location.billboardFace || location.billboard_face || '—'} />
          <Spec label="Illumination" value={location.illumination || '—'} />
          <Spec label="Traffic Direction" value={location.trafficDirection || location.traffic_direction || '—'} />
          <Spec label="Daily Impressions" value={location.dailyImpressions || location.daily_impressions || location.estimatedImpressions || '—'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.secondaryBtn}
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Open Map
        </a>

        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.secondaryBtn}
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
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
