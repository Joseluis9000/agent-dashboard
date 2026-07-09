// src/pages/admin/marketing/components/MarketingSidebar.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import BillboardNavigator from './BillboardNavigator';
import ContractCard from './ContractCard';
import NearbyLocations from './NearbyLocations';
import CoverageAnalysis from './CoverageAnalysis';
import PhotoGallery from './PhotoGallery';
import StreetViewPanel from './StreetViewPanel';
import {
  getLocationGroupLabel,
  getLocationTypeLabel,
  isOfficeLocation,
  splitOfficeAndMarketingLocations,
} from '../utils/locationTypeHelpers';

const TAB_CONFIG = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'photos', label: 'Photos' },
  { key: 'street', label: 'Street View' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'navigator', label: 'Navigator' },
];

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const MarketingSidebar = ({
  locations = [],
  selectedLocation = null,
  onLocationSelect,
  onLocationUpdate,
  coverageRadiusMiles = 25,
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  const { officeLocations, marketingAssets } = useMemo(() => {
    return splitOfficeAndMarketingLocations(locations);
  }, [locations]);

  if (!selectedLocation) {
    return (
      <aside className={styles.detailsCard}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Locations</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
              Select an office or marketing asset from the map or navigator.
            </p>
          </div>

          <LocationGroupSummary officeCount={officeLocations.length} assetCount={marketingAssets.length} />

          <BillboardNavigator locations={locations} selectedLocation={selectedLocation} onLocationSelect={onLocationSelect} />
        </div>
      </aside>
    );
  }

  const isOffice = isOfficeLocation(selectedLocation);

  return (
    <aside className={styles.detailsCard}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={styles.detailsHeader}>
          <div>
            <h2>{selectedLocation.name || selectedLocation.office || 'Selected Location'}</h2>
            <p>
              {getLocationGroupLabel(selectedLocation)} • {getLocationTypeLabel(selectedLocation.type)}
              {selectedLocation.city ? ` • ${selectedLocation.city}` : ''}
            </p>
          </div>

          <span style={{ background: isOffice ? '#dbeafe' : '#dcfce7', color: isOffice ? '#1d4ed8' : '#166534', border: `1px solid ${isOffice ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: 999, padding: '5px 9px', fontWeight: 950, fontSize: 11, whiteSpace: 'nowrap' }}>
            {isOffice ? 'Office' : 'Marketing'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', borderBottom: '1px solid #e2e8f0' }}>
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{ border: 0, borderBottom: activeTab === tab.key ? '3px solid #0ea5e9' : '3px solid transparent', background: 'transparent', color: activeTab === tab.key ? '#0284c7' : '#64748b', padding: '9px 8px', fontWeight: 950, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          isOffice ? (
            <OfficeOverview office={selectedLocation} marketingAssets={marketingAssets} onLocationSelect={onLocationSelect} />
          ) : (
            <MarketingAssetOverview location={selectedLocation} />
          )
        )}

        {activeTab === 'contracts' && (
          isOffice ? <OfficeContractsPlaceholder /> : <ContractCard location={selectedLocation} />
        )}

        {activeTab === 'photos' && <PhotoGallery location={selectedLocation} onLocationUpdate={onLocationUpdate} />}
        {activeTab === 'street' && <StreetViewPanel location={selectedLocation} />}
        {activeTab === 'nearby' && <NearbyLocations selectedLocation={selectedLocation} locations={isOffice ? marketingAssets : officeLocations} onLocationSelect={onLocationSelect} />}
        {activeTab === 'coverage' && <CoverageAnalysis selectedLocation={selectedLocation} locations={locations} coverageRadiusMiles={coverageRadiusMiles} />}
        {activeTab === 'navigator' && <BillboardNavigator locations={locations} selectedLocation={selectedLocation} onLocationSelect={onLocationSelect} />}
      </div>
    </aside>
  );
};

const LocationGroupSummary = ({ officeCount, assetCount }) => (
  <div className={styles.detailGrid}>
    <div><span>Office Locations</span><strong>{officeCount}</strong></div>
    <div><span>Marketing Assets</span><strong>{assetCount}</strong></div>
  </div>
);

const OfficeOverview = ({ office, marketingAssets, onLocationSelect }) => {
  const nearbyAssets = marketingAssets.filter((asset) => asset.office === office.office || asset.region === office.region).slice(0, 6);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className={styles.detailGrid}>
        <div><span>Office Code</span><strong>{office.office || '—'}</strong></div>
        <div><span>Region</span><strong>{office.region || '—'}</strong></div>
        <div><span>City</span><strong>{office.city || '—'}</strong></div>
        <div><span>Status</span><strong>{office.status || '—'}</strong></div>
        <div className={styles.fullWidth}><span>Address</span><strong>{office.address || office.name || '—'}</strong></div>
      </div>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3>Office Marketing Anchor</h3>
        <p style={{ margin: 0, color: '#64748b', fontWeight: 750, fontSize: 13, lineHeight: 1.45 }}>
          This office should be used as the center point for USPS EDDM routes, nearby billboards,
          field activities, campaign coverage, and future call-tracking attribution.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>Related Marketing Assets</strong>
        {nearbyAssets.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: 12 }}>No related marketing assets found for this office yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {nearbyAssets.map((asset) => (
              <button key={asset.id} type="button" onClick={() => onLocationSelect?.(asset)} style={{ border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: 12, padding: 10, textAlign: 'left', cursor: 'pointer' }}>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: 12 }}>{asset.name || asset.office || 'Marketing Asset'}</strong>
                <small style={{ color: '#64748b', fontWeight: 850 }}>{getLocationTypeLabel(asset.type)} • {asset.city || '—'}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const MarketingAssetOverview = ({ location }) => (
  <div style={{ display: 'grid', gap: 14 }}>
    <div className={styles.detailGrid}>
      <div><span>Type</span><strong>{getLocationTypeLabel(location.type)}</strong></div>
      <div><span>Status</span><strong>{location.status || '—'}</strong></div>
      <div><span>Office</span><strong>{location.office || '—'}</strong></div>
      <div><span>Region</span><strong>{location.region || '—'}</strong></div>
      <div><span>Monthly / Event Cost</span><strong>{formatMoney(location.monthlyCost || location.eventCost || 0)}</strong></div>
      <div><span>Campaign</span><strong>{location.campaign || '—'}</strong></div>
    </div>
    {location.notes && <p className={styles.notes}>{location.notes}</p>}
  </div>
);

const OfficeContractsPlaceholder = () => (
  <div style={{ display: 'grid', gap: 10 }}>
    <div className={styles.emptyState} style={{ padding: 14 }}>
      Office records do not use billboard/event contracts. Use this section later for lease,
      office photos, inspections, or branch documents.
    </div>
  </div>
);

export default MarketingSidebar;
