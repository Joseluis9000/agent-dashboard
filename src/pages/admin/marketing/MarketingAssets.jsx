// src/pages/admin/marketing/MarketingAssets.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import styles from '../MarketingOps.module.css';
import { getMarketingPhotosByLocations } from './services/photoService';

const ASSET_BUCKET = 'marketing-assets';

const ASSET_TYPES = [
  { value: 'billboard_artwork', label: 'Billboard Artwork', icon: '🪧' },
  { value: 'dmv_video', label: 'DMV Video', icon: '📺' },
  { value: 'tv_commercial', label: 'TV Commercial', icon: '🎬' },
  { value: 'geofencing_creative', label: 'Geofencing Creative', icon: '🎯' },
  { value: 'mailer', label: 'Mailer', icon: '✉️' },
  { value: 'flyer', label: 'Flyer', icon: '📄' },
  { value: 'business_card', label: 'Business Card', icon: '💳' },
  { value: 'event_artwork', label: 'Event Artwork', icon: '🎪' },
  { value: 'sponsorship_artwork', label: 'Sponsorship Artwork', icon: '🤝' },
  { value: 'photo', label: 'Photo', icon: '📷' },
  { value: 'proof', label: 'Proof', icon: '✅' },
  { value: 'contract', label: 'Contract', icon: '📑' },
  { value: 'invoice', label: 'Invoice', icon: '🧾' },
  { value: 'brand_file', label: 'Brand File', icon: '🎨' },
  { value: 'other', label: 'Other', icon: '📎' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY_FORM = {
  title: '',
  assetType: 'billboard_artwork',
  description: '',
  status: 'active',
  locationId: '',
  officeId: '',
  campaignId: '',
  regionId: '',
  vendorId: '',
  activityTypeId: '',
  fileUrl: '',
  thumbnailUrl: '',
  tags: '',
  notes: '',
  isFavorite: false,
  file: null,
};

const inputStyle = {
  width: '100%',
  minHeight: 40,
  padding: '9px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#ffffff',
  color: '#0f172a',
  fontWeight: 750,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'grid',
  gap: 5,
  color: '#334155',
  fontWeight: 850,
  fontSize: 12,
};

const twoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

const getTypeMeta = (value) =>
  ASSET_TYPES.find((item) => item.value === value) || {
    value: value || 'other',
    label: (value || 'Other').replaceAll('_', ' '),
    icon: '📎',
  };

const getStatusMeta = (status) => {
  const meta = {
    active: { label: 'Active', background: '#dcfce7', color: '#166534' },
    draft: { label: 'Draft', background: '#f1f5f9', color: '#475569' },
    approved: { label: 'Approved', background: '#dbeafe', color: '#1d4ed8' },
    archived: { label: 'Archived', background: '#fef3c7', color: '#92400e' },
  };

  return meta[status] || meta.active;
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const safeFileName = (value = 'asset') =>
  String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const parseTags = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isImageAsset = (asset) => {
  const mime = String(asset?.mime_type || '').toLowerCase();
  const url = String(asset?.file_url || '').toLowerCase();

  return (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)
  );
};

const isVideoAsset = (asset) => {
  const mime = String(asset?.mime_type || '').toLowerCase();
  const url = String(asset?.file_url || '').toLowerCase();

  return (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
  );
};

const isPdfAsset = (asset) => {
  const mime = String(asset?.mime_type || '').toLowerCase();
  const url = String(asset?.file_url || '').toLowerCase();

  return mime === 'application/pdf' || /\.pdf(\?|$)/i.test(url);
};

const optionLabel = (row, fields) => {
  for (const field of fields) {
    if (row?.[field]) return row[field];
  }
  return row?.id || 'Unknown';
};

const resolveAssetName = (asset) =>
  asset?.title || asset?.file_name || 'Marketing Asset';

const ModalShell = ({ title, subtitle, onClose, children, wide = false }) => (
  <div
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 3000,
      background: 'rgba(15,23,42,0.55)',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      overflowY: 'auto',
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      style={{
        width: 'min(100%, 980px)',
        maxWidth: wide ? 980 : 680,
        maxHeight: '92vh',
        overflowY: 'auto',
        background: '#ffffff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
      }}
    >
      <div
        style={{
          padding: 16,
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: '#ffffff',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
          {subtitle && (
            <p style={{ margin: '5px 0 0', color: '#64748b', fontWeight: 700, fontSize: 12 }}>
              {subtitle}
            </p>
          )}
        </div>

        <button type="button" className={styles.secondaryBtn} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={{ padding: 16 }}>{children}</div>
    </div>
  </div>
);

const MetricCard = ({ label, value, note }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </div>
);

const StatusPill = ({ status }) => {
  const meta = getStatusMeta(status);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 950,
        background: meta.background,
        color: meta.color,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
};

const AssetPreview = ({ asset, height = 180 }) => {
  const previewUrl = asset?.thumbnail_url || asset?.file_url || '';

  if (!previewUrl) {
    const meta = getTypeMeta(asset?.asset_type);

    return (
      <div
        style={{
          height,
          display: 'grid',
          placeItems: 'center',
          background: '#f8fafc',
          borderRadius: 12,
          color: '#64748b',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>{meta.icon}</div>
          <strong style={{ display: 'block', marginTop: 6 }}>{meta.label}</strong>
        </div>
      </div>
    );
  }

  if (isImageAsset(asset)) {
    return (
      <img
        src={previewUrl}
        alt={resolveAssetName(asset)}
        loading="lazy"
        style={{
          width: '100%',
          height,
          objectFit: 'contain',
          display: 'block',
          background: '#f8fafc',
          borderRadius: 12,
        }}
      />
    );
  }

  if (isVideoAsset(asset)) {
    return (
      <video
        src={asset.file_url}
        controls
        preload="metadata"
        style={{
          width: '100%',
          height,
          objectFit: 'contain',
          display: 'block',
          background: '#0f172a',
          borderRadius: 12,
        }}
      />
    );
  }

  if (isPdfAsset(asset)) {
    return (
      <div
        style={{
          height,
          display: 'grid',
          placeItems: 'center',
          background: '#fff7ed',
          borderRadius: 12,
          color: '#9a3412',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 46 }}>📄</div>
          <strong>PDF Document</strong>
        </div>
      </div>
    );
  }

  const meta = getTypeMeta(asset?.asset_type);

  return (
    <div
      style={{
        height,
        display: 'grid',
        placeItems: 'center',
        background: '#f8fafc',
        borderRadius: 12,
        color: '#64748b',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>{meta.icon}</div>
        <strong>{asset?.file_name || meta.label}</strong>
      </div>
    </div>
  );
};


const getTodayKey = () => new Date().toISOString().split('T')[0];

const isDateExpired = (value) => {
  if (!value) return false;
  return String(value).slice(0, 10) < getTodayKey();
};

const isDateCurrentOrFuture = (value) => {
  if (!value) return true;
  return String(value).slice(0, 10) >= getTodayKey();
};

const formatPlacementType = (type) => {
  if (type === 'billboard') return 'Billboard';
  if (type === 'dmv_video') return 'DMV Video';
  return String(type || 'Placement').replaceAll('_', ' ');
};

const getPrimaryPhotoUrl = (photos = [], location = {}) => {
  const primary = photos.find((photo) => photo.isPrimary || photo.is_primary) || null;
  return (
    primary?.photoUrl ||
    primary?.photo_url ||
    primary?.url ||
    location.photo_url ||
    location.graphic_url ||
    ''
  );
};

const PlacementPreview = ({ placement, height = 190 }) => {
  const preview = placement.previewAsset || null;

  if (preview?.asset_type === 'video' && preview.file_url) {
    return (
      <video
        src={preview.file_url}
        controls
        preload="metadata"
        style={{
          width: '100%',
          height,
          objectFit: 'contain',
          display: 'block',
          background: '#0f172a',
          borderRadius: 12,
        }}
      />
    );
  }

  const imageUrl = preview?.file_url || placement.previewUrl || '';

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={placement.name || 'Marketing placement creative'}
        loading="lazy"
        style={{
          width: '100%',
          height,
          objectFit: 'contain',
          display: 'block',
          background: '#f8fafc',
          borderRadius: 12,
        }}
      />
    );
  }

  return (
    <div
      style={{
        height,
        display: 'grid',
        placeItems: 'center',
        background: '#f8fafc',
        borderRadius: 12,
        border: '1px dashed #cbd5e1',
        color: '#94a3b8',
        textAlign: 'center',
        padding: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 34 }}>{placement.type === 'dmv_video' ? '📺' : '🪧'}</div>
        <strong style={{ display: 'block', marginTop: 6 }}>
          {placement.type === 'dmv_video'
            ? 'No campaign video uploaded'
            : 'No primary billboard photo uploaded'}
        </strong>
      </div>
    </div>
  );
};

const PlacementCard = ({ placement }) => {
  const isDmv = placement.type === 'dmv_video';

  return (
    <div
      className={styles.card}
      style={{
        padding: 12,
        display: 'grid',
        gap: 10,
        minWidth: 0,
      }}
    >
      <PlacementPreview placement={placement} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong
            style={{
              display: 'block',
              color: '#0f172a',
              fontSize: 14,
              overflowWrap: 'anywhere',
            }}
          >
            {placement.name}
          </strong>
          <small style={{ color: '#64748b', fontWeight: 800 }}>
            {isDmv ? '📺 DMV Video Campaign' : '🪧 Billboard Placement'}
          </small>
        </div>

        <span
          style={{
            borderRadius: 999,
            padding: '4px 8px',
            background: placement.isActive ? '#dcfce7' : '#f1f5f9',
            color: placement.isActive ? '#166534' : '#475569',
            fontSize: 10,
            fontWeight: 950,
            whiteSpace: 'nowrap',
          }}
        >
          {placement.isActive ? 'Live' : 'Past'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 7,
        }}
      >
        <DetailItem label="Vendor" value={placement.vendor || '—'} />
        <DetailItem label="Region" value={placement.region || '—'} />
        <DetailItem label={isDmv ? 'Campaign Start' : 'Contract Start'} value={formatDate(placement.startDate)} />
        <DetailItem label={isDmv ? 'Campaign End' : 'Contract End'} value={formatDate(placement.endDate)} />
        <DetailItem label="Renewal" value={formatDate(placement.renewalDate)} />
        <DetailItem label="Monthly Cost" value={`$${Number(placement.monthlyCost || 0).toLocaleString()}`} />
      </div>

      {!isDmv && placement.billboardSize && (
        <small style={{ color: '#64748b', fontWeight: 800 }}>
          Size: {placement.billboardSize}
          {placement.placementType ? ` • ${placement.placementType}` : ''}
        </small>
      )}

      {isDmv && (
        <small style={{ color: '#64748b', fontWeight: 800 }}>
          {placement.mediaCount || 0} creative file{placement.mediaCount === 1 ? '' : 's'}
          {placement.videoCount ? ` • ${placement.videoCount} video${placement.videoCount === 1 ? '' : 's'}` : ''}
        </small>
      )}
    </div>
  );
};

const PlacementGallery = ({
  placements,
  isLoading,
  emptyLabel,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  regionFilter,
  setRegionFilter,
  regionOptions,
}) => (
  <>
    <div
      className={styles.toolbar}
      style={{
        padding: 12,
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1.5fr) minmax(160px, 0.6fr) minmax(160px, 0.6fr)',
        gap: 8,
      }}
    >
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search placement, vendor, campaign, office, region..."
        style={inputStyle}
      />

      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={inputStyle}>
        <option value="all">Billboards + DMV</option>
        <option value="billboard">Billboards Only</option>
        <option value="dmv_video">DMV Only</option>
      </select>

      <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} style={inputStyle}>
        <option value="all">All Regions</option>
        {regionOptions.map((region) => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>
    </div>

    {isLoading ? (
      <div className={styles.emptyState}>Loading placement creative...</div>
    ) : placements.length === 0 ? (
      <div className={styles.emptyState}>{emptyLabel}</div>
    ) : (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
          gap: 12,
        }}
      >
        {placements.map((placement) => (
          <PlacementCard key={placement.id} placement={placement} />
        ))}
      </div>
    )}
  </>
);

const MarketingAssets = () => {
  const fileInputRef = useRef(null);

  const [assets, setAssets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [offices, setOffices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [placementLocations, setPlacementLocations] = useState([]);
  const [placementContracts, setPlacementContracts] = useState([]);
  const [placementPhotos, setPlacementPhotos] = useState({});
  const [mediaCampaigns, setMediaCampaigns] = useState([]);
  const [mediaCampaignAssets, setMediaCampaignAssets] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [assetSection, setAssetSection] = useState('active');
  const [placementSearch, setPlacementSearch] = useState('');
  const [placementTypeFilter, setPlacementTypeFilter] = useState('all');
  const [placementRegionFilter, setPlacementRegionFilter] = useState('all');

  const [assetModal, setAssetModal] = useState({
    open: false,
    mode: 'create',
    asset: null,
  });

  const [detailAsset, setDetailAsset] = useState(null);

  const showSuccess = (message) => {
    setSuccessMessage(message);

    window.setTimeout(() => {
      setSuccessMessage('');
    }, 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    setPageError('');

    try {
      const [
        assetsResult,
        locationsResult,
        officesResult,
        regionsResult,
        vendorsResult,
        activityTypesResult,
        campaignsResult,
        contractsResult,
        mediaCampaignsResult,
        mediaAssetsResult,
      ] = await Promise.all([
        supabase
          .from('marketing_assets')
          .select('*')
          .order('is_favorite', { ascending: false })
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('marketing_locations')
          .select('*')
          .order('name', { ascending: true }),
        supabase
          .from('marketing_offices_with_regions')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('office_code', { ascending: true }),
        supabase
          .from('marketing_regions')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('marketing_vendors')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('vendor_name', { ascending: true }),
        supabase
          .from('marketing_activity_types')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('label', { ascending: true }),
        supabase
          .from('marketing_campaigns')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('marketing_contracts')
          .select('*')
          .order('start_date', { ascending: false, nullsFirst: false }),
        supabase
          .from('marketing_location_campaigns')
          .select('*')
          .order('start_date', { ascending: false, nullsFirst: false }),
        supabase
          .from('marketing_location_campaign_assets')
          .select('*')
          .order('sort_order', { ascending: true }),
      ]);

      const fatalError = assetsResult.error || locationsResult.error;
      if (fatalError) throw fatalError;

      const locationRows = locationsResult.data || [];
      const locationIds = locationRows.map((row) => row.id).filter(Boolean);
      const photosByLocation = locationIds.length
        ? await getMarketingPhotosByLocations(locationIds)
        : {};

      setAssets(assetsResult.data || []);
      setLocations(locationRows);
      setPlacementLocations(locationRows);
      setOffices(officesResult.error ? [] : officesResult.data || []);
      setRegions(regionsResult.error ? [] : regionsResult.data || []);
      setVendors(vendorsResult.error ? [] : vendorsResult.data || []);
      setActivityTypes(activityTypesResult.error ? [] : activityTypesResult.data || []);
      setCampaigns(campaignsResult.error ? [] : campaignsResult.data || []);
      setPlacementContracts(contractsResult.error ? [] : contractsResult.data || []);
      setPlacementPhotos(photosByLocation || {});
      setMediaCampaigns(mediaCampaignsResult.error ? [] : mediaCampaignsResult.data || []);
      setMediaCampaignAssets(mediaAssetsResult.error ? [] : mediaAssetsResult.data || []);
    } catch (error) {
      console.error('Error loading Marketing Assets:', error);
      setPageError(error?.message || 'Could not load Marketing Assets.');
      setAssets([]);
      setPlacementLocations([]);
      setPlacementContracts([]);
      setPlacementPhotos({});
      setMediaCampaigns([]);
      setMediaCampaignAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relationMaps = useMemo(() => {
    return {
      locations: Object.fromEntries(locations.map((row) => [row.id, row])),
      offices: Object.fromEntries(offices.map((row) => [row.id, row])),
      regions: Object.fromEntries(regions.map((row) => [row.id, row])),
      vendors: Object.fromEntries(vendors.map((row) => [row.id, row])),
      activityTypes: Object.fromEntries(activityTypes.map((row) => [row.id, row])),
      campaigns: Object.fromEntries(campaigns.map((row) => [row.id, row])),
    };
  }, [activityTypes, campaigns, locations, offices, regions, vendors]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      if (typeFilter !== 'all' && asset.asset_type !== typeFilter) return false;
      if (statusFilter !== 'all' && asset.status !== statusFilter) return false;
      if (officeFilter !== 'all' && asset.office_id !== officeFilter) return false;
      if (regionFilter !== 'all' && asset.region_id !== regionFilter) return false;
      if (vendorFilter !== 'all' && asset.vendor_id !== vendorFilter) return false;
      if (favoriteOnly && !asset.is_favorite) return false;

      if (!query) return true;

      const location = relationMaps.locations[asset.location_id];
      const office = relationMaps.offices[asset.office_id];
      const region = relationMaps.regions[asset.region_id];
      const vendor = relationMaps.vendors[asset.vendor_id];
      const campaign = relationMaps.campaigns[asset.campaign_id];

      return [
        asset.title,
        asset.asset_type,
        asset.description,
        asset.file_name,
        asset.file_type,
        asset.mime_type,
        asset.notes,
        ...(asset.tags || []),
        optionLabel(location, ['name', 'city']),
        optionLabel(office, ['office_name', 'office_code']),
        optionLabel(region, ['name']),
        optionLabel(vendor, ['vendor_name']),
        optionLabel(campaign, ['name', 'campaign_name', 'title']),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [
    assets,
    favoriteOnly,
    officeFilter,
    regionFilter,
    relationMaps,
    search,
    statusFilter,
    typeFilter,
    vendorFilter,
  ]);

  const metrics = useMemo(() => {
    const active = assets.filter((asset) => asset.status !== 'archived').length;
    const approved = assets.filter((asset) => asset.status === 'approved').length;
    const favorites = assets.filter((asset) => asset.is_favorite).length;
    const totalBytes = assets.reduce((sum, asset) => sum + Number(asset.file_size || 0), 0);

    return {
      total: assets.length,
      active,
      approved,
      favorites,
      totalBytes,
    };
  }, [assets]);


  const placementRegionOptions = useMemo(() => {
    return Array.from(
      new Set(
        placementLocations
          .filter((location) => ['billboard', 'dmv_video'].includes(location.type))
          .map((location) => location.region)
          .filter(Boolean)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
  }, [placementLocations]);

  const placements = useMemo(() => {
    const contractsByLocation = placementContracts.reduce((acc, contract) => {
      if (!contract.location_id) return acc;
      if (!acc[contract.location_id]) acc[contract.location_id] = [];
      acc[contract.location_id].push(contract);
      return acc;
    }, {});

    const campaignAssetsByCampaign = mediaCampaignAssets.reduce((acc, asset) => {
      if (!asset.campaign_id) return acc;
      if (!acc[asset.campaign_id]) acc[asset.campaign_id] = [];
      acc[asset.campaign_id].push(asset);
      return acc;
    }, {});

    const locationsById = Object.fromEntries(
      placementLocations.map((location) => [location.id, location])
    );

    const billboardPlacements = placementLocations
      .filter((location) => location.type === 'billboard')
      .map((location) => {
        const contracts = [...(contractsByLocation[location.id] || [])].sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (a.status !== 'active' && b.status === 'active') return 1;
          return String(b.start_date || b.created_at || '').localeCompare(
            String(a.start_date || a.created_at || '')
          );
        });

        const activeContract =
          contracts.find(
            (contract) =>
              contract.status === 'active' && isDateCurrentOrFuture(contract.end_date)
          ) || null;

        const hasOriginalContract =
          Boolean(location.contract_start) ||
          Boolean(location.contract_end) ||
          Boolean(location.renewal_date) ||
          Number(location.monthly_cost || 0) > 0;

        const originalIsActive =
          hasOriginalContract &&
          location.status !== 'expired' &&
          isDateCurrentOrFuture(location.contract_end || location.renewal_date);

        const currentContract = activeContract || (originalIsActive ? {
          vendor: location.vendor,
          start_date: location.contract_start,
          end_date: location.contract_end,
          renewal_date: location.renewal_date,
          monthly_cost: location.monthly_cost,
          status: 'active',
        } : contracts[0] || (hasOriginalContract ? {
          vendor: location.vendor,
          start_date: location.contract_start,
          end_date: location.contract_end,
          renewal_date: location.renewal_date,
          monthly_cost: location.monthly_cost,
          status: location.status || 'expired',
        } : null));

        const isActive = Boolean(activeContract || originalIsActive);
        const previewUrl = getPrimaryPhotoUrl(placementPhotos[location.id] || [], location);
        const width = location.billboard_width;
        const height = location.billboard_height;
        const unit = location.billboard_size_unit || 'ft';

        return {
          id: `billboard:${location.id}`,
          locationId: location.id,
          type: 'billboard',
          name: location.name || 'Billboard',
          city: location.city || '',
          office: location.office || '',
          region: location.region || '',
          vendor: currentContract?.vendor || location.vendor || '',
          startDate: currentContract?.start_date || location.contract_start || '',
          endDate: currentContract?.end_date || location.contract_end || '',
          renewalDate: currentContract?.renewal_date || location.renewal_date || '',
          monthlyCost: Number(currentContract?.monthly_cost ?? location.monthly_cost ?? 0),
          billboardSize: width && height ? `${width} ${unit} × ${height} ${unit}` : '',
          placementType: location.placement_type || '',
          previewUrl,
          previewAsset: null,
          isActive,
          status: isActive ? 'active' : 'past',
        };
      });

    const dmvPlacements = mediaCampaigns
      .filter((campaign) => campaign.campaign_type === 'dmv_video')
      .map((campaign) => {
        const location = locationsById[campaign.location_id] || {};
        const mediaAssets = campaignAssetsByCampaign[campaign.id] || [];
        const previewAsset =
          mediaAssets.find((asset) => asset.asset_type === 'video' && asset.file_url) ||
          mediaAssets.find((asset) => asset.file_url) ||
          null;
        const isActive =
          campaign.status === 'active' &&
          !isDateExpired(campaign.end_date);

        return {
          id: `dmv:${campaign.id}`,
          locationId: campaign.location_id,
          campaignId: campaign.id,
          type: 'dmv_video',
          name: campaign.campaign_name || location.name || 'DMV Video Campaign',
          city: location.city || '',
          office: location.office || '',
          region: location.region || '',
          vendor: campaign.vendor || location.vendor || '',
          startDate: campaign.start_date || '',
          endDate: campaign.end_date || '',
          renewalDate: campaign.renewal_date || '',
          monthlyCost: Number(campaign.monthly_cost || 0),
          previewUrl: '',
          previewAsset,
          mediaCount: mediaAssets.length,
          videoCount: mediaAssets.filter((asset) => asset.asset_type === 'video').length,
          isActive,
          status: isActive ? 'active' : 'past',
        };
      });

    return [...billboardPlacements, ...dmvPlacements];
  }, [mediaCampaignAssets, mediaCampaigns, placementContracts, placementLocations, placementPhotos]);

  const filteredPlacements = useMemo(() => {
    const query = placementSearch.trim().toLowerCase();

    return placements.filter((placement) => {
      const matchesSection =
        assetSection === 'active' ? placement.isActive : !placement.isActive;
      if (!matchesSection) return false;

      if (
        placementTypeFilter !== 'all' &&
        placement.type !== placementTypeFilter
      ) {
        return false;
      }

      if (
        placementRegionFilter !== 'all' &&
        placement.region !== placementRegionFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [
        placement.name,
        placement.city,
        placement.office,
        placement.region,
        placement.vendor,
        placement.placementType,
        formatPlacementType(placement.type),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [
    assetSection,
    placementRegionFilter,
    placementSearch,
    placementTypeFilter,
    placements,
  ]);

  const placementMetrics = useMemo(() => {
    const active = placements.filter((placement) => placement.isActive);
    const past = placements.filter((placement) => !placement.isActive);
    const activeBillboards = active.filter((placement) => placement.type === 'billboard').length;
    const activeDmv = active.filter((placement) => placement.type === 'dmv_video').length;
    const liveCreative = active.filter(
      (placement) => placement.previewUrl || placement.previewAsset?.file_url
    ).length;

    const expiringSoon = active.filter((placement) => {
      const date = placement.renewalDate || placement.endDate;
      if (!date) return false;
      const today = new Date(`${getTodayKey()}T12:00:00`);
      const target = new Date(`${String(date).slice(0, 10)}T12:00:00`);
      if (Number.isNaN(target.getTime())) return false;
      const days = Math.ceil((target - today) / 86400000);
      return days >= 0 && days <= 60;
    }).length;

    return {
      activeBillboards,
      activeDmv,
      liveCreative,
      expiringSoon,
      past: past.length,
    };
  }, [placements]);

  const openCreate = () => {
    setAssetModal({
      open: true,
      mode: 'create',
      asset: null,
    });
  };

  const openEdit = (asset) => {
    setAssetModal({
      open: true,
      mode: 'edit',
      asset,
    });
  };

  const closeAssetModal = () => {
    if (isSaving) return;

    setAssetModal({
      open: false,
      mode: 'create',
      asset: null,
    });
  };

  const handleToggleFavorite = async (asset) => {
    try {
      const { error } = await supabase
        .from('marketing_assets')
        .update({
          is_favorite: !asset.is_favorite,
        })
        .eq('id', asset.id);

      if (error) throw error;

      setAssets((prev) =>
        prev.map((item) =>
          item.id === asset.id
            ? { ...item, is_favorite: !item.is_favorite }
            : item
        )
      );
    } catch (error) {
      console.error('Error updating favorite:', error);
      setPageError(error?.message || 'Could not update favorite.');
    }
  };

  const handleArchive = async (asset) => {
    try {
      const nextStatus = asset.status === 'archived' ? 'active' : 'archived';

      const { error } = await supabase
        .from('marketing_assets')
        .update({ status: nextStatus })
        .eq('id', asset.id);

      if (error) throw error;

      setAssets((prev) =>
        prev.map((item) =>
          item.id === asset.id ? { ...item, status: nextStatus } : item
        )
      );

      showSuccess(
        nextStatus === 'archived'
          ? `${resolveAssetName(asset)} archived.`
          : `${resolveAssetName(asset)} restored.`
      );
    } catch (error) {
      console.error('Error archiving asset:', error);
      setPageError(error?.message || 'Could not update asset status.');
    }
  };

  const handleDelete = async (asset) => {
    const confirmed = window.confirm(
      `Delete "${resolveAssetName(asset)}" from the asset library? This cannot be undone.`
    );

    if (!confirmed) return;

    setPageError('');

    try {
      if (asset.storage_path) {
        const { error: storageError } = await supabase.storage
          .from(ASSET_BUCKET)
          .remove([asset.storage_path]);

        if (storageError) {
          console.warn('Asset row will be deleted, but storage cleanup failed:', storageError);
        }
      }

      const { error } = await supabase
        .from('marketing_assets')
        .delete()
        .eq('id', asset.id);

      if (error) throw error;

      setAssets((prev) => prev.filter((item) => item.id !== asset.id));

      if (detailAsset?.id === asset.id) {
        setDetailAsset(null);
      }

      showSuccess(`${resolveAssetName(asset)} deleted.`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      setPageError(error?.message || 'Could not delete asset.');
    }
  };

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div
        className={styles.card}
        style={{
          padding: 18,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Assets</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
            Central library for artwork, videos, mailers, proofs, contracts, invoices, photos, and brand files.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={loadData}
            disabled={isLoading}
          >
            Refresh
          </button>

          <button type="button" className={styles.primaryBtn} onClick={openCreate}>
            + Add Asset
          </button>
        </div>
      </div>

      {pageError && <div className={styles.errorBanner}>{pageError}</div>}

      {successMessage && (
        <div
          style={{
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            color: '#166534',
            borderRadius: 12,
            padding: 11,
            fontWeight: 850,
          }}
        >
          {successMessage}
        </div>
      )}

      <div
        className={styles.card}
        style={{
          padding: 8,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className={assetSection === 'active' ? styles.primaryBtn : styles.secondaryBtn}
          onClick={() => setAssetSection('active')}
        >
          Active Placements
        </button>
        <button
          type="button"
          className={assetSection === 'past' ? styles.primaryBtn : styles.secondaryBtn}
          onClick={() => setAssetSection('past')}
        >
          Past / Expired
        </button>
        <button
          type="button"
          className={assetSection === 'library' ? styles.primaryBtn : styles.secondaryBtn}
          onClick={() => setAssetSection('library')}
        >
          Asset Library
        </button>
      </div>

      {assetSection !== 'library' && (
        <div className={styles.kpiGrid}>
          <MetricCard label="Active Billboards" value={placementMetrics.activeBillboards} />
          <MetricCard label="Active DMV Campaigns" value={placementMetrics.activeDmv} />
          <MetricCard label="Live Creative" value={placementMetrics.liveCreative} />
          <MetricCard label="Expiring Soon" value={placementMetrics.expiringSoon} note="Next 60 days" />
          <MetricCard label="Past Placements" value={placementMetrics.past} />
        </div>
      )}

      {assetSection === 'library' ? (
        <>
      <div className={styles.kpiGrid}>
        <MetricCard label="Total Assets" value={metrics.total} />
        <MetricCard label="Current Library" value={metrics.active} note="Excludes archived" />
        <MetricCard label="Approved" value={metrics.approved} />
        <MetricCard
          label="Favorites"
          value={metrics.favorites}
          note={metrics.totalBytes ? `${formatBytes(metrics.totalBytes)} stored` : 'Star important files'}
        />
      </div>

      <div
        className={styles.toolbar}
        style={{
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(150px, 0.65fr))',
            gap: 8,
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, file, tag, office, vendor, campaign..."
            style={inputStyle}
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Asset Types</option>
            {ASSET_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={officeFilter}
            onChange={(event) => setOfficeFilter(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Offices</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.office_code ? `${office.office_code} · ` : ''}
                {office.office_name || office.city || 'Office'}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              style={{ ...inputStyle, width: 180 }}
            >
              <option value="all">All Regions</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>

            <select
              value={vendorFilter}
              onChange={(event) => setVendorFilter(event.target.value)}
              style={{ ...inputStyle, width: 200 }}
            >
              <option value="all">All Vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.vendor_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={favoriteOnly ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => setFavoriteOnly((value) => !value)}
            >
              ★ Favorites
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={viewMode === 'grid' ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>

            <button
              type="button"
              className={viewMode === 'list' ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Loading asset library...</div>
      ) : filteredAssets.length === 0 ? (
        <div className={styles.emptyState}>
          {assets.length === 0
            ? 'No assets yet. Click + Add Asset to build your library.'
            : 'No assets match the current filters.'}
        </div>
      ) : viewMode === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: 12,
          }}
        >
          {filteredAssets.map((asset) => {
            const typeMeta = getTypeMeta(asset.asset_type);

            return (
              <div
                key={asset.id}
                className={styles.card}
                style={{
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                  cursor: 'pointer',
                }}
                onClick={() => setDetailAsset(asset)}
              >
                <div style={{ position: 'relative' }}>
                  <AssetPreview asset={asset} height={175} />

                  <button
                    type="button"
                    title={asset.is_favorite ? 'Remove favorite' : 'Add favorite'}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFavorite(asset);
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 8,
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: '1px solid #e2e8f0',
                      background: 'rgba(255,255,255,0.94)',
                      cursor: 'pointer',
                      fontSize: 18,
                    }}
                  >
                    {asset.is_favorite ? '★' : '☆'}
                  </button>
                </div>

                <div style={{ minWidth: 0 }}>
                  <strong
                    style={{
                      display: 'block',
                      color: '#0f172a',
                      fontSize: 14,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {resolveAssetName(asset)}
                  </strong>

                  <small
                    style={{
                      display: 'block',
                      marginTop: 4,
                      color: '#64748b',
                      fontWeight: 800,
                    }}
                  >
                    {typeMeta.icon} {typeMeta.label}
                  </small>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <StatusPill status={asset.status} />
                  <small style={{ color: '#94a3b8', fontWeight: 800 }}>
                    {formatDate(asset.uploaded_at || asset.created_at)}
                  </small>
                </div>

                <AssetRelationshipLine asset={asset} relationMaps={relationMaps} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.card} style={{ padding: 0, overflowX: 'auto' }}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Linked To</th>
                <th>File</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredAssets.map((asset) => {
                const typeMeta = getTypeMeta(asset.asset_type);

                return (
                  <tr key={asset.id}>
                    <td>
                      <strong>{resolveAssetName(asset)}</strong>
                      {asset.description && <small>{asset.description}</small>}
                    </td>

                    <td>
                      {typeMeta.icon} {typeMeta.label}
                    </td>

                    <td>
                      <AssetRelationshipLine asset={asset} relationMaps={relationMaps} />
                    </td>

                    <td>
                      <strong>{asset.file_name || '—'}</strong>
                      <small>{formatBytes(asset.file_size)}</small>
                    </td>

                    <td>
                      <StatusPill status={asset.status} />
                    </td>

                    <td>{formatDate(asset.uploaded_at || asset.created_at)}</td>

                    <td>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => setDetailAsset(asset)}
                        >
                          View
                        </button>

                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => openEdit(asset)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => handleToggleFavorite(asset)}
                        >
                          {asset.is_favorite ? '★' : '☆'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

        </>
      ) : (
        <PlacementGallery
          placements={filteredPlacements}
          isLoading={isLoading}
          emptyLabel={
            assetSection === 'active'
              ? 'No active billboard or DMV placements match these filters.'
              : 'No past or expired billboard / DMV placements match these filters.'
          }
          search={placementSearch}
          setSearch={setPlacementSearch}
          typeFilter={placementTypeFilter}
          setTypeFilter={setPlacementTypeFilter}
          regionFilter={placementRegionFilter}
          setRegionFilter={setPlacementRegionFilter}
          regionOptions={placementRegionOptions}
        />
      )}

      {assetModal.open && (
        <AssetModal
          mode={assetModal.mode}
          asset={assetModal.asset}
          locations={locations}
          offices={offices}
          regions={regions}
          vendors={vendors}
          campaigns={campaigns}
          activityTypes={activityTypes}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          fileInputRef={fileInputRef}
          onClose={closeAssetModal}
          onSaved={async (message) => {
            setAssetModal({
              open: false,
              mode: 'create',
              asset: null,
            });

            showSuccess(message);
            await loadData();
          }}
        />
      )}

      {detailAsset && (
        <AssetDetailModal
          asset={detailAsset}
          relationMaps={relationMaps}
          onClose={() => setDetailAsset(null)}
          onEdit={() => {
            const asset = detailAsset;
            setDetailAsset(null);
            openEdit(asset);
          }}
          onToggleFavorite={() => handleToggleFavorite(detailAsset)}
          onArchive={() => handleArchive(detailAsset)}
          onDelete={() => handleDelete(detailAsset)}
        />
      )}
    </section>
  );
};

const AssetRelationshipLine = ({ asset, relationMaps }) => {
  const location = relationMaps.locations[asset.location_id];
  const office = relationMaps.offices[asset.office_id];
  const region = relationMaps.regions[asset.region_id];
  const vendor = relationMaps.vendors[asset.vendor_id];
  const campaign = relationMaps.campaigns[asset.campaign_id];

  const items = [
    office
      ? `🏢 ${optionLabel(office, ['office_code', 'office_name'])}`
      : null,
    location ? `📍 ${optionLabel(location, ['name'])}` : null,
    campaign
      ? `🎯 ${optionLabel(campaign, ['name', 'campaign_name', 'title'])}`
      : null,
    region ? `🗺️ ${optionLabel(region, ['name'])}` : null,
    vendor ? `🏷️ ${optionLabel(vendor, ['vendor_name'])}` : null,
  ].filter(Boolean);

  if (!items.length) {
    return (
      <small style={{ color: '#94a3b8', fontWeight: 750 }}>
        General library asset
      </small>
    );
  }

  return (
    <small
      style={{
        color: '#64748b',
        fontWeight: 800,
        display: 'block',
        lineHeight: 1.45,
      }}
    >
      {items.slice(0, 3).join(' • ')}
    </small>
  );
};

const AssetModal = ({
  mode,
  asset,
  locations,
  offices,
  regions,
  vendors,
  campaigns,
  activityTypes,
  isSaving,
  setIsSaving,
  fileInputRef,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState(() => {
    if (mode === 'edit' && asset) {
      return {
        title: asset.title || '',
        assetType: asset.asset_type || 'other',
        description: asset.description || '',
        status: asset.status || 'active',
        locationId: asset.location_id || '',
        officeId: asset.office_id || '',
        campaignId: asset.campaign_id || '',
        regionId: asset.region_id || '',
        vendorId: asset.vendor_id || '',
        activityTypeId: asset.activity_type_id || '',
        fileUrl: asset.file_url || '',
        thumbnailUrl: asset.thumbnail_url || '',
        tags: Array.isArray(asset.tags) ? asset.tags.join(', ') : '',
        notes: asset.notes || '',
        isFavorite: Boolean(asset.is_favorite),
        file: null,
      };
    }

    return { ...EMPTY_FORM };
  });

  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgressLabel, setUploadProgressLabel] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const uploadFile = async (file) => {
    if (!file) return null;

    const extension = file.name.includes('.')
      ? file.name.split('.').pop().toLowerCase()
      : '';

    const baseName = safeFileName(
      file.name.replace(/\.[^.]+$/, '') || 'asset'
    );

    const uniqueName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${baseName}${extension ? `.${extension}` : ''}`;

    const storagePath = `library/${new Date().getFullYear()}/${uniqueName}`;

    setUploadProgressLabel('Uploading file...');

    const { error: uploadError } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      if (
        String(uploadError.message || '')
          .toLowerCase()
          .includes('bucket')
      ) {
        throw new Error(
          `Supabase Storage bucket "${ASSET_BUCKET}" is not available yet. Create the bucket, then try again.`
        );
      }

      throw uploadError;
    }

    const { data: publicData } = supabase.storage
      .from(ASSET_BUCKET)
      .getPublicUrl(storagePath);

    return {
      fileUrl: publicData?.publicUrl || '',
      storagePath,
      fileName: file.name,
      fileType: extension || '',
      mimeType: file.type || '',
      fileSize: file.size || null,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const title = draft.title.trim() || draft.file?.name || asset?.file_name || '';

    if (!title) {
      setErrorMessage('Asset title is required.');
      return;
    }

    if (mode === 'create' && !draft.file && !draft.fileUrl.trim()) {
      setErrorMessage('Choose a file or enter an external file URL.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setUploadProgressLabel('');

    let newUpload = null;

    try {
      if (draft.file) {
        newUpload = await uploadFile(draft.file);
      }

      const fileUrl = newUpload?.fileUrl || draft.fileUrl.trim() || null;

      const payload = {
        asset_type: draft.assetType || 'other',
        title,
        description: draft.description.trim() || null,
        file_url: fileUrl,
        thumbnail_url: draft.thumbnailUrl.trim() || null,
        location_id: draft.locationId || null,
        office_id: draft.officeId || null,
        campaign_id: draft.campaignId || null,
        region_id: draft.regionId || null,
        vendor_id: draft.vendorId || null,
        activity_type_id: draft.activityTypeId || null,
        status: draft.status || 'active',
        tags: parseTags(draft.tags),
        notes: draft.notes.trim() || null,
        is_favorite: Boolean(draft.isFavorite),
      };

      if (newUpload) {
        payload.file_name = newUpload.fileName;
        payload.file_type = newUpload.fileType;
        payload.mime_type = newUpload.mimeType;
        payload.file_size = newUpload.fileSize;
        payload.storage_path = newUpload.storagePath;
      } else if (mode === 'create') {
        payload.file_name = fileUrl ? fileUrl.split('/').pop()?.split('?')[0] || null : null;
        payload.file_type =
          payload.file_name && payload.file_name.includes('.')
            ? payload.file_name.split('.').pop()?.toLowerCase()
            : null;
      }

      if (mode === 'edit' && asset?.id) {
        const { error } = await supabase
          .from('marketing_assets')
          .update(payload)
          .eq('id', asset.id);

        if (error) throw error;

        if (newUpload && asset.storage_path && asset.storage_path !== newUpload.storagePath) {
          await supabase.storage
            .from(ASSET_BUCKET)
            .remove([asset.storage_path])
            .catch((storageError) => {
              console.warn('Old asset file could not be removed:', storageError);
            });
        }

        onSaved(`${title} updated.`);
      } else {
        payload.uploaded_at = new Date().toISOString();

        const { error } = await supabase
          .from('marketing_assets')
          .insert(payload);

        if (error) throw error;

        onSaved(`${title} added to Assets.`);
      }
    } catch (error) {
      console.error('Error saving Marketing Asset:', error);

      if (newUpload?.storagePath) {
        await supabase.storage
          .from(ASSET_BUCKET)
          .remove([newUpload.storagePath])
          .catch(() => {});
      }

      setErrorMessage(error?.message || 'Could not save asset.');
    } finally {
      setUploadProgressLabel('');
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={mode === 'edit' ? 'Edit Asset' : 'Add Asset'}
      subtitle="Upload a file or register an existing URL, then link it to the parts of MarketingOps that use it."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}

        <div style={twoColumnGrid}>
          <label style={labelStyle}>
            Asset Title
            <input
              value={draft.title}
              onChange={(event) => updateDraft('title', event.target.value)}
              placeholder="2026 Tax Season Billboard Artwork"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Asset Type
            <select
              value={draft.assetType}
              onChange={(event) => updateDraft('assetType', event.target.value)}
              style={inputStyle}
            >
              {ASSET_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Status
            <select
              value={draft.status}
              onChange={(event) => updateDraft('status', event.target.value)}
              style={inputStyle}
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Activity Type
            <select
              value={draft.activityTypeId}
              onChange={(event) => updateDraft('activityTypeId', event.target.value)}
              style={inputStyle}
            >
              <option value="">No Activity Type</option>
              {activityTypes.map((activityType) => (
                <option key={activityType.id} value={activityType.id}>
                  {activityType.label || activityType.key}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Marketing Location
            <select
              value={draft.locationId}
              onChange={(event) => updateDraft('locationId', event.target.value)}
              style={inputStyle}
            >
              <option value="">No Marketing Location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.city ? ` · ${location.city}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Office
            <select
              value={draft.officeId}
              onChange={(event) => {
                const nextOfficeId = event.target.value;
                const selectedOffice = offices.find((office) => office.id === nextOfficeId);

                setDraft((prev) => ({
                  ...prev,
                  officeId: nextOfficeId,
                  regionId:
                    selectedOffice?.region_id ||
                    prev.regionId,
                }));
              }}
              style={inputStyle}
            >
              <option value="">No Office</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.office_code ? `${office.office_code} · ` : ''}
                  {office.office_name || office.city || 'Office'}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Region
            <select
              value={draft.regionId}
              onChange={(event) => updateDraft('regionId', event.target.value)}
              style={inputStyle}
            >
              <option value="">No Region</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Vendor
            <select
              value={draft.vendorId}
              onChange={(event) => updateDraft('vendorId', event.target.value)}
              style={inputStyle}
            >
              <option value="">No Vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.vendor_name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Campaign
            <select
              value={draft.campaignId}
              onChange={(event) => updateDraft('campaignId', event.target.value)}
              style={inputStyle}
            >
              <option value="">No Campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {optionLabel(campaign, ['name', 'campaign_name', 'title'])}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Tags
            <input
              value={draft.tags}
              onChange={(event) => updateDraft('tags', event.target.value)}
              placeholder="tax season, spanish, bay area"
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          Description
          <textarea
            value={draft.description}
            onChange={(event) => updateDraft('description', event.target.value)}
            placeholder="Describe what this asset is and where it is intended to be used."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <div
          style={{
            border: '1px dashed #93c5fd',
            borderRadius: 14,
            padding: 13,
            background: '#f8fbff',
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ color: '#075985' }}>
            {mode === 'edit' ? 'Replace File (optional)' : 'Upload File'}
          </strong>

          <input
            ref={fileInputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;

              setDraft((prev) => ({
                ...prev,
                file,
                title: prev.title || file?.name?.replace(/\.[^.]+$/, '') || '',
              }));
            }}
            disabled={isSaving}
          />

          {draft.file && (
            <small style={{ color: '#0369a1', fontWeight: 850 }}>
              Selected: {draft.file.name} · {formatBytes(draft.file.size)}
            </small>
          )}

          <small style={{ color: '#64748b', fontWeight: 750 }}>
            Images, PDFs, videos, artwork files, and documents can be stored in the Marketing Assets bucket.
          </small>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <label style={labelStyle}>
            Existing / External File URL
            <input
              value={draft.fileUrl}
              onChange={(event) => updateDraft('fileUrl', event.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Thumbnail URL
            <input
              value={draft.thumbnailUrl}
              onChange={(event) => updateDraft('thumbnailUrl', event.target.value)}
              placeholder="Optional image preview URL"
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          Internal Notes
          <textarea
            value={draft.notes}
            onChange={(event) => updateDraft('notes', event.target.value)}
            placeholder="Approval notes, printing details, vendor specs, version notes..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={draft.isFavorite}
            onChange={(event) => updateDraft('isFavorite', event.target.checked)}
          />
          Mark as favorite
        </label>

        {uploadProgressLabel && (
          <strong style={{ color: '#0284c7' }}>{uploadProgressLabel}</strong>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            paddingTop: 4,
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Save Asset'
                : 'Add Asset'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const AssetDetailModal = ({
  asset,
  relationMaps,
  onClose,
  onEdit,
  onToggleFavorite,
  onArchive,
  onDelete,
}) => {
  const typeMeta = getTypeMeta(asset.asset_type);

  const location = relationMaps.locations[asset.location_id];
  const office = relationMaps.offices[asset.office_id];
  const region = relationMaps.regions[asset.region_id];
  const vendor = relationMaps.vendors[asset.vendor_id];
  const campaign = relationMaps.campaigns[asset.campaign_id];
  const activityType = relationMaps.activityTypes[asset.activity_type_id];

  return (
    <ModalShell
      title={resolveAssetName(asset)}
      subtitle={`${typeMeta.icon} ${typeMeta.label}`}
      onClose={onClose}
      wide
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <AssetPreview asset={asset} height={360} />

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <StatusPill status={asset.status} />

          {asset.is_favorite && (
            <span
              style={{
                borderRadius: 999,
                padding: '4px 8px',
                background: '#fef3c7',
                color: '#92400e',
                fontSize: 10,
                fontWeight: 950,
              }}
            >
              ★ Favorite
            </span>
          )}

          {asset.file_url && (
            <a
              href={asset.file_url}
              target="_blank"
              rel="noreferrer"
              className={styles.primaryBtn}
              style={{ textDecoration: 'none' }}
            >
              Open File
            </a>
          )}
        </div>

        {asset.description && (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 12,
              color: '#475569',
              lineHeight: 1.55,
              fontWeight: 700,
            }}
          >
            {asset.description}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <DetailItem label="File Name" value={asset.file_name || '—'} />
          <DetailItem label="File Size" value={formatBytes(asset.file_size)} />
          <DetailItem label="MIME Type" value={asset.mime_type || asset.file_type || '—'} />
          <DetailItem label="Uploaded" value={formatDate(asset.uploaded_at || asset.created_at)} />

          <DetailItem
            label="Office"
            value={office ? optionLabel(office, ['office_code', 'office_name']) : '—'}
          />

          <DetailItem
            label="Location"
            value={location ? optionLabel(location, ['name']) : '—'}
          />

          <DetailItem
            label="Region"
            value={region ? optionLabel(region, ['name']) : '—'}
          />

          <DetailItem
            label="Vendor"
            value={vendor ? optionLabel(vendor, ['vendor_name']) : '—'}
          />

          <DetailItem
            label="Campaign"
            value={
              campaign
                ? optionLabel(campaign, ['name', 'campaign_name', 'title'])
                : '—'
            }
          />

          <DetailItem
            label="Activity Type"
            value={
              activityType
                ? optionLabel(activityType, ['label', 'key'])
                : '—'
            }
          />
        </div>

        {Array.isArray(asset.tags) && asset.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {asset.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '5px 8px',
                  borderRadius: 999,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {asset.notes && (
          <div
            style={{
              borderTop: '1px solid #e2e8f0',
              paddingTop: 12,
            }}
          >
            <strong style={{ display: 'block', color: '#334155', marginBottom: 5 }}>
              Internal Notes
            </strong>
            <div style={{ color: '#64748b', lineHeight: 1.55, fontWeight: 700 }}>
              {asset.notes}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            borderTop: '1px solid #e2e8f0',
            paddingTop: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button type="button" className={styles.secondaryBtn} onClick={onToggleFavorite}>
              {asset.is_favorite ? '★ Remove Favorite' : '☆ Add Favorite'}
            </button>

            <button type="button" className={styles.secondaryBtn} onClick={onArchive}>
              {asset.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <button type="button" className={styles.secondaryBtn} onClick={onEdit}>
              Edit
            </button>

            <button type="button" className={styles.dangerBtn} onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

const DetailItem = ({ label, value }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 10,
      background: '#f8fafc',
      minWidth: 0,
    }}
  >
    <small
      style={{
        display: 'block',
        color: '#94a3b8',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        fontSize: 9,
      }}
    >
      {label}
    </small>

    <strong
      style={{
        display: 'block',
        marginTop: 4,
        color: '#334155',
        overflowWrap: 'anywhere',
      }}
    >
      {value}
    </strong>
  </div>
);

export default MarketingAssets;