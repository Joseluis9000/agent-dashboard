// src/pages/admin/marketing/MarketingLocations.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import styles from '../MarketingOps.module.css';
import MarketingMap from './components/MarketingMap';
import MarketingSidebar from './components/MarketingSidebar';
import CampaignSelector from './components/CampaignSelector';
import { getMarketingPhotosByLocations } from './services/photoService';

const EMPTY_FORM = {
  type: 'billboard',
  name: '',
  city: '',
  region: 'Bay Area',
  office: '',
  status: 'active',
  vendor: '',
  address: '',
  billboardWidth: '',
  billboardHeight: '',
  billboardSizeUnit: 'ft',
  placementType: '',
  photoUrl: '',
  photoFile: null,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  x: 45,
  y: 45,
  lat: '',
  lng: '',
  contractStart: '',
  contractEnd: '',
  renewalDate: '',
  eventDate: '',
  monthlyCost: '',
  traffic: '',
  campaign: '',
  campaignId: '',
  graphicText: '',
  graphicUrl: '',
  contractUrl: '',
  notes: '',
};

const FALLBACK_REGION_OPTIONS = [
  'Bay Area',
  'Cen-Cal',
  'Kern County',
  'The Valley',
  'Southern Cali',
];

const FALLBACK_TYPE_OPTIONS = [
  { value: 'billboard', label: 'Billboard', icon: '📍', mapMode: 'physical' },
  { value: 'event', label: 'Event', icon: '🎪', mapMode: 'physical' },
  { value: 'office', label: 'Office', icon: '🏢', mapMode: 'physical' },
  { value: 'sponsorship', label: 'Sponsorship', icon: '🤝', mapMode: 'physical' },
  { value: 'dmv_video', label: 'DMV Video Advertising', icon: '📺', mapMode: 'physical' },
  { value: 'tv_commercial', label: 'TV Commercial', icon: '🎬', mapMode: 'area' },
  { value: 'geofencing', label: 'Geofencing / Digital Ads', icon: '🎯', mapMode: 'area' },
];

const getTypeMeta = (type) =>
  FALLBACK_TYPE_OPTIONS.find((option) => option.value === type) || {
    value: type || 'other',
    label: type || 'Marketing Asset',
    icon: '📣',
    mapMode: 'physical',
  };

const isAreaOnlyType = (type) => getTypeMeta(type).mapMode === 'area';

const hasMapCoordinates = (item) =>
  Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng));

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'renewal', label: 'Renewal Soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'planned', label: 'Planned' },
];

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

const statusLabels = {
  active: { label: 'Active', className: 'green' },
  renewal: { label: 'Renewal Soon', className: 'yellow' },
  expired: { label: 'Expired', className: 'red' },
  planned: { label: 'Planned', className: 'purple' },
};

const getStatus = (status) => statusLabels[status] || statusLabels.active;

const getTodayKey = () => new Date().toISOString().split('T')[0];

const getDaysUntil = (dateKey) => {
  if (!dateKey) return null;

  const today = new Date(`${getTodayKey()}T12:00:00`);
  const target = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
};

const calculateAutoStatus = (item) => {
  if (item.type === 'event') {
    if (!item.eventDate) return item.status || 'planned';

    const daysUntilEvent = getDaysUntil(item.eventDate);
    if (daysUntilEvent === null) return item.status || 'planned';
    if (daysUntilEvent < 0) return 'expired';
    return item.status || 'planned';
  }

  if (item.type !== 'billboard') return item.status || 'active';

  const endDate = item.contractEnd || item.renewalDate;
  const daysUntilEnd = getDaysUntil(endDate);

  if (daysUntilEnd === null) return item.status || 'active';
  if (daysUntilEnd < 0) return 'expired';
  if (daysUntilEnd <= 60) return 'renewal';

  return item.status || 'active';
};

const groupByLocationId = (rows = []) => {
  return rows.reduce((acc, row) => {
    const locationId = row.location_id;
    if (!locationId) return acc;
    if (!acc[locationId]) acc[locationId] = [];
    acc[locationId].push(row);
    return acc;
  }, {});
};

const dbToLocation = (row) => {
  const item = {
    id: row.id,
    type: row.type || 'billboard',
    name: row.name || '',
    city: row.city || '',
    region: row.region || '',
    office: row.office || '',
    status: row.status || 'active',
    vendor: row.vendor || '',
    address: row.address || '',
    billboardWidth: row.billboard_width === null || row.billboard_width === undefined || row.billboard_width === '' ? '' : Number(row.billboard_width),
    billboardHeight: row.billboard_height === null || row.billboard_height === undefined || row.billboard_height === '' ? '' : Number(row.billboard_height),
    billboardSizeUnit: row.billboard_size_unit || 'ft',
    placementType: row.placement_type || '',
    photoUrl: row.photo_url || '',
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    x: Number(row.map_x ?? row.x ?? 45),
    y: Number(row.map_y ?? row.y ?? 45),
    lat: row.lat === null || row.lat === undefined || row.lat === '' ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined || row.lng === '' ? null : Number(row.lng),
    contractStart: row.contract_start || row.contractStart || '',
    contractEnd: row.contract_end || row.contractEnd || '',
    renewalDate: row.renewal_date || row.renewalDate || '',
    eventDate: row.event_date || row.eventDate || '',
    monthlyCost: Number(row.monthly_cost ?? row.monthlyCost ?? 0),
    estimatedImpressions: Number(row.estimated_impressions || 0),
    traffic: row.traffic || '',
    campaign: row.campaign || '',
    campaignId: row.campaign_id || '',
    graphicText: row.graphic_text || row.graphicText || '',
    graphicUrl: row.graphic_url || row.graphicUrl || '',
    contractUrl: row.contract_url || row.contractUrl || '',
    notes: row.notes || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };

  return {
    ...item,
    status: calculateAutoStatus(item),
  };
};

const cleanNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
};

const locationToDb = (form) => ({
  type: form.type || 'billboard',
  name: form.name?.trim() || '',
  city: form.city?.trim() || '',
  region: form.region || '',
  office: form.office?.trim() || '',
  status: form.status || 'active',
  vendor: form.vendor?.trim() || '',
  address: form.address?.trim() || '',
  billboard_width: cleanNumberOrNull(form.billboardWidth),
  billboard_height: cleanNumberOrNull(form.billboardHeight),
  billboard_size_unit: form.billboardSizeUnit || 'ft',
  placement_type: form.placementType?.trim() || '',
  photo_url: form.photoUrl?.trim() || '',
  contact_name: form.contactName?.trim() || '',
  contact_phone: form.contactPhone?.trim() || '',
  contact_email: form.contactEmail?.trim() || '',
  map_x: Number(form.x || 45),
  map_y: Number(form.y || 45),
  lat: cleanNumberOrNull(form.lat),
  lng: cleanNumberOrNull(form.lng),
  contract_start: form.contractStart || null,
  contract_end: form.contractEnd || null,
  renewal_date: form.renewalDate || null,
  event_date: form.eventDate || null,
  monthly_cost: Number(form.monthlyCost || 0),
  traffic: form.traffic?.trim() || '',
  campaign: form.campaign?.trim() || '',
  campaign_id: form.campaignId || null,
  graphic_text: form.graphicText?.trim() || '',
  graphic_url: form.graphicUrl?.trim() || '',
  contract_url: form.contractUrl?.trim() || '',
  notes: form.notes?.trim() || '',
});

