// src/pages/admin/marketing/components/MarketingMap.jsx

import React, { useMemo } from 'react';
import styles from '../../MarketingOps.module.css';
import useMarketingMap from '../hooks/useMarketingMap';
import { getStatusMeta } from '../utils/marketingHelpers';
import { getValidMapLocations } from '../utils/mapHelpers';
import {
  getLocationTypeLabel,
  isOfficeLocation,
  splitOfficeAndMarketingLocations,
} from '../utils/locationTypeHelpers';

const LegendIcon = ({ src, alt }) => (
  <img
    src={src}
    alt={alt}
    style={{
      width: 22,
      height: 22,
      objectFit: 'contain',
      flex: '0 0 auto',
    }}
  />
);

const StatusDot = ({ color }) => (
  <i
    style={{
      width: 9,
      height: 9,
      borderRadius: 999,
      background: color,
      display: 'inline-block',
      flex: '0 0 auto',
    }}
  />
);

const Legend = () => (
  <div className={styles.legend}>
    <span><LegendIcon src="/marketing-icons/office.png" alt="" /> Office Location</span>
    <span><LegendIcon src="/marketing-icons/billboard.png" alt="" /> Billboard</span>
    <span><LegendIcon src="/marketing-icons/dmv.png" alt="" /> DMV Video Location</span>
    <span style={{ marginTop: 3, paddingTop: 7, borderTop: '1px solid #e2e8f0' }}>
      <StatusDot color="#22c55e" /> Active
    </span>
    <span><StatusDot color="#d97706" /> Renewal Soon</span>
    <span><StatusDot color="#ef4444" /> Expired</span>
  </div>
);

const SelectedMapBadge = ({ selectedLocation }) => {
  if (!selectedLocation) return null;

  const status = getStatusMeta(selectedLocation.status);
  const isOffice = isOfficeLocation(selectedLocation);
  const selectedIcon = isOffice
    ? '/marketing-icons/office.png'
    : selectedLocation.type === 'dmv_video'
      ? '/marketing-icons/dmv.png'
      : selectedLocation.type === 'billboard'
        ? '/marketing-icons/billboard.png'
        : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 28,
        top: 28,
        zIndex: 20,
        maxWidth: 380,
        background: 'rgba(255,255,255,0.94)',
        border: isOffice ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow: '0 14px 35px rgba(15,23,42,0.16)',
        padding: '11px 12px',
        display: 'grid',
        gap: 4,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {selectedIcon ? (
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: `3px solid ${isOffice ? '#0ea5e9' : status.color}`,
              background: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
              boxShadow: '0 4px 12px rgba(15,23,42,0.14)',
            }}
          >
            <img
              src={selectedIcon}
              alt=""
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
          </span>
        ) : (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: isOffice ? '#0ea5e9' : status.color,
              flex: '0 0 auto',
            }}
          />
        )}
        <strong style={{ color: '#0f172a', fontSize: 13, lineHeight: 1.2 }}>
          {selectedLocation.name || selectedLocation.office || 'Selected Location'}
        </strong>
      </div>
      <small style={{ color: '#64748b', fontWeight: 800, fontSize: 11 }}>
        {isOffice ? 'Office Location' : getLocationTypeLabel(selectedLocation.type)}
        {' • '}
        {selectedLocation.city || '—'}
        {' • '}
        {selectedLocation.region || selectedLocation.office || '—'}
      </small>
    </div>
  );
};

