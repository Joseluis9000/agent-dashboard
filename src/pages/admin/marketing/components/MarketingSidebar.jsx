// src/pages/admin/marketing/components/MarketingSidebar.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import BillboardNavigator from './BillboardNavigator';
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
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'history', label: 'History' },
  { key: 'photos', label: 'Photos' },
  { key: 'street', label: 'Street View' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'navigator', label: 'Navigator' },
];

const MEDIA_TYPE_META = {
  dmv_video: {
    label: 'DMV Video Advertising',
    groupLabel: 'Physical Media Location',
    badge: 'DMV Video',
    icon: '📺',
    areaOnly: false,
  },
  tv_commercial: {
    label: 'TV Commercial',
    groupLabel: 'Area / Market Campaign',
    badge: 'TV',
    icon: '🎬',
    areaOnly: true,
  },
  geofencing: {
    label: 'Geofencing / Digital Ads',
    groupLabel: 'Area / Digital Campaign',
    badge: 'Geofence',
    icon: '🎯',
    areaOnly: true,
  },
};

const getDisplayTypeLabel = (type) =>
  MEDIA_TYPE_META[type]?.label || getLocationTypeLabel(type);

const getDisplayGroupLabel = (location) =>
  MEDIA_TYPE_META[location?.type]?.groupLabel || getLocationGroupLabel(location);

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getContractLengthLabel = (startDate, endDate) => {
  if (!startDate || !endDate) return '—';

  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';

  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  if (months <= 0) return 'Less than 1 month';
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? '' : 's'}`;
  }

  return `${months} months`;
};

const MarketingSidebar = ({
  locations = [],
  selectedLocation = null,
  related = {
    contracts: [],
    assets: [],
    events: [],
    tasks: [],
    notes: [],
    photos: [],
    mediaCampaigns: [],
  },
  onLocationSelect,
  onEdit,
  onDelete,
  onAddContract,
  onAddAsset,
  onAddEvent,
  onAddTask,
  onAddNote,
  onToggleTask,
  onDeleteRelatedRow,
  onPhotosChange,
  onAddMediaCampaign,
  onDeleteMediaCampaign,
  coverageRadiusMiles = 25,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [showRenewalForm, setShowRenewalForm] = useState(false);
  const [renewalSaving, setRenewalSaving] = useState(false);
  const [renewalError, setRenewalError] = useState('');
  const [renewalForm, setRenewalForm] = useState({
    vendor: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    renewalDate: '',
    monthlyCost: '',
    annualCost: '',
    contractPdf: '',
    signedBy: '',
    status: 'active',
    notes: '',
  });

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

          <LocationGroupSummary
            officeCount={officeLocations.length}
            assetCount={marketingAssets.length}
          />

          <BillboardNavigator
            locations={locations}
            selectedLocation={selectedLocation}
            onLocationSelect={onLocationSelect}
          />
        </div>
      </aside>
    );
  }

  const isOffice = isOfficeLocation(selectedLocation);
  const isMediaPlacement = ['dmv_video', 'tv_commercial', 'geofencing'].includes(selectedLocation.type);
  const isAreaOnly = ['tv_commercial', 'geofencing'].includes(selectedLocation.type);

  const visibleTabs = TAB_CONFIG.filter((tab) => {
    if (tab.key === 'campaigns') return isMediaPlacement;
    if (isMediaPlacement && ['contracts', 'history'].includes(tab.key)) return false;
    if (isAreaOnly && ['street', 'nearby'].includes(tab.key)) return false;
    return true;
  });

  return (
    <aside className={styles.detailsCard}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={styles.detailsHeader}>
          <div>
            <h2>
              {selectedLocation.name ||
                selectedLocation.office ||
                'Selected Location'}
            </h2>
            <p>
              {getDisplayGroupLabel(selectedLocation)} •{' '}
              {getDisplayTypeLabel(selectedLocation.type)}
              {selectedLocation.city ? ` • ${selectedLocation.city}` : ''}
            </p>
          </div>

          <span
            style={{
              background: isOffice ? '#dbeafe' : '#dcfce7',
              color: isOffice ? '#1d4ed8' : '#166534',
              border: `1px solid ${isOffice ? '#bfdbfe' : '#bbf7d0'}`,
              borderRadius: 999,
              padding: '5px 9px',
              fontWeight: 950,
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            {isOffice ? 'Office' : (MEDIA_TYPE_META[selectedLocation.type]?.badge || 'Marketing')}
          </span>
        </div>

        {!isOffice && (
          <div className={styles.detailsActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => onEdit?.(selectedLocation)}
            >
              Edit
            </button>

            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => onDelete?.(selectedLocation)}
            >
              Delete
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 7,
            overflowX: 'auto',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                border: 0,
                borderBottom:
                  activeTab === tab.key
                    ? '3px solid #0ea5e9'
                    : '3px solid transparent',
                background: 'transparent',
                color: activeTab === tab.key ? '#0284c7' : '#64748b',
                padding: '9px 8px',
                fontWeight: 950,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: 12,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' &&
          (isOffice ? (
            <OfficeOverview
              office={selectedLocation}
              marketingAssets={marketingAssets}
              onLocationSelect={onLocationSelect}
            />
          ) : (
            <MarketingAssetOverview location={selectedLocation} />
          ))}

        {activeTab === 'campaigns' && isMediaPlacement && (
          <MediaCampaignManager
            location={selectedLocation}
            campaigns={related.mediaCampaigns || []}
            onAddMediaCampaign={onAddMediaCampaign}
            onDeleteMediaCampaign={onDeleteMediaCampaign}
          />
        )}

        {activeTab === 'contracts' &&
          (isOffice ? (
            <OfficeContractsPlaceholder />
          ) : (
            <ContractManagement
              location={selectedLocation}
              contracts={related.contracts || []}
              onAddContract={onAddContract}
              showRenewalForm={showRenewalForm}
              setShowRenewalForm={setShowRenewalForm}
              renewalForm={renewalForm}
              setRenewalForm={setRenewalForm}
              renewalSaving={renewalSaving}
              setRenewalSaving={setRenewalSaving}
              renewalError={renewalError}
              setRenewalError={setRenewalError}
            />
          ))}

        {activeTab === 'history' &&
          (isOffice ? (
            <OfficeContractsPlaceholder />
          ) : (
            <ContractHistory contracts={related.contracts || []} />
          ))}

        {activeTab === 'photos' && (
          <PhotoGallery
            location={selectedLocation}
            onLocationUpdate={onPhotosChange}
          />
        )}

        {activeTab === 'street' && (
          <StreetViewPanel location={selectedLocation} />
        )}

        {activeTab === 'nearby' && (
          <NearbyLocations
            selectedLocation={selectedLocation}
            locations={isOffice ? marketingAssets : officeLocations}
            onLocationSelect={onLocationSelect}
          />
        )}

        {activeTab === 'coverage' && (
          <CoverageAnalysis
            selectedLocation={selectedLocation}
            locations={locations}
            coverageRadiusMiles={coverageRadiusMiles}
          />
        )}

        {activeTab === 'navigator' && (
          <BillboardNavigator
            locations={locations}
            selectedLocation={selectedLocation}
            onLocationSelect={onLocationSelect}
          />
        )}
      </div>
    </aside>
  );
};

const LocationGroupSummary = ({ officeCount, assetCount }) => (
  <div className={styles.detailGrid}>
    <div>
      <span>Office Locations</span>
      <strong>{officeCount}</strong>
    </div>
    <div>
      <span>Marketing Assets</span>
      <strong>{assetCount}</strong>
    </div>
  </div>
);

const OfficeOverview = ({
  office,
  marketingAssets,
  onLocationSelect,
}) => {
  const nearbyAssets = marketingAssets
    .filter(
      (asset) =>
        asset.office === office.office || asset.region === office.region
    )
    .slice(0, 6);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className={styles.detailGrid}>
        <div>
          <span>Office Code</span>
          <strong>{office.office || '—'}</strong>
        </div>
        <div>
          <span>Region</span>
          <strong>{office.region || '—'}</strong>
        </div>
        <div>
          <span>City</span>
          <strong>{office.city || '—'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{office.status || '—'}</strong>
        </div>
        <div className={styles.fullWidth}>
          <span>Address</span>
          <strong>{office.address || office.name || '—'}</strong>
        </div>
      </div>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3>Office Marketing Anchor</h3>
        <p
          style={{
            margin: 0,
            color: '#64748b',
            fontWeight: 750,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          This office should be used as the center point for USPS EDDM routes,
          nearby billboards, field activities, campaign coverage, and future
          call-tracking attribution.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <strong style={{ color: '#0f172a' }}>
          Related Marketing Assets
        </strong>

        {nearbyAssets.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: 12 }}>
            No related marketing assets found for this office yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {nearbyAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onLocationSelect?.(asset)}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  borderRadius: 12,
                  padding: 10,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong
                  style={{
                    display: 'block',
                    color: '#0f172a',
                    fontSize: 12,
                  }}
                >
                  {asset.name || asset.office || 'Marketing Asset'}
                </strong>
                <small style={{ color: '#64748b', fontWeight: 850 }}>
                  {getDisplayTypeLabel(asset.type)} • {asset.city || '—'}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const MarketingAssetOverview = ({ location }) => {
  const mediaMeta = MEDIA_TYPE_META[location.type] || null;

  return (
  <div style={{ display: 'grid', gap: 14 }}>
    {mediaMeta && (
      <div
        style={{
          border: mediaMeta.areaOnly ? '1px solid #ddd6fe' : '1px solid #bae6fd',
          background: mediaMeta.areaOnly ? '#f5f3ff' : '#f0f9ff',
          borderRadius: 12,
          padding: 10,
          display: 'flex',
          gap: 9,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: 20 }}>{mediaMeta.icon}</span>
        <div>
          <strong style={{ display: 'block', color: '#0f172a', fontSize: 12 }}>
            {mediaMeta.label}
          </strong>
          <small style={{ color: '#64748b', fontWeight: 800, lineHeight: 1.45 }}>
            {mediaMeta.areaOnly
              ? 'Area-based advertising. This record is managed from List/Campaigns and does not create a fake map pin.'
              : 'Physical advertising location. This record can be shown on the map when coordinates are available.'}
          </small>
        </div>
      </div>
    )}

    <div className={styles.detailGrid}>
      <div>
        <span>Type</span>
        <strong>{getDisplayTypeLabel(location.type)}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong>{location.status || '—'}</strong>
      </div>
      <div>
        <span>Office</span>
        <strong>{location.office || '—'}</strong>
      </div>
      <div>
        <span>Region</span>
        <strong>{location.region || '—'}</strong>
      </div>
      <div>
        <span>Monthly / Event Cost</span>
        <strong>
          {formatMoney(location.monthlyCost || location.eventCost || 0)}
        </strong>
      </div>
      <div>
        <span>Campaign</span>
        <strong>{location.campaign || '—'}</strong>
      </div>
    </div>

    {location.notes && <p className={styles.notes}>{location.notes}</p>}
  </div>
  );
};


const MEDIA_CAMPAIGN_EMPTY = {
  campaignName: '',
  status: 'active',
  vendor: '',
  startDate: '',
  endDate: '',
  renewalDate: '',
  monthlyCost: '',
  totalCost: '',
  contractUrl: '',
  marketName: '',
  networkName: '',
  spotsPurchased: '',
  areaLabel: '',
  radiusMiles: '',
  notes: '',
  files: [],
};

const MediaCampaignManager = ({
  location,
  campaigns = [],
  onAddMediaCampaign,
  onDeleteMediaCampaign,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(MEDIA_CAMPAIGN_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.campaignName.trim()) {
      setError('Campaign name is required.');
      return;
    }

    setSaving(true);
    try {
      await onAddMediaCampaign?.(location.id, {
        ...form,
        campaignType: location.type,
      });
      setForm(MEDIA_CAMPAIGN_EMPTY);
      setShowForm(false);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save campaign.');
    } finally {
      setSaving(false);
    }
  };

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return String(b.start_date || b.created_at || '').localeCompare(
      String(a.start_date || a.created_at || '')
    );
  });

  const activeCount = campaigns.filter((campaign) => campaign.status === 'active').length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ display: 'block', color: '#0f172a' }}>
            {location.type === 'dmv_video'
              ? 'DMV Video Campaigns'
              : location.type === 'tv_commercial'
                ? 'TV Commercial Campaigns'
                : 'Geofencing Campaigns'}
          </strong>
          <small style={{ color: '#64748b', fontWeight: 800 }}>
            {campaigns.length} total • {activeCount} active
          </small>
        </div>

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? 'Close Form' : '+ Add Campaign'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          style={{
            border: '1px solid #bae6fd',
            background: '#f0f9ff',
            borderRadius: 14,
            padding: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.formGrid}>
            <label className={styles.fullWidth}>
              Campaign Name
              <input
                value={form.campaignName}
                onChange={(event) => update('campaignName', event.target.value)}
                placeholder="Tax Season 2027"
              />
            </label>

            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="renewal">Renewal Soon</option>
                <option value="expired">Expired / Past</option>
              </select>
            </label>

            <label>
              Vendor
              <input
                value={form.vendor}
                onChange={(event) => update('vendor', event.target.value)}
              />
            </label>

            <label>
              Start Date
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => update('startDate', event.target.value)}
              />
            </label>

            <label>
              End Date
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => update('endDate', event.target.value)}
              />
            </label>

            <label>
              Renewal Date
              <input
                type="date"
                value={form.renewalDate}
                onChange={(event) => update('renewalDate', event.target.value)}
              />
            </label>

            <label>
              Monthly Rate
              <input
                type="number"
                step="0.01"
                value={form.monthlyCost}
                onChange={(event) => update('monthlyCost', event.target.value)}
              />
            </label>

            <label>
              Total Contract Cost
              <input
                type="number"
                step="0.01"
                value={form.totalCost}
                onChange={(event) => update('totalCost', event.target.value)}
              />
            </label>

            {location.type === 'tv_commercial' && (
              <>
                <label>
                  TV Market
                  <input
                    value={form.marketName}
                    onChange={(event) => update('marketName', event.target.value)}
                    placeholder="Fresno–Visalia"
                  />
                </label>
                <label>
                  Station / Network
                  <input
                    value={form.networkName}
                    onChange={(event) => update('networkName', event.target.value)}
                    placeholder="Univision / KFSN"
                  />
                </label>
                <label>
                  Spots Purchased
                  <input
                    type="number"
                    value={form.spotsPurchased}
                    onChange={(event) => update('spotsPurchased', event.target.value)}
                  />
                </label>
              </>
            )}

            {location.type === 'geofencing' && (
              <>
                <label>
                  Target Area
                  <input
                    value={form.areaLabel}
                    onChange={(event) => update('areaLabel', event.target.value)}
                    placeholder="2 miles around Turlock DMV"
                  />
                </label>
                <label>
                  Radius (miles)
                  <input
                    type="number"
                    step="0.1"
                    value={form.radiusMiles}
                    onChange={(event) => update('radiusMiles', event.target.value)}
                  />
                </label>
              </>
            )}

            <label className={styles.fullWidth}>
              Contract URL
              <input
                value={form.contractUrl}
                onChange={(event) => update('contractUrl', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className={styles.fullWidth}>
              Videos / Creative Files
              <input
                type="file"
                accept="video/*,image/*"
                multiple
                onChange={(event) => update('files', Array.from(event.target.files || []))}
              />
              <small style={{ color: '#64748b', fontWeight: 750 }}>
                You can attach more than one video to the same campaign.
              </small>
            </label>

            <label className={styles.fullWidth}>
              Notes
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => update('notes', event.target.value)}
              />
            </label>
          </div>

          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? 'Saving Campaign...' : 'Save Campaign'}
          </button>
        </form>
      )}

      {sortedCampaigns.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: 14 }}>
          No campaigns have been added to this location yet.
        </div>
      ) : (
        sortedCampaigns.map((campaign) => (
          <div
            key={campaign.id}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 12,
              background: campaign.status === 'active' ? '#f0fdf4' : '#ffffff',
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <div>
                <strong style={{ display: 'block', color: '#0f172a' }}>
                  {campaign.campaign_name || 'Campaign'}
                </strong>
                <small style={{ color: '#64748b', fontWeight: 800 }}>
                  {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
                </small>
              </div>
              <span
                style={{
                  borderRadius: 999,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 950,
                  background: campaign.status === 'active' ? '#dcfce7' : '#f1f5f9',
                  color: campaign.status === 'active' ? '#166534' : '#475569',
                }}
              >
                {campaign.status || '—'}
              </span>
            </div>

            <div className={styles.detailGrid}>
              <div><span>Vendor</span><strong>{campaign.vendor || '—'}</strong></div>
              <div><span>Monthly Rate</span><strong>{formatMoney(campaign.monthly_cost)}</strong></div>
              <div><span>Total Cost</span><strong>{formatMoney(campaign.total_cost)}</strong></div>
              <div><span>Renewal</span><strong>{formatDate(campaign.renewal_date)}</strong></div>
              {campaign.market_name && <div><span>Market</span><strong>{campaign.market_name}</strong></div>}
              {campaign.network_name && <div><span>Network</span><strong>{campaign.network_name}</strong></div>}
              {campaign.spots_purchased !== null && campaign.spots_purchased !== undefined && (
                <div><span>Spots Purchased</span><strong>{campaign.spots_purchased}</strong></div>
              )}
              {campaign.area_label && <div><span>Target Area</span><strong>{campaign.area_label}</strong></div>}
              {campaign.radius_miles && <div><span>Radius</span><strong>{campaign.radius_miles} mi</strong></div>}
            </div>

            {(campaign.mediaAssets || []).length > 0 && (
              <div style={{ display: 'grid', gap: 9 }}>
                <strong style={{ color: '#0f172a', fontSize: 12 }}>Creative</strong>
                {(campaign.mediaAssets || []).map((asset) => (
                  <div key={asset.id} style={{ display: 'grid', gap: 6 }}>
                    {asset.asset_type === 'video' ? (
                      <video
                        src={asset.file_url}
                        controls
                        preload="metadata"
                        style={{ width: '100%', borderRadius: 12, background: '#0f172a' }}
                      />
                    ) : (
                      <img
                        src={asset.file_url}
                        alt={asset.title || 'Campaign creative'}
                        style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12 }}
                      />
                    )}
                    <small style={{ color: '#64748b', fontWeight: 800 }}>
                      {asset.title || asset.asset_type}
                    </small>
                  </div>
                ))}
              </div>
            )}

            {campaign.contract_url && (
              <a
                href={campaign.contract_url}
                target="_blank"
                rel="noreferrer"
                className={styles.secondaryBtn}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                Open Contract
              </a>
            )}

            {campaign.notes && <p className={styles.notes}>{campaign.notes}</p>}

            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => onDeleteMediaCampaign?.(campaign.id)}
              style={{ width: 'fit-content' }}
            >
              Delete Campaign
            </button>
          </div>
        ))
      )}
    </div>
  );
};


const ContractManagement = ({
  location,
  contracts,
  onAddContract,
  showRenewalForm,
  setShowRenewalForm,
  renewalForm,
  setRenewalForm,
  renewalSaving,
  setRenewalSaving,
  renewalError,
  setRenewalError,
}) => {
  const sortedContracts = [...contracts].sort((a, b) => {
    const aDate = a.start_date || a.created_at || '';
    const bDate = b.start_date || b.created_at || '';
    return String(bDate).localeCompare(String(aDate));
  });

  const currentContract =
    sortedContracts.find((contract) => contract.status === 'active') ||
    sortedContracts[0] ||
    null;

  const updateField = (field, value) => {
    setRenewalForm((prev) => ({ ...prev, [field]: value }));
  };

  const openRenewalForm = () => {
    setRenewalError('');
    setRenewalForm({
      vendor: currentContract?.vendor || location.vendor || '',
      contractNumber: '',
      startDate: currentContract?.end_date || '',
      endDate: '',
      renewalDate: '',
      monthlyCost: currentContract?.monthly_cost ?? location.monthlyCost ?? '',
      annualCost: '',
      contractPdf: '',
      signedBy: '',
      status: 'active',
      notes: 'Renewed contract',
    });
    setShowRenewalForm(true);
  };

  const submitRenewal = async (event) => {
    event.preventDefault();
    setRenewalError('');

    if (!renewalForm.startDate || !renewalForm.endDate) {
      setRenewalError('Start date and end date are required.');
      return;
    }

    if (!renewalForm.monthlyCost && renewalForm.monthlyCost !== 0) {
      setRenewalError('New monthly rate is required.');
      return;
    }

    setRenewalSaving(true);

    try {
      await onAddContract?.(location.id, {
        ...renewalForm,
        status: 'active',
      });

      setShowRenewalForm(false);
    } catch (error) {
      setRenewalError(error?.message || 'Could not save the renewal.');
    } finally {
      setRenewalSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          border: '1px solid #dbeafe',
          background: '#f8fbff',
          borderRadius: 14,
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <strong style={{ color: '#0f172a' }}>Current Contract</strong>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={openRenewalForm}
          >
            + Add Renewal
          </button>
        </div>

        {currentContract ? (
          <div className={styles.detailGrid}>
            <div>
              <span>Vendor</span>
              <strong>{currentContract.vendor || location.vendor || '—'}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{currentContract.status || '—'}</strong>
            </div>
            <div>
              <span>Start</span>
              <strong>{formatDate(currentContract.start_date)}</strong>
            </div>
            <div>
              <span>End</span>
              <strong>{formatDate(currentContract.end_date)}</strong>
            </div>
            <div>
              <span>Contract Length</span>
              <strong>
                {getContractLengthLabel(
                  currentContract.start_date,
                  currentContract.end_date
                )}
              </strong>
            </div>
            <div>
              <span>Monthly Rate</span>
              <strong>{formatMoney(currentContract.monthly_cost)}</strong>
            </div>
            <div>
              <span>Annual Cost</span>
              <strong>{formatMoney(currentContract.annual_cost)}</strong>
            </div>
            <div>
              <span>Renewal Date</span>
              <strong>{formatDate(currentContract.renewal_date)}</strong>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState} style={{ padding: 12 }}>
            No contract has been added for this location yet.
          </div>
        )}

        {currentContract?.contract_pdf && (
          <a
            href={currentContract.contract_pdf}
            target="_blank"
            rel="noreferrer"
            className={styles.contractLink}
          >
            Open Current Contract
          </a>
        )}

        {currentContract?.notes && (
          <p className={styles.notes}>{currentContract.notes}</p>
        )}
      </div>

      {showRenewalForm && (
        <form
          onSubmit={submitRenewal}
          style={{
            border: '1px solid #bae6fd',
            background: '#f0f9ff',
            borderRadius: 14,
            padding: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          <div>
            <strong style={{ color: '#0f172a' }}>Record Contract Renewal</strong>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, fontWeight: 750 }}>
              Enter the new contract period and rate. The old contract will stay in History.
            </p>
          </div>

          {renewalError && (
            <div className={styles.errorBanner} style={{ margin: 0 }}>
              {renewalError}
            </div>
          )}

          <div className={styles.formGrid}>
            <label>
              Vendor
              <input
                value={renewalForm.vendor}
                onChange={(event) => updateField('vendor', event.target.value)}
              />
            </label>

            <label>
              Contract #
              <input
                value={renewalForm.contractNumber}
                onChange={(event) => updateField('contractNumber', event.target.value)}
              />
            </label>

            <label>
              New Start Date
              <input
                type="date"
                value={renewalForm.startDate}
                onChange={(event) => updateField('startDate', event.target.value)}
              />
            </label>

            <label>
              New End Date
              <input
                type="date"
                value={renewalForm.endDate}
                onChange={(event) => updateField('endDate', event.target.value)}
              />
            </label>

            <label>
              Next Renewal Date
              <input
                type="date"
                value={renewalForm.renewalDate}
                onChange={(event) => updateField('renewalDate', event.target.value)}
              />
            </label>

            <label>
              New Monthly Rate
              <input
                type="number"
                step="0.01"
                value={renewalForm.monthlyCost}
                onChange={(event) => updateField('monthlyCost', event.target.value)}
              />
            </label>

            <label>
              Annual Cost
              <input
                type="number"
                step="0.01"
                value={renewalForm.annualCost}
                onChange={(event) => updateField('annualCost', event.target.value)}
              />
            </label>

            <label>
              Signed By
              <input
                value={renewalForm.signedBy}
                onChange={(event) => updateField('signedBy', event.target.value)}
              />
            </label>

            <label className={styles.fullWidth}>
              Contract PDF URL
              <input
                value={renewalForm.contractPdf}
                onChange={(event) => updateField('contractPdf', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className={styles.fullWidth}>
              Renewal Notes
              <textarea
                rows={3}
                value={renewalForm.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Renewed for 12 months at $1,450/month..."
              />
            </label>
          </div>

          <div className={styles.detailsActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setShowRenewalForm(false)}
              disabled={renewalSaving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={renewalSaving}
            >
              {renewalSaving ? 'Saving Renewal...' : 'Save Renewal'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const ContractHistory = ({ contracts }) => {
  const sortedContracts = [...contracts].sort((a, b) => {
    const aDate = a.start_date || a.created_at || '';
    const bDate = b.start_date || b.created_at || '';
    return String(bDate).localeCompare(String(aDate));
  });

  if (sortedContracts.length === 0) {
    return (
      <div className={styles.emptyState} style={{ padding: 14 }}>
        No contract history yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <strong style={{ color: '#0f172a' }}>Contract History</strong>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, fontWeight: 750 }}>
          Past contracts stay here when a renewal is added.
        </p>
      </div>

      {sortedContracts.map((contract, index) => (
        <div
          key={contract.id}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 11,
            background: contract.status === 'active' ? '#f0fdf4' : '#ffffff',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong>
              {contract.status === 'active' ? 'Current Contract' : `Previous Contract ${sortedContracts.length - index}`}
            </strong>
            <span
              style={{
                borderRadius: 999,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 950,
                background: contract.status === 'active' ? '#dcfce7' : '#f1f5f9',
                color: contract.status === 'active' ? '#166534' : '#475569',
              }}
            >
              {contract.status || '—'}
            </span>
          </div>

          <div className={styles.detailGrid}>
            <div>
              <span>Start</span>
              <strong>{formatDate(contract.start_date)}</strong>
            </div>
            <div>
              <span>End</span>
              <strong>{formatDate(contract.end_date)}</strong>
            </div>
            <div>
              <span>Length</span>
              <strong>{getContractLengthLabel(contract.start_date, contract.end_date)}</strong>
            </div>
            <div>
              <span>Monthly Rate</span>
              <strong>{formatMoney(contract.monthly_cost)}</strong>
            </div>
            <div>
              <span>Annual Cost</span>
              <strong>{formatMoney(contract.annual_cost)}</strong>
            </div>
            <div>
              <span>Vendor</span>
              <strong>{contract.vendor || '—'}</strong>
            </div>
          </div>

          {contract.notes && <p className={styles.notes}>{contract.notes}</p>}

          {contract.contract_pdf && (
            <a
              href={contract.contract_pdf}
              target="_blank"
              rel="noreferrer"
              className={styles.contractLink}
            >
              Open Contract
            </a>
          )}
        </div>
      ))}
    </div>
  );
};

const OfficeContractsPlaceholder = () => (
  <div style={{ display: 'grid', gap: 10 }}>
    <div className={styles.emptyState} style={{ padding: 14 }}>
      Office records do not use billboard/event contracts. Use this section later
      for lease, office photos, inspections, or branch documents.
    </div>
  </div>
);

export default MarketingSidebar;