const locationToForm = (item) => ({
  type: item.type || 'billboard',
  name: item.name || '',
  city: item.city || '',
  region: item.region || 'Bay Area',
  office: item.office || '',
  status: item.status || 'active',
  vendor: item.vendor || '',
  address: item.address || '',
  billboardWidth: item.billboardWidth ?? '',
  billboardHeight: item.billboardHeight ?? '',
  billboardSizeUnit: item.billboardSizeUnit || 'ft',
  placementType: item.placementType || '',
  photoUrl: item.photoUrl || '',
  photoFile: null,
  contactName: item.contactName || '',
  contactPhone: item.contactPhone || '',
  contactEmail: item.contactEmail || '',
  x: item.x ?? 45,
  y: item.y ?? 45,
  lat: item.lat ?? '',
  lng: item.lng ?? '',
  contractStart: item.contractStart || '',
  contractEnd: item.contractEnd || '',
  renewalDate: item.renewalDate || '',
  eventDate: item.eventDate || '',
  monthlyCost: item.monthlyCost || '',
  traffic: item.traffic || '',
  campaign: item.campaign || '',
  campaignId: item.campaignId || '',
  graphicText: item.graphicText || '',
  graphicUrl: item.graphicUrl || '',
  contractUrl: item.contractUrl || '',
  notes: item.notes || '',
});