const MapGroupSummary = ({ locations }) => {
  const { officeLocations, marketingAssets } = useMemo(
    () => splitOfficeAndMarketingLocations(locations),
    [locations]
  );

  return (
    <div
      style={{
        position: 'absolute',
        right: 22,
        top: 22,
        zIndex: 20,
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <SummaryPill icon="🏢" label="Offices" value={officeLocations.length} />
      <SummaryPill icon="📍" label="Marketing" value={marketingAssets.length} />
    </div>
  );
};

const ActiveFilterPill = ({ activeLocationGroupFilter, activeAssetTypeFilter }) => {
  const groupLabel = {
    all: 'All Locations',
    offices: 'Offices Only',
    marketing: 'Marketing Assets',
  }[activeLocationGroupFilter] || 'All Locations';

  const assetLabel = {
    all: 'All Asset Types',
    billboard: 'Billboards',
    event: 'Events',
    sponsorship: 'Sponsorships',
    dmv_video: 'DMV Video',
  }[activeAssetTypeFilter] || 'All Asset Types';

  return (
    <div
      style={{
        position: 'absolute',
        right: 22,
        top: 70,
        zIndex: 20,
        background: 'rgba(15,23,42,0.82)',
        color: '#ffffff',
        borderRadius: 999,
        padding: '7px 11px',
        fontWeight: 950,
        fontSize: 11,
        boxShadow: '0 10px 24px rgba(15,23,42,0.18)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {groupLabel}
      {activeLocationGroupFilter !== 'offices' ? ` • ${assetLabel}` : ''}
    </div>
  );
};

const SummaryPill = ({ icon, label, value }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.94)',
      border: '1px solid #e2e8f0',
      borderRadius: 999,
      padding: '7px 10px',
      boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
      color: '#0f172a',
      fontWeight: 950,
      fontSize: 11,
      backdropFilter: 'blur(12px)',
      whiteSpace: 'nowrap',
    }}
  >
    {icon} {label}: {value}
  </div>
);

const MapEmptyState = ({ validCount, totalCount }) => {
  if (totalCount === 0) {
    return (
      <div style={{ position: 'absolute', inset: 16, zIndex: 10, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, textAlign: 'center', color: '#475569', fontWeight: 850, boxShadow: '0 14px 35px rgba(15,23,42,0.12)' }}>
          No locations to display.
        </div>
      </div>
    );
  }

  if (validCount === 0) {
    return (
      <div style={{ position: 'absolute', inset: 16, zIndex: 10, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, textAlign: 'center', color: '#475569', fontWeight: 850, boxShadow: '0 14px 35px rgba(15,23,42,0.12)' }}>
          Add latitude and longitude to show offices and marketing assets on the map.
        </div>
      </div>
    );
  }

  return null;
};

const MarketingMap = ({
  locations = [],
  selectedLocation = null,
  onLocationSelect,
  coverageRadiusMiles = null,
  showCoverageRadius = false,
  height = 600,
  isLoading = false,
  activeLocationGroupFilter = 'all',
  activeAssetTypeFilter = 'all',
}) => {
  const validLocations = useMemo(() => getValidMapLocations(locations), [locations]);

  const {
    mapContainerRef,
    isMapReady,
    mapError,
    fitLocations,
  } = useMarketingMap({
    locations,
    selectedLocation,
    onLocationSelect,
    enabled: !isLoading,
    coverageRadiusMiles,
    showCoverageRadius,
  });

  return (
    <div className={styles.mapCard}>
      <div
        ref={mapContainerRef}
        id="google-map"
        style={{
          width: '100%',
          height,
          minHeight: 420,
          borderRadius: 12,
        }}
      />

      {mapError && (
        <div style={{ position: 'absolute', inset: 16, zIndex: 40, display: 'grid', placeItems: 'center', background: 'rgba(248,250,252,0.82)', borderRadius: 16, backdropFilter: 'blur(6px)' }}>
          <div className={styles.errorBanner} style={{ maxWidth: 520, margin: 0 }}>
            {mapError}
          </div>
        </div>
      )}

      {!mapError && isLoading && (
        <div style={{ position: 'absolute', inset: 16, zIndex: 25, display: 'grid', placeItems: 'center', background: 'rgba(248,250,252,0.62)', borderRadius: 16, backdropFilter: 'blur(5px)' }}>
          <div className={styles.emptyState}>Loading map...</div>
        </div>
      )}

      {!mapError && !isLoading && <MapGroupSummary locations={locations} />}
      {!mapError && !isLoading && (
        <ActiveFilterPill
          activeLocationGroupFilter={activeLocationGroupFilter}
          activeAssetTypeFilter={activeAssetTypeFilter}
        />
      )}
      {!mapError && !isLoading && <SelectedMapBadge selectedLocation={selectedLocation} />}

      {!mapError && !isLoading && (
        <MapEmptyState validCount={validLocations.length} totalCount={locations.length} />
      )}

      {!mapError && isMapReady && validLocations.length > 1 && (
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => fitLocations(validLocations)}
          style={{
            position: 'absolute',
            left: 28,
            bottom: 30,
            zIndex: 30,
            background: 'rgba(255,255,255,0.94)',
          }}
        >
          Fit Map
        </button>
      )}

      <Legend />
    </div>
  );
};

export default MarketingMap;