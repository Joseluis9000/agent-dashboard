// src/pages/admin/marketing/components/PhotoComparePanel.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const TYPE_LABELS = {
  billboard: 'Billboard Photo',
  artwork_proof: 'Artwork Proof',
  design_mockup: 'Design Mockup',
  installation: 'Installation',
  night: 'Night Photo',
  damage: 'Damage',
  maintenance: 'Maintenance',
  street_view: 'Street View Reference',
  drone: 'Drone',
  permit: 'Permit',
  contract: 'Contract',
  invoice: 'Invoice',
  proof: 'Proof',
  graphic: 'Graphic',
  other: 'Other',
};

const getPhotoLabel = (photo, fallback = 'Photo') => {
  if (!photo) return fallback;
  return photo.title || TYPE_LABELS[photo.photoType] || fallback;
};

const getPrimaryPhoto = (photos = [], location = null) => {
  const primary = photos.find((photo) => photo.isPrimary) || photos[0];
  if (primary) return primary;

  const fallbackUrl = location?.primaryPhotoUrl || location?.photoUrl || location?.graphicUrl;
  if (!fallbackUrl) return null;

  return {
    id: 'fallback-photo',
    photoUrl: fallbackUrl,
    photoType: 'billboard',
    title: location?.name || 'Main Photo',
    isFallback: true,
  };
};

const getArtworkPhoto = (photos = []) => {
  return (
    photos.find((photo) => photo.photoType === 'artwork_proof') ||
    photos.find((photo) => photo.photoType === 'design_mockup') ||
    photos.find((photo) => photo.photoType === 'graphic') ||
    photos.find((photo) => photo.photoType === 'proof') ||
    null
  );
};

const normalizeNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getStreetViewUrl = (location) => {
  const lat = location?.lat;
  const lng = location?.lng;

  if (lat === null || lat === undefined || lng === null || lng === undefined || !API_KEY) {
    return '';
  }

  const heading = normalizeNumber(location?.streetviewHeading ?? location?.streetview_heading, 0);
  const pitch = normalizeNumber(location?.streetviewPitch ?? location?.streetview_pitch, 0);
  const zoom = normalizeNumber(location?.streetviewZoom ?? location?.streetview_zoom, 1);
  const fov = Math.max(20, Math.min(120, 90 / Math.max(zoom, 1)));

  return `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}`;
};

const PhotoComparePanel = ({ location, photos = [] }) => {
  const [leftType, setLeftType] = useState('uploaded');
  const [rightType, setRightType] = useState('street');

  const primaryPhoto = useMemo(() => getPrimaryPhoto(photos, location), [photos, location]);
  const artworkPhoto = useMemo(() => getArtworkPhoto(photos), [photos]);
  const streetViewUrl = useMemo(() => getStreetViewUrl(location), [location]);

  const options = [
    { value: 'uploaded', label: 'Uploaded Photo' },
    { value: 'street', label: 'Street View' },
    { value: 'artwork', label: 'Artwork / Proof' },
  ];

  const renderPane = (type) => {
    if (type === 'street') {
      if (!streetViewUrl) {
        return (
          <EmptyPane
            title="Street View unavailable"
            message="Add latitude/longitude and confirm your Google Maps API key has Maps Embed API enabled."
          />
        );
      }

      return (
        <iframe
          title={`${location?.name || 'Location'} Street View`}
          src={streetViewUrl}
          width="100%"
          height="100%"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, display: 'block' }}
        />
      );
    }

    const photo = type === 'artwork' ? artworkPhoto : primaryPhoto;

    if (!photo?.photoUrl) {
      return (
        <EmptyPane
          title={type === 'artwork' ? 'No artwork proof yet' : 'No uploaded photo yet'}
          message={type === 'artwork'
            ? 'Upload a file categorized as Artwork Proof, Design Mockup, Graphic, or Proof.'
            : 'Upload a billboard photo or set one as primary.'}
        />
      );
    }

    return (
      <img
        src={photo.photoUrl}
        alt={getPhotoLabel(photo)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          background: '#f8fafc',
        }}
      />
    );
  };

  const getPaneTitle = (type) => {
    if (type === 'street') return 'Google Street View';
    if (type === 'artwork') return getPhotoLabel(artworkPhoto, 'Artwork / Proof');
    return getPhotoLabel(primaryPhoto, 'Uploaded Photo');
  };

  if (!location) {
    return (
      <section className={styles.infoSection}>
        <h3>Compare</h3>
        <p>Select a marketing location to compare photos, artwork, and Street View.</p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Compare Mode</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Compare the installed billboard, Google Street View, and approved artwork.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <CompareSelector
          label="Left Panel"
          value={leftType}
          onChange={setLeftType}
          options={options}
        />

        <CompareSelector
          label="Right Panel"
          value={rightType}
          onChange={setRightType}
          options={options}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <ComparePane title={getPaneTitle(leftType)}>
          {renderPane(leftType)}
        </ComparePane>

        <ComparePane title={getPaneTitle(rightType)}>
          {renderPane(rightType)}
        </ComparePane>
      </div>

      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: 12,
          background: '#f8fafc',
          display: 'grid',
          gap: 6,
        }}
      >
        <strong style={{ color: '#0f172a', fontSize: 13 }}>Quick QA Checklist</strong>
        <ChecklistItem text="Does the installed billboard match the approved artwork?" />
        <ChecklistItem text="Is the billboard visible from the expected traffic direction?" />
        <ChecklistItem text="Are there obstructions, fading, damage, or vegetation issues?" />
        <ChecklistItem text="Does Street View need a saved heading/pitch adjustment?" />
      </div>
    </section>
  );
};

const CompareSelector = ({ label, value, onChange, options }) => (
  <label
    style={{
      display: 'grid',
      gap: 5,
      color: '#334155',
      fontWeight: 900,
      fontSize: 12,
    }}
  >
    {label}
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 9,
        background: '#ffffff',
        fontWeight: 850,
        color: '#0f172a',
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

const ComparePane = ({ title, children }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      overflow: 'hidden',
      background: '#ffffff',
      display: 'grid',
      gridTemplateRows: 'auto 360px',
      minWidth: 0,
    }}
  >
    <div
      style={{
        padding: '9px 10px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        color: '#0f172a',
        fontWeight: 950,
        fontSize: 12,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {title}
    </div>

    <div style={{ minHeight: 360, background: '#f8fafc' }}>
      {children}
    </div>
  </div>
);

const EmptyPane = ({ title, message }) => (
  <div
    style={{
      height: '100%',
      display: 'grid',
      placeItems: 'center',
      padding: 18,
      textAlign: 'center',
      color: '#64748b',
      fontWeight: 800,
    }}
  >
    <div>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
      <strong style={{ display: 'block', color: '#334155', marginBottom: 4 }}>
        {title}
      </strong>
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  </div>
);

const ChecklistItem = ({ text }) => (
  <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#475569', fontWeight: 800, fontSize: 12 }}>
    <input type="checkbox" />
    {text}
  </label>
);

export default PhotoComparePanel;
