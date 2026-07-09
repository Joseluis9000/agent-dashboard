// src/pages/admin/marketing/components/BillboardNavigator.jsx

import React, { useMemo, useState } from 'react';
import { getStatusMeta } from '../utils/marketingHelpers';
import {
  getLocationTypeLabel,
  getOfficeDisplayName,
  splitOfficeAndMarketingLocations,
} from '../utils/locationTypeHelpers';

const sortByOfficeThenName = (a, b) => {
  const aText = `${a.office || ''} ${a.name || ''} ${a.city || ''}`.trim().toLowerCase();
  const bText = `${b.office || ''} ${b.name || ''} ${b.city || ''}`.trim().toLowerCase();
  return aText.localeCompare(bText);
};

const BillboardNavigator = ({
  locations = [],
  selectedLocation = null,
  onLocationSelect,
}) => {
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const { officeLocations, marketingAssets } = useMemo(() => {
    const grouped = splitOfficeAndMarketingLocations(locations);

    return {
      officeLocations: grouped.officeLocations.slice().sort(sortByOfficeThenName),
      marketingAssets: grouped.marketingAssets.slice().sort(sortByOfficeThenName),
    };
  }, [locations]);

  const assetTypeCounts = useMemo(() => {
    return marketingAssets.reduce(
      (acc, location) => {
        acc.all += 1;
        acc[location.type] = (acc[location.type] || 0) + 1;
        return acc;
      },
      {
        all: 0,
        billboard: 0,
        event: 0,
        sponsorship: 0,
      }
    );
  }, [marketingAssets]);

  const visibleMarketingAssets = useMemo(() => {
    if (assetTypeFilter === 'all') return marketingAssets;
    return marketingAssets.filter((location) => location.type === assetTypeFilter);
  }, [assetTypeFilter, marketingAssets]);

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <NavigatorGroup
        title="Office Locations"
        subtitle="Physical offices used as marketing anchors."
        emptyText="No office locations added yet."
        locations={officeLocations}
        selectedLocation={selectedLocation}
        onLocationSelect={onLocationSelect}
        mode="office"
      />

      <NavigatorGroup
        title="Marketing Assets"
        subtitle="Billboards, events, and sponsorships."
        emptyText="No marketing assets added yet."
        locations={visibleMarketingAssets}
        selectedLocation={selectedLocation}
        onLocationSelect={onLocationSelect}
        mode="asset"
        assetTypeFilter={assetTypeFilter}
        setAssetTypeFilter={setAssetTypeFilter}
        assetTypeCounts={assetTypeCounts}
      />
    </section>
  );
};

const NavigatorGroup = ({
  title,
  subtitle,
  emptyText,
  locations,
  selectedLocation,
  onLocationSelect,
  mode,
  assetTypeFilter,
  setAssetTypeFilter,
  assetTypeCounts,
}) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 16,
      background: '#ffffff',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        padding: 12,
        background: mode === 'office' ? '#eff6ff' : '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <strong style={{ display: 'block', color: '#0f172a', fontSize: 13 }}>
        {mode === 'office' ? '🏢 ' : '📍 '}
        {title}
      </strong>
      <small style={{ display: 'block', color: '#64748b', fontWeight: 800, marginTop: 3 }}>
        {subtitle}
      </small>
    </div>

    {mode === 'asset' && (
      <AssetTypeToggle
        assetTypeFilter={assetTypeFilter}
        setAssetTypeFilter={setAssetTypeFilter}
        assetTypeCounts={assetTypeCounts}
      />
    )}

    {locations.length === 0 ? (
      <div style={{ padding: 12, color: '#64748b', fontWeight: 850, fontSize: 12 }}>
        {emptyText}
      </div>
    ) : (
      <div style={{ display: 'grid', gap: 8, padding: 10 }}>
        {locations.map((location) => (
          <LocationNavCard
            key={location.id}
            location={location}
            selected={selectedLocation?.id === location.id}
            onClick={() => onLocationSelect?.(location)}
            mode={mode}
          />
        ))}
      </div>
    )}
  </div>
);

const AssetTypeToggle = ({ assetTypeFilter, setAssetTypeFilter, assetTypeCounts = {} }) => (
  <div style={{ display: 'flex', gap: 6, padding: '10px 10px 0', overflowX: 'auto' }}>
    {[
      ['all', 'All'],
      ['billboard', 'Billboards'],
      ['event', 'Events'],
      ['sponsorship', 'Sponsorships'],
    ].map(([value, label]) => (
      <button
        key={value}
        type="button"
        onClick={() => setAssetTypeFilter?.(value)}
        style={{
          border: assetTypeFilter === value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
          background: assetTypeFilter === value ? '#eff6ff' : '#ffffff',
          color: assetTypeFilter === value ? '#0369a1' : '#64748b',
          borderRadius: 999,
          padding: '6px 9px',
          fontWeight: 950,
          fontSize: 11,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {label} ({assetTypeCounts[value] || 0})
      </button>
    ))}
  </div>
);

const LocationNavCard = ({ location, selected, onClick, mode }) => {
  const status = getStatusMeta(location.status);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        border: selected ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
        background: selected ? '#eff6ff' : '#ffffff',
        borderRadius: 14,
        padding: 10,
        cursor: 'pointer',
        display: 'grid',
        gap: 6,
        boxShadow: selected ? '0 10px 24px rgba(14,165,233,0.14)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <strong style={{ color: '#0f172a', fontSize: 12, lineHeight: 1.2 }}>
          {mode === 'office' ? getOfficeDisplayName(location) : location.name || location.office || 'Marketing Asset'}
        </strong>

        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: mode === 'office' ? '#0ea5e9' : status.color,
            flex: '0 0 auto',
            marginTop: 3,
          }}
        />
      </div>

      <small style={{ color: '#64748b', fontWeight: 850, fontSize: 11 }}>
        {mode === 'office'
          ? ['Office', location.region, location.status].filter(Boolean).join(' • ')
          : [getLocationTypeLabel(location.type), location.office, location.city].filter(Boolean).join(' • ')}
      </small>
    </button>
  );
};

export default BillboardNavigator;