const MarketingLocations = () => {
  const [viewMode, setViewMode] = useState('map');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationGroupFilter] = useState('all');
  const [assetTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const [locations, setLocations] = useState([]);
  const [settingsRegions, setSettingsRegions] = useState([]);
  const [settingsOffices, setSettingsOffices] = useState([]);
  const [settingsVendors, setSettingsVendors] = useState([]);
  const [settingsActivityTypes, setSettingsActivityTypes] = useState([]);
  const [relatedData, setRelatedData] = useState({
    contracts: {},
    assets: {},
    events: {},
    tasks: {},
    notes: {},
    photos: {},
    mediaCampaigns: {},
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchRelatedData = async (locationIds) => {
    if (!locationIds.length) {
      setRelatedData({
        contracts: {},
        assets: {},
        events: {},
        tasks: {},
        notes: {},
        photos: {},
        mediaCampaigns: {},
      });
      return;
    }

    const [
      contractsResult,
      assetsResult,
      eventsResult,
      tasksResult,
      notesResult,
      photosByLocation,
      mediaCampaignsResult,
      mediaAssetsResult,
    ] = await Promise.all([
      supabase
        .from('marketing_contracts')
        .select('*')
        .in('location_id', locationIds)
        .order('end_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('marketing_assets')
        .select('*')
        .in('location_id', locationIds)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('marketing_events')
        .select('*')
        .in('location_id', locationIds)
        .order('event_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('marketing_tasks')
        .select('*')
        .in('location_id', locationIds)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('marketing_notes')
        .select('*')
        .in('location_id', locationIds)
        .order('created_at', { ascending: false }),
      getMarketingPhotosByLocations(locationIds),
      supabase
        .from('marketing_location_campaigns')
        .select('*')
        .in('location_id', locationIds)
        .order('start_date', { ascending: false, nullsFirst: false }),
      supabase
        .from('marketing_location_campaign_assets')
        .select('*')
        .in('location_id', locationIds)
        .order('sort_order', { ascending: true }),
    ]);

    const errors = [
      contractsResult.error,
      assetsResult.error,
      eventsResult.error,
      tasksResult.error,
      notesResult.error,
      mediaCampaignsResult.error,
      mediaAssetsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) throw errors[0];

    const campaignAssetsByCampaign = (mediaAssetsResult.data || []).reduce((acc, asset) => {
      if (!asset.campaign_id) return acc;
      if (!acc[asset.campaign_id]) acc[asset.campaign_id] = [];
      acc[asset.campaign_id].push(asset);
      return acc;
    }, {});

    const mediaCampaignsByLocation = groupByLocationId(
      (mediaCampaignsResult.data || []).map((campaign) => ({
        ...campaign,
        mediaAssets: campaignAssetsByCampaign[campaign.id] || [],
      }))
    );

    setRelatedData({
      contracts: groupByLocationId(contractsResult.data || []),
      assets: groupByLocationId(assetsResult.data || []),
      events: groupByLocationId(eventsResult.data || []),
      tasks: groupByLocationId(tasksResult.data || []),
      notes: groupByLocationId(notesResult.data || []),
      photos: photosByLocation || {},
      mediaCampaigns: mediaCampaignsByLocation,
    });
  };

  const fetchLocations = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [locationsResult, regionsResult, officesResult, vendorsResult, activityTypesResult] =
        await Promise.all([
          supabase.from('marketing_locations').select('*').order('created_at', { ascending: false }),
          supabase.from('marketing_regions').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
          supabase.from('marketing_offices_with_regions').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('office_code', { ascending: true }),
          supabase.from('marketing_vendors').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('vendor_name', { ascending: true }),
          supabase.from('marketing_activity_types').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('label', { ascending: true }),
        ]);

      const firstError = [
        locationsResult.error,
        regionsResult.error,
        officesResult.error,
        vendorsResult.error,
        activityTypesResult.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      const mapped = (locationsResult.data || []).map(dbToLocation);
      setLocations(mapped);
      setSettingsRegions(regionsResult.data || []);
      setSettingsOffices(officesResult.data || []);
      setSettingsVendors(vendorsResult.data || []);
      setSettingsActivityTypes(activityTypesResult.data || []);

      await fetchRelatedData(mapped.map((item) => item.id));

      if (!selectedId) {
        const firstOffice = (officesResult.data || [])[0];
        const firstSelectableId = mapped[0]?.id || (firstOffice?.id ? `settings-office:${firstOffice.id}` : null);
        if (firstSelectableId) setSelectedId(firstSelectableId);
      }
    } catch (error) {
      console.error('Error loading marketing data/settings:', error);
      setLoadError(error?.message || 'Could not load marketing data.');
      setLocations([]);
      setSettingsRegions([]);
      setSettingsOffices([]);
      setSettingsVendors([]);
      setSettingsActivityTypes([]);
      setRelatedData({
        contracts: {}, assets: {}, events: {}, tasks: {}, notes: {}, photos: {}, mediaCampaigns: {},
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regionOptions = useMemo(() => {
    const names = settingsRegions.map((region) => region.name).filter(Boolean);
    return names.length > 0 ? names : FALLBACK_REGION_OPTIONS;
  }, [settingsRegions]);

  const vendorOptions = useMemo(
    () => settingsVendors.map((vendor) => vendor.vendor_name).filter(Boolean),
    [settingsVendors]
  );

  const typeOptions = useMemo(() => {
    const configured = settingsActivityTypes
      .filter((activityType) => activityType.key !== 'office')
      .map((activityType) => ({
        value: activityType.key,
        label: activityType.label,
        icon: activityType.icon_key === 'billboard' ? '📍' : activityType.icon_key === 'dmv' ? '📺' : '📣',
        mapMode: activityType.map_behavior === 'area' ? 'area' : activityType.map_behavior === 'none' ? 'none' : 'physical',
      }));

    return configured.length > 0
      ? configured
      : FALLBACK_TYPE_OPTIONS.filter((option) => option.value !== 'office');
  }, [settingsActivityTypes]);

  const settingsOfficeLocations = useMemo(
    () => settingsOffices.map((office) => ({
      id: `settings-office:${office.id}`,
      settingsOfficeId: office.id,
      sourceId: office.id,
      sourceType: 'office',
      source: 'settings_office',
      type: 'office',
      name: office.office_name || office.office_code || 'Office',
      office: office.office_code || '',
      city: office.city || '',
      region: office.region_name || '',
      status: 'active',
      address: office.address || '',
      lat: office.latitude,
      lng: office.longitude,
      streetviewLat: office.streetview_lat,
      streetviewLng: office.streetview_lng,
      streetviewHeading: office.streetview_heading,
      streetviewPitch: office.streetview_pitch,
      streetviewZoom: office.streetview_zoom,
      contactPhone: office.phone || '',
      notes: office.notes || '',
      monthlyCost: 0,
      photos: [],
      primaryPhoto: null,
    })),
    [settingsOffices]
  );

  const enrichedLocations = useMemo(() => {
    return locations.map((location) => {
      const contracts = relatedData.contracts[location.id] || [];
      const events = relatedData.events[location.id] || [];
      const photos = relatedData.photos[location.id] || [];
      const primaryPhoto = photos.find((photo) => photo.isPrimary) || photos[0] || null;

      const activeContract =
        contracts.find((contract) => contract.status === 'active') || contracts[0];

      const nextEvent = events.find((event) => {
        const days = getDaysUntil(event.event_date);
        return days !== null && days >= 0;
      });

      const merged = {
        ...location,
        contractStart: activeContract?.start_date || location.contractStart,
        contractEnd: activeContract?.end_date || location.contractEnd,
        renewalDate: activeContract?.renewal_date || location.renewalDate,
        monthlyCost: Number(activeContract?.monthly_cost ?? location.monthlyCost ?? 0),
        contractUrl: activeContract?.contract_pdf || location.contractUrl,
        vendor: activeContract?.vendor || location.vendor,
        eventDate: nextEvent?.event_date || location.eventDate,
        photos,
        primaryPhoto,
        primaryPhotoUrl: primaryPhoto?.photoUrl || location.photoUrl || location.graphicUrl || '',
        photoUrl: primaryPhoto?.photoUrl || location.photoUrl || '',
      };

      return {
        ...merged,
        status: calculateAutoStatus(merged),
      };
    });
  }, [locations, relatedData]);

  const displayLocations = useMemo(() => {
    const settingsOfficeCodes = new Set(
      settingsOfficeLocations
        .map((office) => String(office.office || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const marketingRows = enrichedLocations.filter((location) => {
      if (location.type !== 'office') return true;
      const code = String(location.office || location.name || '').trim().toLowerCase();
      return !code || !settingsOfficeCodes.has(code);
    });

    return [...settingsOfficeLocations, ...marketingRows];
  }, [enrichedLocations, settingsOfficeLocations]);

  const filteredLocations = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return displayLocations.filter((item) => {
      const mediaCampaigns = relatedData.mediaCampaigns[item.id] || [];
      const campaignSearchText = mediaCampaigns
        .flatMap((campaign) => [
          campaign.campaign_name,
          campaign.vendor,
          campaign.market_name,
          campaign.network_name,
          campaign.area_label,
          campaign.notes,
        ])
        .filter(Boolean)
        .join(' ');

      const haystack = [
        item.name,
        item.city,
        item.region,
        item.office,
        item.vendor,
        item.campaign,
        getTypeMeta(item.type).label,
        item.type,
        item.status,
        item.address,
        campaignSearchText,
      ].join(' ').toLowerCase();

      const matchesSearch = !searchText || haystack.includes(searchText);
      const matchesRegion = regionFilter === 'all' || item.region === regionFilter;
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesRegion && matchesType && matchesStatus;
    });
  }, [displayLocations, relatedData.mediaCampaigns, search, regionFilter, typeFilter, statusFilter]);

  const activityTypeMetaByKey = useMemo(() => {
    return typeOptions.reduce((acc, option) => {
      acc[option.value] = option;
      return acc;
    }, {});
  }, [typeOptions]);

  const isConfiguredAreaType = (type) =>
    activityTypeMetaByKey[type]?.mapMode === 'area' ||
    (!activityTypeMetaByKey[type] && isAreaOnlyType(type));

  const isConfiguredNoMapType = (type) =>
    activityTypeMetaByKey[type]?.mapMode === 'none';

  const mapLocations = useMemo(
    () =>
      filteredLocations.filter((item) => {
        const mapMode = activityTypeMetaByKey[item.type]?.mapMode;
        const isArea =
          mapMode === 'area' ||
          (!activityTypeMetaByKey[item.type] && isAreaOnlyType(item.type));
        const isNoMap = mapMode === 'none';

        return !isArea && !isNoMap;
      }),
    [filteredLocations, activityTypeMetaByKey]
  );

  const areaCampaignLocations = useMemo(
    () =>
      filteredLocations.filter((item) => {
        const mapMode = activityTypeMetaByKey[item.type]?.mapMode;
        return (
          mapMode === 'area' ||
          (!activityTypeMetaByKey[item.type] && isAreaOnlyType(item.type))
        );
      }),
    [filteredLocations, activityTypeMetaByKey]
  );

  const selectedLocation = useMemo(() => {
    return filteredLocations.find((item) => item.id === selectedId) || filteredLocations[0] || null;
  }, [filteredLocations, selectedId]);

  const selectedMapLocation = useMemo(() => {
    if (selectedLocation) {
      const mapMode = activityTypeMetaByKey[selectedLocation.type]?.mapMode;
      const isArea =
        mapMode === 'area' ||
        (!activityTypeMetaByKey[selectedLocation.type] &&
          isAreaOnlyType(selectedLocation.type));
      const isNoMap = mapMode === 'none';

      if (!isArea && !isNoMap) {
        return selectedLocation;
      }
    }

    return mapLocations[0] || null;
  }, [selectedLocation, mapLocations, activityTypeMetaByKey]);

  useEffect(() => {
    if (selectedLocation?.id && selectedLocation.id !== selectedId) {
      setSelectedId(selectedLocation.id);
    }
  }, [selectedLocation, selectedId]);

  const selectedRelated = useMemo(() => {
    const locationId = selectedLocation?.id;

    if (!locationId) {
      return {
        contracts: [],
        assets: [],
        events: [],
        tasks: [],
        notes: [],
        photos: [],
        mediaCampaigns: [],
      };
    }

    return {
      contracts: relatedData.contracts[locationId] || [],
      assets: relatedData.assets[locationId] || [],
      events: relatedData.events[locationId] || [],
      tasks: relatedData.tasks[locationId] || [],
      notes: relatedData.notes[locationId] || [],
      photos: relatedData.photos[locationId] || [],
      mediaCampaigns: relatedData.mediaCampaigns[locationId] || [],
    };
  }, [selectedLocation, relatedData]);

  const mapSelectedRelated = useMemo(() => {
    const locationId = selectedMapLocation?.id;
    if (!locationId) {
      return {
        contracts: [], assets: [], events: [], tasks: [], notes: [], photos: [], mediaCampaigns: [],
      };
    }
    return {
      contracts: relatedData.contracts[locationId] || [],
      assets: relatedData.assets[locationId] || [],
      events: relatedData.events[locationId] || [],
      tasks: relatedData.tasks[locationId] || [],
      notes: relatedData.notes[locationId] || [],
      photos: relatedData.photos[locationId] || [],
      mediaCampaigns: relatedData.mediaCampaigns[locationId] || [],
    };
  }, [selectedMapLocation, relatedData]);

  const kpis = useMemo(() => {
    const activeBillboards = enrichedLocations.filter(
      (item) => item.type === 'billboard' && item.status === 'active'
    ).length;

    const renewalSoon = enrichedLocations.filter((item) => item.status === 'renewal').length;
    const expired = enrichedLocations.filter((item) => item.status === 'expired').length;

    const upcomingEvents = Object.values(relatedData.events)
      .flat()
      .filter((event) => {
        const days = getDaysUntil(event.event_date);
        return days !== null && days >= 0 && days <= 90;
      }).length;

    const monthlySpend = enrichedLocations.reduce((sum, item) => {
      if (['dmv_video', 'tv_commercial', 'geofencing'].includes(item.type)) {
        const campaigns = relatedData.mediaCampaigns[item.id] || [];
        const activeCampaignSpend = campaigns
          .filter((campaign) => campaign.status === 'active')
          .reduce((campaignSum, campaign) => campaignSum + Number(campaign.monthly_cost || 0), 0);
        return sum + activeCampaignSpend;
      }
      return sum + Number(item.monthlyCost || 0);
    }, 0);

    const officesWithMarketing = new Set(
      enrichedLocations
        .filter((item) => item.office && item.status !== 'expired')
        .map((item) => item.office)
    );

    const officesTotal = new Set(
      settingsOffices.map((office) => office.office_code).filter(Boolean)
    );

    const openTasks = Object.values(relatedData.tasks)
      .flat()
      .filter((task) => !task.completed).length;

    const coverageScore =
      officesTotal.size > 0
        ? Math.round((officesWithMarketing.size / officesTotal.size) * 100)
        : 0;

    return {
      activeBillboards,
      monthlySpend,
      renewalSoon,
      expired,
      upcomingEvents,
      openTasks,
      coverageScore,
    };
  }, [enrichedLocations, relatedData, settingsOffices]);

  const calendarItems = useMemo(() => {
    const locationCalendarItems = filteredLocations
      .map((item) => ({
        id: `location-${item.id}`,
        locationId: item.id,
        name: item.name,
        status: item.status,
        date: item.eventDate || item.renewalDate || item.contractEnd,
      }))
      .filter((item) => item.date?.startsWith('2026-07'));

    const eventCalendarItems = Object.entries(relatedData.events)
      .flatMap(([locationId, events]) => {
        const location = enrichedLocations.find((item) => item.id === locationId);
        return events.map((event) => ({
          id: `event-${event.id}`,
          locationId,
          name: event.title || location?.name || 'Marketing Event',
          status: event.completed ? 'active' : 'planned',
          date: event.event_date,
        }));
      })
      .filter((item) => item.date?.startsWith('2026-07'));

    const taskCalendarItems = Object.entries(relatedData.tasks)
      .flatMap(([locationId, tasks]) => {
        const location = enrichedLocations.find((item) => item.id === locationId);
        return tasks.map((task) => ({
          id: `task-${task.id}`,
          locationId,
          name: task.title || location?.name || 'Marketing Task',
          status: task.completed ? 'active' : 'renewal',
          date: task.due_date,
        }));
      })
      .filter((item) => item.date?.startsWith('2026-07'));

    return [...locationCalendarItems, ...eventCalendarItems, ...taskCalendarItems];
  }, [filteredLocations, relatedData, enrichedLocations]);

  const handleSelectLocation = (item) => {
    if (!item?.id) return;
    setSelectedId(item.id);
  };

  const handleOpenFromCalendar = (item) => {
    if (!item?.id) return;
    setSelectedId(item.id);
    setViewMode(isConfiguredAreaType(item.type) || isConfiguredNoMapType(item.type) ? 'list' : 'map');
  };

  const handleViewOnMap = (item) => {
    if (!item?.id || isConfiguredAreaType(item.type) || isConfiguredNoMapType(item.type)) return;
    setSelectedId(item.id);
    setViewMode('map');
  };

  const openCreateForm = () => {
    setEditingLocation(null);
    setFormData({
      ...EMPTY_FORM,
      region: regionOptions[0] || EMPTY_FORM.region,
      type: typeOptions[0]?.value || EMPTY_FORM.type,
    });
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (item) => {
    setEditingLocation(item);
    setFormData(locationToForm(item));
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setShowForm(false);
    setEditingLocation(null);
    setFormData(EMPTY_FORM);
    setFormError('');
  };

  const updateForm = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const uploadMarketingPhoto = async (file) => {
    if (!file) return '';

    const fileExt = file.name.split('.').pop() || 'jpg';
    const safeName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    const filePath = `locations/${Date.now()}-${safeName || 'marketing-photo'}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('marketing-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('marketing-assets')
      .getPublicUrl(filePath);

    return data?.publicUrl || '';
  };

  const handleSaveLocation = async (event, submittedFormData = formData) => {
    event.preventDefault();

    // The modal keeps its own local draft so typing does not rerender the
    // entire Marketing page/map on every keystroke. Use that draft here.
    const activeFormData = submittedFormData || formData;

    if (!activeFormData.name.trim()) {
      setFormError('Location name is required.');
      return;
    }

    if (!activeFormData.city.trim()) {
      setFormError('City is required.');
      return;
    }

    if ((activeFormData.lat && !activeFormData.lng) || (!activeFormData.lat && activeFormData.lng)) {
      setFormError('Latitude and longitude must both be filled in, or both left blank.');
      return;
    }

    if (activeFormData.lat || activeFormData.lng) {
      const latitude = Number(activeFormData.lat);
      const longitude = Number(activeFormData.lng);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        setFormError('Latitude must be a valid number between -90 and 90.');
        return;
      }

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setFormError('Longitude must be a valid number between -180 and 180.');
        return;
      }
    }

    setIsSaving(true);
    setFormError('');

    try {
      let nextFormData = { ...activeFormData };

      if (activeFormData.photoFile) {
        const uploadedPhotoUrl = await uploadMarketingPhoto(activeFormData.photoFile);
        nextFormData = {
          ...nextFormData,
          photoUrl: uploadedPhotoUrl || nextFormData.photoUrl,
          graphicUrl: uploadedPhotoUrl || nextFormData.graphicUrl,
        };
      }

      const payload = locationToDb(nextFormData);

      if (editingLocation?.id) {
        const { data, error } = await supabase
          .from('marketing_locations')
          .update(payload)
          .eq('id', editingLocation.id)
          .select()
          .single();

        if (error) throw error;

        const updated = dbToLocation(data);

        setLocations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedId(updated.id);
      } else {
        const { data, error } = await supabase
          .from('marketing_locations')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        const created = dbToLocation(data);

        setLocations((prev) => [created, ...prev]);
        setSelectedId(created.id);
      }

      closeForm();
      await fetchLocations();
    } catch (error) {
      console.error('Error saving marketing location:', error);
      setFormError(error?.message || 'Could not save marketing location.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLocation = async (item) => {
    if (!item?.id) return;

    const confirmed = window.confirm(`Delete "${item.name}" from Marketing Operations?`);
    if (!confirmed) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('marketing_locations')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      setLocations((prev) => prev.filter((location) => location.id !== item.id));

      if (selectedId === item.id) {
        const nextLocation = locations.find((location) => location.id !== item.id);
        setSelectedId(nextLocation?.id || null);
      }

      await fetchLocations();
    } catch (error) {
      console.error('Error deleting marketing location:', error);
      alert(error?.message || 'Could not delete marketing location.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddContract = async (locationId, form) => {
    const payload = {
      location_id: locationId,
      vendor: form.vendor?.trim() || null,
      contract_number: form.contractNumber?.trim() || null,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      renewal_date: form.renewalDate || null,
      monthly_cost: Number(form.monthlyCost || 0),
      annual_cost: Number(form.annualCost || 0),
      contract_pdf: form.contractPdf?.trim() || null,
      signed_by: form.signedBy?.trim() || null,
      status: form.status || 'active',
      notes: form.notes?.trim() || null,
    };

    // If this is a renewal/new active contract, close out any prior active
    // contract rows first so the newest active contract becomes the source
    // used by the dashboard.
    if (payload.status === 'active') {
      const { error: closeError } = await supabase
        .from('marketing_contracts')
        .update({ status: 'expired' })
        .eq('location_id', locationId)
        .eq('status', 'active');

      if (closeError) throw closeError;
    }

    const { error } = await supabase
      .from('marketing_contracts')
      .insert(payload);

    if (error) throw error;

    // Keep the main marketing_locations record synchronized with the newest
    // contract so list/map status and pricing also refresh correctly.
    if (payload.status === 'active') {
      const { error: locationUpdateError } = await supabase
        .from('marketing_locations')
        .update({
          vendor: payload.vendor,
          contract_start: payload.start_date,
          contract_end: payload.end_date,
          renewal_date: payload.renewal_date,
          monthly_cost: payload.monthly_cost,
          contract_url: payload.contract_pdf,
          status: 'active',
        })
        .eq('id', locationId);

      if (locationUpdateError) throw locationUpdateError;
    }

    await fetchLocations();
  };

  const handleAddAsset = async (locationId, form) => {
    const payload = {
      location_id: locationId,
      asset_type: form.assetType || 'billboard_graphic',
      title: form.title?.trim() || 'Marketing Asset',
      file_url: form.fileUrl?.trim() || null,
      thumbnail_url: form.thumbnailUrl?.trim() || null,
    };

    const { error } = await supabase.from('marketing_assets').insert(payload);
    if (error) throw error;
    await fetchLocations();
  };

  const handleAddEvent = async (locationId, item, form) => {
    const payload = {
      location_id: locationId,
      office: item.office || null,
      region: item.region || null,
      title: form.title?.trim() || 'Marketing Event',
      description: form.description?.trim() || null,
      event_date: form.eventDate || null,
      end_date: form.endDate || null,
      organizer: form.organizer?.trim() || null,
      estimated_cost: Number(form.estimatedCost || 0),
      completed: !!form.completed,
      notes: form.notes?.trim() || null,
    };

    const { error } = await supabase.from('marketing_events').insert(payload);
    if (error) throw error;
    await fetchLocations();
  };

  const handleAddTask = async (locationId, form) => {
    const payload = {
      location_id: locationId,
      assigned_to: form.assignedTo?.trim() || null,
      priority: form.priority || 'Medium',
      title: form.title?.trim() || 'Marketing Task',
      description: form.description?.trim() || null,
      due_date: form.dueDate || null,
      completed: !!form.completed,
    };

    const { error } = await supabase.from('marketing_tasks').insert(payload);
    if (error) throw error;
    await fetchLocations();
  };

  const handleAddNote = async (locationId, form) => {
    const payload = {
      location_id: locationId,
      author: form.author?.trim() || 'Admin',
      note: form.note?.trim() || '',
    };

    if (!payload.note) throw new Error('Note cannot be blank.');

    const { error } = await supabase.from('marketing_notes').insert(payload);
    if (error) throw error;
    await fetchLocations();
  };

  const handleToggleTask = async (task) => {
    const nextCompleted = !task.completed;

    const { error } = await supabase
      .from('marketing_tasks')
      .update({
        completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null,
      })
      .eq('id', task.id);

    if (error) {
      alert(error.message || 'Could not update task.');
      return;
    }

    await fetchLocations();
  };

  const handlePhotosChange = (locationId, photos = []) => {
    if (!locationId) return;

    const primaryPhoto = photos.find((photo) => photo.isPrimary) || photos[0] || null;

    setRelatedData((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [locationId]: photos,
      },
    }));

    if (primaryPhoto?.photoUrl) {
      setLocations((prev) =>
        prev.map((location) =>
          location.id === locationId
            ? { ...location, photoUrl: primaryPhoto.photoUrl }
            : location
        )
      );
    }
  };

  const uploadMarketingMediaFile = async (file, locationId) => {
    if (!file) return '';

    const fileExt = file.name.split('.').pop() || 'bin';
    const safeName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    const filePath = `campaigns/${locationId}/${Date.now()}-${safeName || 'media'}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('marketing-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('marketing-assets')
      .getPublicUrl(filePath);

    return data?.publicUrl || '';
  };

  const handleAddMediaCampaign = async (locationId, form) => {
    const payload = {
      location_id: locationId,
      campaign_name: form.campaignName?.trim() || 'Marketing Campaign',
      campaign_type: form.campaignType || 'dmv_video',
      status: form.status || 'active',
      vendor: form.vendor?.trim() || null,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      renewal_date: form.renewalDate || null,
      monthly_cost: Number(form.monthlyCost || 0),
      total_cost: Number(form.totalCost || 0),
      contract_url: form.contractUrl?.trim() || null,
      market_name: form.marketName?.trim() || null,
      network_name: form.networkName?.trim() || null,
      spots_purchased: form.spotsPurchased ? Number(form.spotsPurchased) : null,
      area_label: form.areaLabel?.trim() || null,
      radius_miles: form.radiusMiles ? Number(form.radiusMiles) : null,
      notes: form.notes?.trim() || null,
    };

    const { data: campaign, error } = await supabase
      .from('marketing_location_campaigns')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    const files = Array.from(form.files || []);
    const assetRows = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileUrl = await uploadMarketingMediaFile(file, locationId);
      assetRows.push({
        campaign_id: campaign.id,
        location_id: locationId,
        asset_type: file.type?.startsWith('video/') ? 'video' : 'image',
        title: file.name,
        file_url: fileUrl,
        sort_order: index,
      });
    }

    if (assetRows.length > 0) {
      const { error: assetError } = await supabase
        .from('marketing_location_campaign_assets')
        .insert(assetRows);
      if (assetError) throw assetError;
    }

    await fetchLocations();
  };

  const handleDeleteMediaCampaign = async (campaignId) => {
    const confirmed = window.confirm('Delete this campaign and its media assets?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('marketing_location_campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) throw error;
    await fetchLocations();
  };

  const handleDeleteRelatedRow = async (table, id) => {
    const confirmed = window.confirm('Delete this item?');
    if (!confirmed) return;

    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) {
      alert(error.message || 'Could not delete item.');
      return;
    }

    await fetchLocations();
  };


  return (
    <main className={styles.mainContent}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Marketing Operations Center</h1>
          <p>Track billboards, community events, campaigns, contracts, renewals, and office coverage.</p>
        </div>

        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryBtn} onClick={fetchLocations}>
            Refresh
          </button>
          <button type="button" className={styles.secondaryBtn}>
            Export
          </button>
          <button type="button" className={styles.primaryBtn} onClick={openCreateForm}>
            + Add Marketing
          </button>
        </div>
      </div>

      {loadError && (
        <div className={styles.errorBanner}>
          {loadError}
        </div>
      )}

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Active Billboards</span>
          <strong>{kpis.activeBillboards}</strong>
          <small>Static + digital locations</small>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Monthly Spend</span>
          <strong>{formatCurrency(kpis.monthlySpend)}</strong>
          <small>Billboards + contracts</small>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Renewal Soon</span>
          <strong className={styles.warningText}>{kpis.renewalSoon}</strong>
          <small>Contracts needing review</small>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Expired</span>
          <strong className={styles.dangerText}>{kpis.expired}</strong>
          <small>Action needed</small>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Upcoming Events</span>
          <strong className={styles.purpleText}>{kpis.upcomingEvents}</strong>
          <small>Next 90 days</small>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Open Tasks</span>
          <strong className={styles.successText}>{kpis.openTasks}</strong>
          <small>Marketing follow-ups</small>
        </div>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search location, market, station, target area, vendor..."
          />

          <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
            <option value="all">All Regions</option>
            {regionOptions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All Layers</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.viewToggle}>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={viewMode === 'map' ? styles.activeToggle : ''}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={viewMode === 'list' ? styles.activeToggle : ''}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={viewMode === 'calendar' ? styles.activeToggle : ''}
          >
            Calendar
          </button>
        </div>
      </section>

      {isLoading ? (
        <section className={styles.card}>
          <div className={styles.emptyState}>Loading marketing data...</div>
        </section>
      ) : (
        <>
          {viewMode === 'map' && (
            <section className={styles.mapLayout}>
              <MarketingMap
                locations={mapLocations}
                selectedLocation={selectedMapLocation}
                onLocationSelect={handleSelectLocation}
                isLoading={isLoading}
            activeLocationGroupFilter={locationGroupFilter}
            activeAssetTypeFilter={assetTypeFilter}
                height={600}
              />

              <MarketingSidebar
                selectedLocation={selectedMapLocation}
                locations={mapLocations}
                related={mapSelectedRelated}
                onLocationSelect={handleSelectLocation}
                onEdit={openEditForm}
                onDelete={handleDeleteLocation}
                onAddContract={handleAddContract}
                onAddAsset={handleAddAsset}
                onAddEvent={handleAddEvent}
                onAddTask={handleAddTask}
                onAddNote={handleAddNote}
                onToggleTask={handleToggleTask}
                onDeleteRelatedRow={handleDeleteRelatedRow}
                onPhotosChange={handlePhotosChange}
                onAddMediaCampaign={handleAddMediaCampaign}
                onDeleteMediaCampaign={handleDeleteMediaCampaign}

              />
            </section>
          )}

          {viewMode === 'list' && (
            <section className={styles.mapLayout}>
              <div className={styles.card} style={{ minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '14px 16px',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', color: '#0f172a' }}>
                      Marketing Directory
                    </strong>
                    <small style={{ color: '#64748b', fontWeight: 800 }}>
                      {mapLocations.length} physical/map locations • {areaCampaignLocations.length} area campaigns
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ background: '#e0f2fe', color: '#075985', borderRadius: 999, padding: '5px 8px', fontSize: 10, fontWeight: 900 }}>
                      📍 Physical
                    </span>
                    <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 999, padding: '5px 8px', fontSize: 10, fontWeight: 900 }}>
                      ◉ Area / Market
                    </span>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Name / Channel</th>
                        <th>Coverage</th>
                        <th>Status</th>
                        <th>Campaigns</th>
                        <th>Monthly Spend</th>
                        <th>Renewal / Event</th>
                        <th>Map</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLocations.length === 0 ? (
                        <tr>
                          <td colSpan="7">No marketing records match the selected filters.</td>
                        </tr>
                      ) : (
                        filteredLocations.map((item) => {
                          const status = getStatus(item.status);
                          const typeMeta = getTypeMeta(item.type);
                          const mediaCampaigns = relatedData.mediaCampaigns[item.id] || [];
                          const activeMediaCampaigns = mediaCampaigns.filter((campaign) => campaign.status === 'active');
                          const campaignCount = mediaCampaigns.length;
                          const activeCampaignCount = activeMediaCampaigns.length;
                          const mediaMonthlySpend = activeMediaCampaigns.reduce(
                            (sum, campaign) => sum + Number(campaign.monthly_cost || 0),
                            0
                          );
                          const monthlySpend = ['dmv_video', 'tv_commercial', 'geofencing'].includes(item.type)
                            ? mediaMonthlySpend
                            : Number(item.monthlyCost || 0);

                          const primaryCampaign =
                            activeMediaCampaigns[0] || mediaCampaigns[0] || null;

                          const coverageLabel = item.type === 'tv_commercial'
                            ? primaryCampaign?.market_name || item.address || item.region || 'Area-based'
                            : item.type === 'geofencing'
                              ? [primaryCampaign?.area_label || item.address, primaryCampaign?.radius_miles ? `${primaryCampaign.radius_miles} mi radius` : '']
                                  .filter(Boolean)
                                  .join(' • ') || 'Area-based'
                              : item.type === 'dmv_video'
                                ? item.address || item.city || 'Physical DMV location'
                                : item.office || item.city || item.address || item.region || '—';

                          const renewalDate =
                            primaryCampaign?.renewal_date ||
                            item.eventDate ||
                            item.renewalDate ||
                            item.contractEnd ||
                            '—';

                          const canMap = !isAreaOnlyType(item.type) && hasMapCoordinates(item);
                          const isSelected = selectedLocation?.id === item.id;

                          return (
                            <tr
                              key={item.id}
                              onClick={() => handleSelectLocation(item)}
                              style={{
                                cursor: 'pointer',
                                background: isSelected ? '#f0f9ff' : undefined,
                              }}
                            >
                              <td>
                                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: 18, lineHeight: 1 }}>{typeMeta.icon}</span>
                                  <div>
                                    <strong>{item.name}</strong>
                                    <small>{typeMeta.label} • {item.region || item.city || '—'}</small>
                                    <small style={{ color: typeMeta.mapMode === 'area' ? '#7c3aed' : '#0284c7' }}>
                                      {typeMeta.mapMode === 'area' ? 'Area / market campaign' : 'Physical location'}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td>{coverageLabel}</td>
                              <td>
                                <span className={`${styles.statusPill} ${styles[status.className]}`}>
                                  {status.label}
                                </span>
                              </td>
                              <td>
                                {['dmv_video', 'tv_commercial', 'geofencing'].includes(item.type) ? (
                                  <div>
                                    <strong>{campaignCount}</strong>
                                    <small>{activeCampaignCount} active</small>
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>{formatCurrency(monthlySpend)}</td>
                              <td>{renewalDate}</td>
                              <td>
                                {canMap ? (
                                  <button
                                    type="button"
                                    className={styles.secondaryBtn}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleViewOnMap(item);
                                    }}
                                    style={{ padding: '6px 8px', fontSize: 10 }}
                                  >
                                    View Map
                                  </button>
                                ) : (
                                  <span style={{ color: '#7c3aed', fontSize: 10, fontWeight: 900 }}>
                                    {isAreaOnlyType(item.type) ? 'List / area' : 'No coordinates'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <MarketingSidebar
                selectedLocation={selectedLocation}
                locations={filteredLocations}
                related={selectedRelated}
                onLocationSelect={handleSelectLocation}
                onEdit={openEditForm}
                onDelete={handleDeleteLocation}
                onAddContract={handleAddContract}
                onAddAsset={handleAddAsset}
                onAddEvent={handleAddEvent}
                onAddTask={handleAddTask}
                onAddNote={handleAddNote}
                onToggleTask={handleToggleTask}
                onDeleteRelatedRow={handleDeleteRelatedRow}
                onPhotosChange={handlePhotosChange}
                onAddMediaCampaign={handleAddMediaCampaign}
                onDeleteMediaCampaign={handleDeleteMediaCampaign}
              />
            </section>
          )}

          {viewMode === 'calendar' && (
            <section className={styles.card}>
              <div className={styles.calendarHeader}>July 2026 Marketing Calendar</div>
              <div className={styles.calendarGrid}>
                {Array.from({ length: 31 }, (_, index) => {
                  const day = index + 1;
                  const dayItems = calendarItems.filter((item) => {
                    if (!item.date?.startsWith('2026-07')) return false;
                    return Number(item.date.split('-')[2]) === day;
                  });

                  return (
                    <div key={day} className={styles.calendarDay}>
                      <strong>{day}</strong>

                      {dayItems.map((item) => {
                        const status = getStatus(item.status);
                        const location = enrichedLocations.find((locationItem) => locationItem.id === item.locationId);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`${styles.calendarItem} ${styles[status.className]}`}
                            onClick={() => location && handleOpenFromCalendar(location)}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {showForm && (
        <MarketingLocationModal
          formData={formData}
          formError={formError}
          isSaving={isSaving}
          editingLocation={editingLocation}
          updateForm={updateForm}
          onClose={closeForm}
          onSubmit={handleSaveLocation}
          regionOptions={regionOptions}
          officeOptions={settingsOffices}
          vendorOptions={vendorOptions}
          vendorRecords={settingsVendors}
          typeOptions={typeOptions}
        />
      )}
    </main>
  );
};

const MarketingLocationModal = ({
  formData,
  formError,
  isSaving,
  editingLocation,
  updateForm,
  onClose,
  onSubmit,
  regionOptions = FALLBACK_REGION_OPTIONS,
  officeOptions = [],
  vendorOptions = [],
  vendorRecords = [],
  typeOptions = FALLBACK_TYPE_OPTIONS,
}) => {
  // Keep the form draft LOCAL to the modal.
  // This prevents MarketingMap / MarketingSidebar from rerendering on every
  // keystroke, which was causing inputs to repeatedly lose focus.
  const [draft, setDraft] = useState(() => ({ ...formData }));

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLocalSubmit = (event) => {
    onSubmit(event, draft);
  };

  const handleOverlayClick = (event) => {
    // Only close when the user clicks the actual dark backdrop.
    // Clicks on inputs, labels, selects, textarea controls, scrollbars,
    // date pickers, number controls, etc. must never close the modal.
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleFormKeyDown = (event) => {
    // Prevent Enter in regular form fields from accidentally submitting and
    // closing the modal while data is still being entered.
    // Textareas keep their normal Enter/new-line behavior.
    if (
      event.key === 'Enter' &&
      event.target?.tagName !== 'TEXTAREA' &&
      event.target?.tagName !== 'BUTTON'
    ) {
      event.preventDefault();
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      onMouseDown={handleOverlayClick}
    >
      <form
        className={styles.locationModal}
        onSubmit={handleLocalSubmit}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleFormKeyDown}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{editingLocation ? 'Edit Marketing Location' : 'Add Marketing Location'}</h2>
            <p>Save billboards, events, offices, sponsorships, contracts, graphics, and renewal data.</p>
          </div>

          <button type="button" onClick={onClose} className={styles.closeBtn}>
            ×
          </button>
        </div>

        {formError && (
          <div className={styles.errorBanner}>
            {formError}
          </div>
        )}

        <div className={styles.formGrid}>
          <label>
            Marketing Type
            <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            {draft.type === 'event' ? 'Event Name' : draft.type === 'office' ? 'Office / Location Name' : draft.type === 'sponsorship' ? 'Sponsorship Name' : draft.type === 'dmv_video' ? 'DMV Location Name' : draft.type === 'tv_commercial' ? 'TV Campaign / Market Name' : draft.type === 'geofencing' ? 'Geofencing Area Name' : 'Billboard Name'}
            <input
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              placeholder={draft.type === 'event' ? 'Community Event' : draft.type === 'office' ? 'CA117 Office Marketing' : draft.type === 'sponsorship' ? 'Team Sponsorship' : draft.type === 'dmv_video' ? 'Turlock DMV' : draft.type === 'tv_commercial' ? 'Central Valley TV Commercial' : draft.type === 'geofencing' ? 'Turlock Geofence Campaign' : 'Highway 99 Digital Billboard'}
            />
          </label>

          <label>
            City
            <input
              value={draft.city}
              onChange={(event) => updateDraft('city', event.target.value)}
              placeholder="Modesto"
            />
          </label>

          <label>
            Region
            <select value={draft.region} onChange={(event) => updateDraft('region', event.target.value)}>
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>

          {(['billboard', 'dmv_video'].includes(draft.type)) && (
            <label>
              Office
              <select
                value={draft.office}
                onChange={(event) => {
                  const officeCode = event.target.value;
                  const selectedOffice = officeOptions.find(
                    (office) => office.office_code === officeCode
                  );

                  updateDraft('office', officeCode);
                  if (selectedOffice?.region_name) {
                    updateDraft('region', selectedOffice.region_name);
                  }
                }}
              >
                <option value="">No office / not assigned</option>
                {draft.office && !officeOptions.some((office) => office.office_code === draft.office) && (
                  <option value={draft.office}>{draft.office} (existing)</option>
                )}
                {officeOptions.map((office) => (
                  <option key={office.id} value={office.office_code}>
                    {office.office_code}
                    {office.office_name ? ` — ${office.office_name}` : ''}
                    {office.region_name ? ` (${office.region_name})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className={styles.fullWidth}>
            {draft.type === 'billboard' ? 'Billboard Address / Cross Streets' : draft.type === 'event' ? 'Event Address / Venue' : draft.type === 'office' ? 'Office Address' : draft.type === 'dmv_video' ? 'DMV Address' : draft.type === 'tv_commercial' ? 'Market / Coverage Area' : draft.type === 'geofencing' ? 'Target Area / Description' : 'Sponsorship Location'}
            <input
              value={draft.address || ''}
              onChange={(event) => updateDraft('address', event.target.value)}
              placeholder="Street, city, or nearest cross streets"
            />
          </label>

          <label>
            Latitude
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.lat}
              onChange={(event) => updateDraft('lat', event.target.value)}
              placeholder="37.5582128"
            />
          </label>

          <label>
            Longitude
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.lng}
              onChange={(event) => updateDraft('lng', event.target.value)}
              placeholder="-120.9178763"
            />
          </label>

          {draft.type === 'billboard' && (
            <>
              <label>
                Billboard Width
                <input
                  type="number"
                  step="any"
                  value={draft.billboardWidth || ''}
                  onChange={(event) => updateDraft('billboardWidth', event.target.value)}
                  placeholder="48"
                />
              </label>

              <label>
                Billboard Height
                <input
                  type="number"
                  step="any"
                  value={draft.billboardHeight || ''}
                  onChange={(event) => updateDraft('billboardHeight', event.target.value)}
                  placeholder="14"
                />
              </label>

              <label>
                Size Unit
                <select
                  value={draft.billboardSizeUnit || 'ft'}
                  onChange={(event) => updateDraft('billboardSizeUnit', event.target.value)}
                >
                  <option value="ft">Feet</option>
                  <option value="in">Inches</option>
                  <option value="px">Pixels</option>
                  <option value="m">Meters</option>
                </select>
              </label>

              <label>
                Placement Type
                <input
                  value={draft.placementType || ''}
                  onChange={(event) => updateDraft('placementType', event.target.value)}
                  placeholder="Static, digital, wallscape, poster..."
                />
              </label>
            </>
          )}

          <label>
            {draft.type === 'event' ? 'Organizer / Vendor' : 'Vendor'}
            <select
              value={draft.vendor}
              onChange={(event) => {
                const vendorName = event.target.value;
                const vendorRecord = vendorRecords.find(
                  (vendor) => vendor.vendor_name === vendorName
                );

                updateDraft('vendor', vendorName);

                if (vendorRecord) {
                  if (vendorRecord.contact_name) {
                    updateDraft('contactName', vendorRecord.contact_name);
                  }
                  if (vendorRecord.contact_phone) {
                    updateDraft('contactPhone', vendorRecord.contact_phone);
                  }
                  if (vendorRecord.contact_email) {
                    updateDraft('contactEmail', vendorRecord.contact_email);
                  }
                }
              }}
            >
              <option value="">No vendor selected</option>
              {draft.vendor && !vendorOptions.includes(draft.vendor) && (
                <option value={draft.vendor}>{draft.vendor} (existing)</option>
              )}
              {vendorOptions.map((vendorName) => (
                <option key={vendorName} value={vendorName}>
                  {vendorName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Contact Name
            <input
              value={draft.contactName || ''}
              onChange={(event) => updateDraft('contactName', event.target.value)}
              placeholder="Vendor rep"
            />
          </label>

          <label>
            Contact Phone
            <input
              value={draft.contactPhone || ''}
              onChange={(event) => updateDraft('contactPhone', event.target.value)}
              placeholder="555-555-5555"
            />
          </label>

          <label>
            Contact Email
            <input
              value={draft.contactEmail || ''}
              onChange={(event) => updateDraft('contactEmail', event.target.value)}
              placeholder="rep@email.com"
            />
          </label>

          <label>
            {draft.type === 'event' ? 'Estimated Event Cost' : draft.type === 'sponsorship' ? 'Sponsorship Cost' : 'Monthly / Event Cost'}
            <input
              type="number"
              value={draft.monthlyCost}
              onChange={(event) => updateDraft('monthlyCost', event.target.value)}
              placeholder="1850"
            />
          </label>

          {!['event', 'dmv_video', 'tv_commercial', 'geofencing'].includes(draft.type) && (
            <>
              <label>
                Contract Start
                <input
                  type="date"
                  value={draft.contractStart}
                  onChange={(event) => updateDraft('contractStart', event.target.value)}
                />
              </label>

              <label>
                Contract End
                <input
                  type="date"
                  value={draft.contractEnd}
                  onChange={(event) => updateDraft('contractEnd', event.target.value)}
                />
              </label>

              <label>
                Renewal Date
                <input
                  type="date"
                  value={draft.renewalDate}
                  onChange={(event) => updateDraft('renewalDate', event.target.value)}
                />
              </label>
            </>
          )}

          {draft.type === 'event' && (
            <>
              <label>
                Event Date
                <input
                  type="date"
                  value={draft.eventDate}
                  onChange={(event) => updateDraft('eventDate', event.target.value)}
                />
              </label>

              <label>
                Expected Attendance
                <input
                  value={draft.traffic}
                  onChange={(event) => updateDraft('traffic', event.target.value)}
                  placeholder="500 attendees"
                />
              </label>
            </>
          )}

          {draft.type !== 'event' && (
            <label>
              {draft.type === 'billboard' ? 'Traffic / Impressions' : 'Reach / Attendance'}
              <input
                value={draft.traffic}
                onChange={(event) => updateDraft('traffic', event.target.value)}
                placeholder="91,000/day"
              />
            </label>
          )}

          <label>
            Campaign Name
            <input
              value={draft.campaign}
              onChange={(event) => updateDraft('campaign', event.target.value)}
              placeholder="Instant Placas Summer"
            />
          </label>

          <label>
            Linked Campaign
            <CampaignSelector
              value={draft.campaignId || ''}
              onChange={(value) => updateDraft('campaignId', value)}
              emptyLabel="No Linked Campaign"
            />
          </label>

          <label className={styles.fullWidth}>
            Upload Photo / Graphic
            <input
              type="file"
              accept="image/*"
              onChange={(event) => updateDraft('photoFile', event.target.files?.[0] || null)}
            />
          </label>

          {(draft.photoFile || draft.photoUrl || draft.graphicUrl) && (
            <div className={styles.fullWidth} style={{ display: 'grid', gap: 8 }}>
              <strong style={{ color: '#334155', fontSize: 12 }}>Photo Preview</strong>
              {draft.photoFile ? (
                <img
                  src={URL.createObjectURL(draft.photoFile)}
                  alt="Selected upload preview"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid #e2e8f0' }}
                />
              ) : (
                <img
                  src={draft.photoUrl || draft.graphicUrl}
                  alt="Marketing preview"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid #e2e8f0' }}
                />
              )}
            </div>
          )}

          <label className={styles.fullWidth}>
            Photo / Graphic URL
            <input
              value={draft.photoUrl || draft.graphicUrl}
              onChange={(event) => {
                updateDraft('photoUrl', event.target.value);
                updateDraft('graphicUrl', event.target.value);
              }}
              placeholder="https://..."
            />
          </label>

          <label className={styles.fullWidth}>
            Graphic Text
            <input
              value={draft.graphicText}
              onChange={(event) => updateDraft('graphicText', event.target.value)}
              placeholder="INSTANT! PLACAS"
            />
          </label>

          <label className={styles.fullWidth}>
            Contract URL
            <input
              value={draft.contractUrl}
              onChange={(event) => updateDraft('contractUrl', event.target.value)}
              placeholder="https://..."
            />
          </label>

          <label className={styles.fullWidth}>
            Notes
            <textarea
              value={draft.notes}
              onChange={(event) => updateDraft('notes', event.target.value)}
              placeholder={draft.type === 'billboard' ? 'Board direction, creative due dates, material specs, vendor notes...' : 'Contract terms, rep contact, renewal notes...'}
              rows={7}
              maxLength={10000}
              style={{
                minHeight: 150,
                resize: 'vertical',
              }}
            />
            <small
              style={{
                display: 'block',
                marginTop: 4,
                color: '#64748b',
                fontWeight: 700,
                fontSize: 11,
                textAlign: 'right',
              }}
            >
              {(draft.notes || '').length.toLocaleString()} / 10,000
            </small>
          </label>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
            {isSaving ? 'Saving...' : editingLocation ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MarketingLocations;