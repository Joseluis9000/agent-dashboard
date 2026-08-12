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
  onUpdateMediaCampaign,
  onDeleteMediaCampaign,
  vendorOptions = [],
  coverageRadiusMiles = 25,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [showRenewalForm, setShowRenewalForm] = useState(false);
  const [renewalSaving, setRenewalSaving] = useState(false);
  const [renewalError, setRenewalError] = useState('');
  const [contractFormMode, setContractFormMode] = useState('renewal');
  const [renewalForm, setRenewalForm] = useState({
    vendor: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    renewalDate: '',
    monthlyCost: '',
    annualCost: '',
    contractPdf: '',
    contractFile: null,
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
            <MarketingAssetOverview
              location={selectedLocation}
              photos={related.photos || []}
              campaigns={related.mediaCampaigns || []}
            />
          ))}

        {activeTab === 'campaigns' && isMediaPlacement && (
          <MediaCampaignManager
            location={selectedLocation}
            campaigns={related.mediaCampaigns || []}
            onAddMediaCampaign={onAddMediaCampaign}
            onUpdateMediaCampaign={onUpdateMediaCampaign}
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
              contractFormMode={contractFormMode}
              setContractFormMode={setContractFormMode}
              vendorOptions={vendorOptions}
            />
          ))}

        {activeTab === 'history' &&
          (isOffice ? (
            <OfficeContractsPlaceholder />
          ) : (
            <ContractHistory location={selectedLocation} contracts={related.contracts || []} />
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

        {!isOffice && (
          <section
            style={{
              marginTop: 8,
              paddingTop: 14,
              borderTop: '1px solid #e2e8f0',
              display: 'grid',
              gap: 8,
            }}
          >
            <small
              style={{
                color: '#94a3b8',
                fontWeight: 900,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Location Actions
            </small>

            <div className={styles.detailsActions} style={{ margin: 0 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => onEdit?.(selectedLocation)}
              >
                Edit Location
              </button>

              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => onDelete?.(selectedLocation)}
              >
                Delete Location
              </button>
            </div>
          </section>
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

const MarketingAssetOverview = ({ location, photos = [], campaigns = [] }) => {
  const mediaMeta = MEDIA_TYPE_META[location.type] || null;
  const primaryPhoto =
    photos.find((photo) => photo.isPrimary || photo.is_primary) || null;
  const primaryPhotoUrl =
    primaryPhoto?.photoUrl || primaryPhoto?.photo_url || primaryPhoto?.url || '';

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;

    return String(b.start_date || b.created_at || '').localeCompare(
      String(a.start_date || a.created_at || '')
    );
  });

  const primaryCampaign = sortedCampaigns[0] || null;

  const primaryCampaignVideo =
    location.type === 'dmv_video'
      ? (primaryCampaign?.mediaAssets || []).find(
          (asset) => asset.asset_type === 'video' && asset.file_url
        ) || null
      : null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          height: 210,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {primaryCampaignVideo ? (
          <video
            src={primaryCampaignVideo.file_url}
            controls
            preload="metadata"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              background: '#0f172a',
            }}
          />
        ) : primaryPhotoUrl ? (
          <img
            src={primaryPhotoUrl}
            alt={`${location.name || 'Marketing location'} primary`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              color: '#94a3b8',
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            {location.type === 'dmv_video'
              ? 'No campaign video uploaded.'
              : 'No primary photo uploaded.'}
          </div>
        )}
      </div>

      {mediaMeta && (
        <div style={{ border: mediaMeta.areaOnly ? '1px solid #ddd6fe' : '1px solid #bae6fd', background: mediaMeta.areaOnly ? '#f5f3ff' : '#f0f9ff', borderRadius: 12, padding: 10, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20 }}>{mediaMeta.icon}</span>
          <div>
            <strong style={{ display: 'block', color: '#0f172a', fontSize: 12 }}>{mediaMeta.label}</strong>
            <small style={{ color: '#64748b', fontWeight: 800, lineHeight: 1.45 }}>
              {mediaMeta.areaOnly
                ? 'Area-based advertising. This record is managed from List/Campaigns and does not create a fake map pin.'
                : 'Physical advertising location. This record can be shown on the map when coordinates are available.'}
            </small>
          </div>
        </div>
      )}

      <div className={styles.detailGrid}>
        <div><span>Type</span><strong>{getDisplayTypeLabel(location.type)}</strong></div>
        <div><span>Status</span><strong>{location.status || '—'}</strong></div>
        <div><span>Office</span><strong>{location.office || '—'}</strong></div>
        <div><span>Region</span><strong>{location.region || '—'}</strong></div>
        <div><span>Vendor</span><strong>{location.vendor || '—'}</strong></div>
        <div><span>Monthly Cost</span><strong>{formatMoney(location.monthlyCost || location.eventCost || 0)}</strong></div>
        <div><span>Contract Start</span><strong>{formatDate(location.contractStart)}</strong></div>
        <div><span>Contract End</span><strong>{formatDate(location.contractEnd)}</strong></div>
        <div><span>Renewal Date</span><strong>{formatDate(location.renewalDate)}</strong></div>
        <div><span>Traffic / Impressions</span><strong>{location.traffic || '—'}</strong></div>
        <div>
  <span>Billboard Size</span>
  <strong>
    {location.billboardWidth && location.billboardHeight
      ? `${location.billboardWidth} ${location.billboardSizeUnit || 'ft'} × ${location.billboardHeight} ${location.billboardSizeUnit || 'ft'}`
      : '—'}
  </strong>
</div>
        <div><span>Placement Type</span><strong>{location.placementType || '—'}</strong></div>
        <div>
  <span>Coordinates</span>
  <strong>
    {Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng))
      ? `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
      : '—'}
  </strong>
</div>
        <div className={styles.fullWidth}><span>Campaign</span><strong>{location.campaign || '—'}</strong></div>
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
  onUpdateMediaCampaign,
  onDeleteMediaCampaign,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [form, setForm] = useState(MEDIA_CAMPAIGN_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(MEDIA_CAMPAIGN_EMPTY);
    setEditingCampaignId(null);
    setShowForm(false);
    setError('');
  };

  const openAddForm = () => {
    setEditingCampaignId(null);
    setForm(MEDIA_CAMPAIGN_EMPTY);
    setError('');
    setShowForm(true);
  };

  const openEditForm = (campaign) => {
    setEditingCampaignId(campaign.id);
    setForm({
      campaignName: campaign.campaign_name || '',
      status: campaign.status || 'active',
      vendor: campaign.vendor || '',
      startDate: campaign.start_date || '',
      endDate: campaign.end_date || '',
      renewalDate: campaign.renewal_date || '',
      monthlyCost:
        campaign.monthly_cost === null || campaign.monthly_cost === undefined
          ? ''
          : campaign.monthly_cost,
      totalCost:
        campaign.total_cost === null || campaign.total_cost === undefined
          ? ''
          : campaign.total_cost,
      contractUrl: campaign.contract_url || '',
      marketName: campaign.market_name || '',
      networkName: campaign.network_name || '',
      spotsPurchased:
        campaign.spots_purchased === null || campaign.spots_purchased === undefined
          ? ''
          : campaign.spots_purchased,
      areaLabel: campaign.area_label || '',
      radiusMiles:
        campaign.radius_miles === null || campaign.radius_miles === undefined
          ? ''
          : campaign.radius_miles,
      notes: campaign.notes || '',
      files: [],
    });
    setError('');
    setShowForm(true);
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
      const payload = {
        ...form,
        campaignType: location.type,
      };

      if (editingCampaignId) {
        await onUpdateMediaCampaign?.(location.id, editingCampaignId, payload);
      } else {
        await onAddMediaCampaign?.(location.id, payload);
      }

      resetForm();
    } catch (saveError) {
      setError(
        saveError?.message ||
          (editingCampaignId
            ? 'Could not update campaign.'
            : 'Could not save campaign.')
      );
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

  const activeCount = campaigns.filter(
    (campaign) => campaign.status === 'active'
  ).length;

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
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              openAddForm();
            }
          }}
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
          <div>
            <strong style={{ display: 'block', color: '#0f172a' }}>
              {editingCampaignId ? 'Edit Campaign' : 'Add Campaign'}
            </strong>

            {editingCampaignId && (
              <small style={{ color: '#64748b', fontWeight: 750 }}>
                Existing creative stays attached. New files selected below will be added to the campaign.
              </small>
            )}
          </div>

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
                    onChange={(event) =>
                      update('spotsPurchased', event.target.value)
                    }
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
              {editingCampaignId
                ? 'Add Videos / Creative Files'
                : 'Videos / Creative Files'}
              <input
                type="file"
                accept="video/*,image/*"
                multiple
                onChange={(event) =>
                  update('files', Array.from(event.target.files || []))
                }
              />
              <small style={{ color: '#64748b', fontWeight: 750 }}>
                {editingCampaignId
                  ? 'Optional. Any files selected here are added to the existing campaign.'
                  : 'You can attach more than one video or creative file to the same campaign.'}
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

          <div className={styles.detailsActions}>
            {editingCampaignId && (
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={saving}
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            )}

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={saving}
            >
              {saving
                ? editingCampaignId
                  ? 'Saving Changes...'
                  : 'Saving Campaign...'
                : editingCampaignId
                  ? 'Save Changes'
                  : 'Save Campaign'}
            </button>
          </div>
        </form>
      )}

      {sortedCampaigns.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: 14 }}>
          No campaigns have been added to this location yet.
        </div>
      ) : (
        sortedCampaigns.map((campaign) => {
          const mediaAssets = campaign.mediaAssets || [];
          const videoCount = mediaAssets.filter(
            (asset) => asset.asset_type === 'video'
          ).length;
          const imageCount = mediaAssets.filter(
            (asset) => asset.asset_type !== 'video'
          ).length;

          return (
            <div
              key={campaign.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 12,
                background:
                  campaign.status === 'active' ? '#f0fdf4' : '#ffffff',
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
                  <strong
                    style={{
                      display: 'block',
                      color: '#0f172a',
                    }}
                  >
                    {campaign.campaign_name || 'Campaign'}
                  </strong>

                  <small style={{ color: '#64748b', fontWeight: 800 }}>
                    {formatDate(campaign.start_date)} –{' '}
                    {formatDate(campaign.end_date)}
                  </small>
                </div>

                <span
                  style={{
                    borderRadius: 999,
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 950,
                    background:
                      campaign.status === 'active' ? '#dcfce7' : '#f1f5f9',
                    color:
                      campaign.status === 'active' ? '#166534' : '#475569',
                  }}
                >
                  {campaign.status || '—'}
                </span>
              </div>

              <div className={styles.detailGrid}>
                <div>
                  <span>Vendor</span>
                  <strong>{campaign.vendor || '—'}</strong>
                </div>

                <div>
                  <span>Monthly Rate</span>
                  <strong>{formatMoney(campaign.monthly_cost)}</strong>
                </div>

                <div>
                  <span>Total Cost</span>
                  <strong>{formatMoney(campaign.total_cost)}</strong>
                </div>

                <div>
                  <span>Start Date</span>
                  <strong>{formatDate(campaign.start_date)}</strong>
                </div>

                <div>
                  <span>End Date</span>
                  <strong>{formatDate(campaign.end_date)}</strong>
                </div>

                <div>
                  <span>Renewal Date</span>
                  <strong>{formatDate(campaign.renewal_date)}</strong>
                </div>

                <div>
                  <span>Creative Files</span>
                  <strong>{mediaAssets.length}</strong>
                </div>

                <div>
                  <span>Videos / Images</span>
                  <strong>
                    {videoCount} video{videoCount === 1 ? '' : 's'}
                    {' • '}
                    {imageCount} image{imageCount === 1 ? '' : 's'}
                  </strong>
                </div>

                {campaign.market_name && (
                  <div>
                    <span>Market</span>
                    <strong>{campaign.market_name}</strong>
                  </div>
                )}

                {campaign.network_name && (
                  <div>
                    <span>Network</span>
                    <strong>{campaign.network_name}</strong>
                  </div>
                )}

                {campaign.spots_purchased !== null &&
                  campaign.spots_purchased !== undefined && (
                    <div>
                      <span>Spots Purchased</span>
                      <strong>{campaign.spots_purchased}</strong>
                    </div>
                  )}

                {campaign.area_label && (
                  <div>
                    <span>Target Area</span>
                    <strong>{campaign.area_label}</strong>
                  </div>
                )}

                {campaign.radius_miles !== null &&
                  campaign.radius_miles !== undefined &&
                  campaign.radius_miles !== '' && (
                    <div>
                      <span>Radius</span>
                      <strong>{campaign.radius_miles} mi</strong>
                    </div>
                  )}

                <div className={styles.fullWidth}>
                  <span>Campaign Type</span>
                  <strong>
                    {getDisplayTypeLabel(
                      campaign.campaign_type || location.type
                    )}
                  </strong>
                </div>
              </div>

              {mediaAssets.length > 0 && (
                <div style={{ display: 'grid', gap: 9 }}>
                  <strong style={{ color: '#0f172a', fontSize: 12 }}>
                    Creative
                  </strong>

                  {mediaAssets.map((asset) => (
                    <div
                      key={asset.id}
                      style={{ display: 'grid', gap: 6 }}
                    >
                      {asset.asset_type === 'video' ? (
                        <video
                          src={asset.file_url}
                          controls
                          preload="metadata"
                          style={{
                            width: '100%',
                            borderRadius: 12,
                            background: '#0f172a',
                          }}
                        />
                      ) : (
                        <img
                          src={asset.file_url}
                          alt={asset.title || 'Campaign creative'}
                          style={{
                            width: '100%',
                            maxHeight: 260,
                            objectFit: 'contain',
                            borderRadius: 12,
                          }}
                        />
                      )}

                      <small
                        style={{
                          color: '#64748b',
                          fontWeight: 800,
                        }}
                      >
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
                  style={{
                    textDecoration: 'none',
                    width: 'fit-content',
                  }}
                >
                  Open Contract
                </a>
              )}

              {campaign.notes ? (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      color: '#64748b',
                      fontWeight: 900,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      marginBottom: 5,
                    }}
                  >
                    Notes
                  </span>
                  <p className={styles.notes} style={{ margin: 0 }}>
                    {campaign.notes}
                  </p>
                </div>
              ) : null}

              <div
                className={styles.detailsActions}
                style={{ justifyContent: 'flex-start' }}
              >
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => openEditForm(campaign)}
                >
                  Edit Campaign
                </button>

                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => onDeleteMediaCampaign?.(campaign.id)}
                >
                  Delete Campaign
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

const buildOriginalLocationContract = (location) => {
  if (!location) return null;

  const hasContractData =
    !!location.contractStart ||
    !!location.contractEnd ||
    !!location.renewalDate ||
    !!location.vendor ||
    !!location.contractUrl ||
    Number(location.monthlyCost || 0) > 0;

  if (!hasContractData) return null;

  return {
    id: `location-original:${location.id}`,
    isLocationOriginal: true,
    vendor: location.vendor || null,
    contract_number: null,
    start_date: location.contractStart || null,
    end_date: location.contractEnd || null,
    renewal_date: location.renewalDate || null,
    monthly_cost: Number(location.monthlyCost || 0),
    annual_cost: Number(location.monthlyCost || 0) * 12,
    contract_pdf: location.contractUrl || null,
    signed_by: null,
    status: 'active',
    notes: 'Original contract entered with the marketing location.',
    created_at: location.createdAt || null,
  };
};

const contractsMatch = (left, right) => {
  if (!left || !right) return false;

  const normalize = (value) => String(value || '').trim().toLowerCase();
  const money = (value) => Number(value || 0).toFixed(2);

  return (
    normalize(left.vendor) === normalize(right.vendor) &&
    normalize(left.start_date) === normalize(right.start_date) &&
    normalize(left.end_date) === normalize(right.end_date) &&
    money(left.monthly_cost) === money(right.monthly_cost)
  );
};

const getContractsWithOriginal = (location, contracts = []) => {
  const originalContract = buildOriginalLocationContract(location);
  const nextContracts = [...contracts];

  if (
    originalContract &&
    !nextContracts.some((contract) => contractsMatch(contract, originalContract))
  ) {
    nextContracts.push(originalContract);
  }

  return nextContracts;
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
  contractFormMode,
  setContractFormMode,
  vendorOptions = [],
}) => {
  const originalContract = buildOriginalLocationContract(location);
  const sortedContracts = [...contracts].sort((a, b) => {
    const aDate = a.start_date || a.created_at || '';
    const bDate = b.start_date || b.created_at || '';
    return String(bDate).localeCompare(String(aDate));
  });

  const activeDatabaseContract =
    sortedContracts.find((contract) => contract.status === 'active') || null;

  const currentContract =
    activeDatabaseContract ||
    originalContract ||
    sortedContracts[0] ||
    null;

  const updateField = (field, value) => {
    setRenewalForm((prev) => ({ ...prev, [field]: value }));
  };

  const openRenewalForm = () => {
    setContractFormMode('renewal');
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
      contractFile: null,
      signedBy: '',
      status: 'active',
      notes: 'Renewed contract',
    });
    setShowRenewalForm(true);
  };

  const openPreviousContractForm = () => {
    setContractFormMode('previous');
    setRenewalError('');
    setRenewalForm({
      vendor: location.vendor || '',
      contractNumber: '',
      startDate: '',
      endDate: location.contractStart || '',
      renewalDate: '',
      monthlyCost: '',
      annualCost: '',
      contractPdf: '',
      contractFile: null,
      signedBy: '',
      status: 'expired',
      notes: 'Previous contract',
    });
    setShowRenewalForm(true);
  };

  const submitContract = async (event) => {
    event.preventDefault();
    setRenewalError('');

    if (!renewalForm.startDate || !renewalForm.endDate) {
      setRenewalError('Start date and end date are required.');
      return;
    }

    if (!renewalForm.monthlyCost && renewalForm.monthlyCost !== 0) {
      setRenewalError('Monthly rate is required.');
      return;
    }

    setRenewalSaving(true);

    try {
      await onAddContract?.(location.id, {
        ...renewalForm,
        status: contractFormMode === 'previous' ? 'expired' : 'active',
      });

      setShowRenewalForm(false);
    } catch (error) {
      setRenewalError(
        error?.message ||
          (contractFormMode === 'previous'
            ? 'Could not save the previous contract.'
            : 'Could not save the renewal.')
      );
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ color: '#0f172a' }}>Current Contract</strong>
          <div className={styles.detailsActions} style={{ margin: 0 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={openPreviousContractForm}
            >
              + Add Previous Contract
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={openRenewalForm}
            >
              + Add Renewal
            </button>
          </div>
        </div>

        {currentContract ? (
          <div className={styles.detailGrid}>
            <div>
              <span>Vendor</span>
              <strong>{currentContract.vendor || location.vendor || '—'}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{currentContract.status || 'active'}</strong>
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
            No contract information has been entered for this location yet.
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
      </div>

      {showRenewalForm && (
        <form
          onSubmit={submitContract}
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
            <strong style={{ color: '#0f172a' }}>
              {contractFormMode === 'previous'
                ? 'Add Previous Contract'
                : 'Record Contract Renewal'}
            </strong>
            <p
              style={{
                margin: '4px 0 0',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 750,
              }}
            >
              {contractFormMode === 'previous'
                ? 'Add an older contract for this location. It will be saved to History and will not replace the current contract.'
                : 'Enter the new contract period and rate. The current contract will stay in History.'}
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
              <select
                value={renewalForm.vendor}
                onChange={(event) => updateField('vendor', event.target.value)}
              >
                <option value="">Select vendor</option>
                {renewalForm.vendor && !vendorOptions.includes(renewalForm.vendor) && (
                  <option value={renewalForm.vendor}>{renewalForm.vendor}</option>
                )}
                {vendorOptions.map((vendor) => (
                  <option key={vendor} value={vendor}>{vendor}</option>
                ))}
              </select>
            </label>

            <label>
              Contract #
              <input
                value={renewalForm.contractNumber}
                onChange={(event) => updateField('contractNumber', event.target.value)}
              />
            </label>

            <label>
              {contractFormMode === 'previous' ? 'Start Date' : 'New Start Date'}
              <input
                type="date"
                value={renewalForm.startDate}
                onChange={(event) => updateField('startDate', event.target.value)}
              />
            </label>

            <label>
              {contractFormMode === 'previous' ? 'End Date' : 'New End Date'}
              <input
                type="date"
                value={renewalForm.endDate}
                onChange={(event) => updateField('endDate', event.target.value)}
              />
            </label>

            <label>
              Renewal Date
              <input
                type="date"
                value={renewalForm.renewalDate}
                onChange={(event) => updateField('renewalDate', event.target.value)}
              />
            </label>

            <label>
              Monthly Rate
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
              Upload Contract PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  updateField('contractFile', event.target.files?.[0] || null)
                }
              />
              {renewalForm.contractFile && (
                <small style={{ color: '#0369a1', fontWeight: 850 }}>
                  Selected: {renewalForm.contractFile.name}
                </small>
              )}
              <small style={{ color: '#64748b', fontWeight: 750 }}>
                PDF only. The file will be stored with this contract automatically.
              </small>
            </label>

            <label className={styles.fullWidth}>
              Notes
              <textarea
                rows={3}
                value={renewalForm.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder={
                  contractFormMode === 'previous'
                    ? 'Previous contract details...'
                    : 'Renewed for 12 months at $1,450/month...'
                }
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
              {renewalSaving
                ? 'Saving Contract...'
                : contractFormMode === 'previous'
                  ? 'Save Previous Contract'
                  : 'Save Renewal'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const ContractHistory = ({ location, contracts }) => {
  const sortedContracts = getContractsWithOriginal(location, contracts).sort((a, b) => {
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
          Original contracts, previous contracts, and renewals are kept here.
        </p>
      </div>

      {sortedContracts.map((contract, index) => {
        const isCurrent = contract.status === 'active';
        const title = isCurrent
          ? contract.isLocationOriginal
            ? 'Original / Current Contract'
            : 'Current Contract'
          : contract.isLocationOriginal
            ? 'Original Contract'
            : `Previous Contract ${sortedContracts.length - index}`;

        return (
          <div
            key={contract.id}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 11,
              background: isCurrent ? '#f0fdf4' : '#ffffff',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{title}</strong>
              <span
                style={{
                  borderRadius: 999,
                  padding: '3px 8px',
                  fontSize: 10,
                  fontWeight: 950,
                  background: isCurrent ? '#dcfce7' : '#f1f5f9',
                  color: isCurrent ? '#166534' : '#475569',
                }}
              >
                {isCurrent ? 'active' : contract.status || 'expired'}
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
        );
      })}
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