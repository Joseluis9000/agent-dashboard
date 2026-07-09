// src/pages/admin/marketing/components/NearbyLocations.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getMapPosition } from '../utils/mapHelpers';
import { calculateDistanceMiles } from '../utils/distance';

const TYPE_META = {
  billboard: { label: 'Billboard', icon: '🪧' },
  office: { label: 'Office', icon: '🏢' },
  event: { label: 'Event', icon: '🎪' },
  sponsorship: { label: 'Sponsorship', icon: '🤝' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Nearby' },
  { value: 'office', label: 'Offices' },
  { value: 'billboard', label: 'Billboards' },
  { value: 'event', label: 'Events' },
  { value: 'sponsorship', label: 'Sponsorships' },
];

const DEFAULT_RADIUS_MILES = 50;
const DEFAULT_LIMIT = 8;

const formatDistance = (distance) => {
  if (distance === null || distance === undefined || Number.isNaN(Number(distance))) return '—';
  return `${Number(distance).toFixed(1)} mi`;
};

const getLocationLabel = (location) => {
  const office = location.office ? `${location.office} - ` : '';
  return `${office}${location.name || location.city || 'Marketing Location'}`;
};

const getLocationSubLabel = (location) => {
  return [location.city, location.region].filter(Boolean).join(' • ') || location.address || 'No location details';
};

const NearbyLocations = ({
  selectedLocation,
  locations = [],
  onLocationSelect,
  radiusMiles = DEFAULT_RADIUS_MILES,
  limit = DEFAULT_LIMIT,
  showFilters = true,
  title = 'Nearby Locations',
}) => {
  const [typeFilter, setTypeFilter] = useState('all');

  const nearbyLocations = useMemo(() => {
    const selectedPosition = getMapPosition(selectedLocation);
    if (!selectedLocation?.id || !selectedPosition) return [];

    return locations
      .filter((location) => {
        if (!location?.id || location.id === selectedLocation.id) return false;
        if (typeFilter !== 'all' && location.type !== typeFilter) return false;
        return !!getMapPosition(location);
      })
      .map((location) => ({
        ...location,
        distanceMiles: calculateDistanceMiles(selectedLocation, location),
      }))
      .filter((location) => location.distanceMiles !== null && location.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, limit);
  }, [locations, selectedLocation, radiusMiles, limit, typeFilter]);

  const selectedHasCoordinates = !!getMapPosition(selectedLocation);

  if (!selectedLocation) {
    return (
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>{title}</strong>
        <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Select a marketing location to see nearby offices, billboards, events, and sponsorships.
        </span>
      </section>
    );
  }

  if (!selectedHasCoordinates) {
    return (
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>{title}</strong>
        <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Add latitude and longitude to this location to calculate nearby marketing coverage.
        </span>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <strong style={{ color: '#0f172a' }}>{title}</strong>
          <span style={{ color: '#64748b', fontWeight: 800, fontSize: 11 }}>
            Within {radiusMiles} miles of {selectedLocation.city || selectedLocation.name}
          </span>
        </div>

        <span style={{ background: '#eff6ff', color: '#075985', border: '1px solid #bfdbfe', borderRadius: 999, padding: '4px 8px', fontWeight: 950, fontSize: 11, whiteSpace: 'nowrap' }}>
          {nearbyLocations.length} found
        </span>
      </div>

      {showFilters && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              style={{
                border: typeFilter === option.value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
                background: typeFilter === option.value ? '#eff6ff' : '#f8fafc',
                color: typeFilter === option.value ? '#0369a1' : '#475569',
                borderRadius: 999,
                padding: '5px 8px',
                fontWeight: 900,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {nearbyLocations.length === 0 ? (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 12, color: '#64748b', fontWeight: 800, fontSize: 12, textAlign: 'center', background: '#f8fafc' }}>
            No nearby locations found within {radiusMiles} miles.
          </div>
        ) : (
          nearbyLocations.map((location) => {
            const typeMeta = TYPE_META[location.type] || { label: 'Marketing', icon: '📍' };

            return (
              <button
                key={location.id}
                type="button"
                onClick={() => typeof onLocationSelect === 'function' && onLocationSelect(location)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  borderRadius: 12,
                  padding: 9,
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden="true" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: 16 }}>
                  {typeMeta.icon}
                </span>

                <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                  <strong style={{ color: '#0f172a', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getLocationLabel(location)}
                  </strong>

                  <small style={{ color: '#64748b', fontWeight: 800, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeMeta.label} • {getLocationSubLabel(location)}
                  </small>
                </span>

                <strong style={{ color: '#0369a1', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatDistance(location.distanceMiles)}
                </strong>
              </button>
            );
          })
        )}
      </div>

      <button type="button" className={styles.secondaryBtn} onClick={() => setTypeFilter('all')} style={{ display: typeFilter === 'all' ? 'none' : 'inline-flex', justifySelf: 'start', padding: '7px 10px', fontSize: 12 }}>
        Clear Nearby Filter
      </button>
    </section>
  );
};

export default NearbyLocations;
