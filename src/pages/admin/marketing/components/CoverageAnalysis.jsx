// src/pages/admin/marketing/components/CoverageAnalysis.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getMapPosition } from '../utils/mapHelpers';
import { calculateDistanceMiles } from '../utils/distance';

const RADIUS_OPTIONS = [25, 50, 75, 100];

const TYPE_META = {
  billboard: { label: 'Billboards', singular: 'Billboard', icon: '🪧' },
  office: { label: 'Offices', singular: 'Office', icon: '🏢' },
  event: { label: 'Events', singular: 'Event', icon: '🎪' },
  sponsorship: { label: 'Sponsorships', singular: 'Sponsorship', icon: '🤝' },
};

const formatDistance = (distance) => {
  if (distance === null || distance === undefined || Number.isNaN(Number(distance))) return '—';
  return `${Number(distance).toFixed(1)} mi`;
};

const getLocationTitle = (location) => {
  if (!location) return '—';
  const office = location.office ? `${location.office} - ` : '';
  return `${office}${location.name || location.city || 'Marketing Location'}`;
};

const getLocationSubtitle = (location) => {
  return [location.city, location.region].filter(Boolean).join(' • ') || location.address || 'No location details';
};

const getNearbyWithinRadius = ({ selectedLocation, locations, radiusMiles }) => {
  const selectedPosition = getMapPosition(selectedLocation);

  if (!selectedLocation?.id || !selectedPosition) {
    return [];
  }

  return locations
    .filter((location) => {
      if (!location?.id || location.id === selectedLocation.id) return false;
      return !!getMapPosition(location);
    })
    .map((location) => ({
      ...location,
      distanceMiles: calculateDistanceMiles(selectedLocation, location),
    }))
    .filter((location) => location.distanceMiles !== null && location.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
};

const CoverageAnalysis = ({
  selectedLocation,
  locations = [],
  onLocationSelect,
  defaultRadiusMiles = 50,
  onRadiusChange,
  showRadiusControls = true,
  maxRowsPerType = 6,
}) => {
  const [radiusMiles, setRadiusMiles] = useState(defaultRadiusMiles);

  const selectedPosition = getMapPosition(selectedLocation);
  const hasSelectedCoordinates = !!selectedPosition;

  const nearby = useMemo(() => {
    return getNearbyWithinRadius({
      selectedLocation,
      locations,
      radiusMiles,
    });
  }, [selectedLocation, locations, radiusMiles]);

  const grouped = useMemo(() => {
    return nearby.reduce((acc, location) => {
      const type = location.type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(location);
      return acc;
    }, {});
  }, [nearby]);

  const officeCount = grouped.office?.length || 0;
  const billboardCount = grouped.billboard?.length || 0;
  const eventCount = grouped.event?.length || 0;
  const sponsorshipCount = grouped.sponsorship?.length || 0;

  const closestOffice = grouped.office?.[0] || null;
  const closestAsset = nearby.find((location) => location.type !== 'office') || null;

  const handleRadiusChange = (nextRadius) => {
    setRadiusMiles(nextRadius);

    if (typeof onRadiusChange === 'function') {
      onRadiusChange(nextRadius);
    }
  };

  if (!selectedLocation) {
    return (
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>Coverage Analysis</strong>
        <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>Select a location to see nearby offices and marketing assets.</span>
      </section>
    );
  }

  if (!hasSelectedCoordinates) {
    return (
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>Coverage Analysis</strong>
        <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Add latitude and longitude to this location to calculate coverage radius and nearby offices.
        </span>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <strong style={{ color: '#0f172a' }}>Coverage Analysis</strong>
          <span style={{ color: '#64748b', fontWeight: 800, fontSize: 11 }}>
            {radiusMiles} mile radius from {selectedLocation.city || selectedLocation.name}
          </span>
        </div>

        <span style={{ background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '4px 8px', fontWeight: 950, fontSize: 11, whiteSpace: 'nowrap' }}>
          {nearby.length} nearby
        </span>
      </div>

      {showRadiusControls && (
        <div style={{ display: 'grid', gap: 7 }}>
          <span style={{ color: '#64748b', fontWeight: 950, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Coverage Radius
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {RADIUS_OPTIONS.map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => handleRadiusChange(radius)}
                style={{
                  border: radiusMiles === radius ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
                  background: radiusMiles === radius ? '#eff6ff' : '#f8fafc',
                  color: radiusMiles === radius ? '#0369a1' : '#475569',
                  borderRadius: 10,
                  padding: '8px 5px',
                  fontWeight: 950,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {radius} mi
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
        {[
          ['🏢', 'Offices', officeCount],
          ['🪧', 'Boards', billboardCount],
          ['🎪', 'Events', eventCount],
          ['🤝', 'Sponsors', sponsorshipCount],
        ].map(([icon, label, count]) => (
          <div key={label} style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: 9, textAlign: 'center', display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            <strong style={{ color: '#0f172a', fontSize: 15 }}>{count}</strong>
            <small style={{ color: '#64748b', fontWeight: 900, fontSize: 10 }}>{label}</small>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #e2e8f0', background: 'linear-gradient(180deg,#f8fafc,#ffffff)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a', fontSize: 13 }}>At a Glance</strong>

        <div style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 800, fontSize: 12 }}>
          <span>
            Nearest Office:{' '}
            <strong style={{ color: '#0f172a' }}>
              {closestOffice ? `${getLocationTitle(closestOffice)} (${formatDistance(closestOffice.distanceMiles)})` : 'None in radius'}
            </strong>
          </span>

          <span>
            Nearest Asset:{' '}
            <strong style={{ color: '#0f172a' }}>
              {closestAsset ? `${getLocationTitle(closestAsset)} (${formatDistance(closestAsset.distanceMiles)})` : 'None in radius'}
            </strong>
          </span>
        </div>
      </div>

      {Object.entries(TYPE_META).map(([type, meta]) => {
        const rows = grouped[type] || [];
        if (rows.length === 0) return null;

        return (
          <div key={type} style={{ display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <strong style={{ color: '#0f172a', fontSize: 13 }}>
                {meta.icon} Covered {meta.label}
              </strong>
              <small style={{ color: '#64748b', fontWeight: 900 }}>{rows.length}</small>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              {rows.slice(0, maxRowsPerType).map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => typeof onLocationSelect === 'function' && onLocationSelect(location)}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 11, padding: 9, cursor: 'pointer' }}
                >
                  <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                    <strong style={{ color: '#0f172a', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ✓ {getLocationTitle(location)}
                    </strong>

                    <small style={{ color: '#64748b', fontWeight: 800, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getLocationSubtitle(location)}
                    </small>
                  </span>

                  <strong style={{ color: '#0369a1', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatDistance(location.distanceMiles)}
                  </strong>
                </button>
              ))}

              {rows.length > maxRowsPerType && (
                <span style={{ color: '#64748b', fontWeight: 850, fontSize: 11, textAlign: 'center' }}>
                  +{rows.length - maxRowsPerType} more {meta.label.toLowerCase()} in radius
                </span>
              )}
            </div>
          </div>
        );
      })}

      {nearby.length === 0 && (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 12, color: '#64748b', fontWeight: 800, fontSize: 12, textAlign: 'center', background: '#f8fafc' }}>
          No offices or marketing assets found within {radiusMiles} miles.
        </div>
      )}

      <button type="button" className={styles.secondaryBtn} onClick={() => handleRadiusChange(defaultRadiusMiles)} style={{ justifySelf: 'start', padding: '7px 10px', fontSize: 12, display: radiusMiles === defaultRadiusMiles ? 'none' : 'inline-flex' }}>
        Reset Radius
      </button>
    </section>
  );
};

export default CoverageAnalysis;
