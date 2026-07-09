// src/pages/admin/marketing/MarketingLocations.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import styles from '../MarketingOps.module.css';
import MarketingMap from './components/MarketingMap';
import MarketingSidebar from './components/MarketingSidebar';
import CampaignSelector from './components/CampaignSelector';
import { splitOfficeAndMarketingLocations } from './utils/locationTypeHelpers';
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

const REGION_OPTIONS = [
  'Bay Area',
  'Cen-Cal',
  'Kern County',
  'The Valley',
  'Southern Cali',
];

const TYPE_OPTIONS = [
  { value: 'billboard', label: 'Billboard' },
  { value: 'event', label: 'Event' },
  { value: 'office', label: 'Office' },
  { value: 'sponsorship', label: 'Sponsorship' },
];

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
  const [locationGroupFilter, setLocationGroupFilter] = useState('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const [locations, setLocations] = useState([]);
  const [relatedData, setRelatedData] = useState({
    contracts: {},
    assets: {},
    events: {},
    tasks: {},
    notes: {},
    photos: {},
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
    ]);

    const errors = [
      contractsResult.error,
      assetsResult.error,
      eventsResult.error,
      tasksResult.error,
      notesResult.error,
    ].filter(Boolean);

    if (errors.length > 0) throw errors[0];

    setRelatedData({
      contracts: groupByLocationId(contractsResult.data || []),
      assets: groupByLocationId(assetsResult.data || []),
      events: groupByLocationId(eventsResult.data || []),
      tasks: groupByLocationId(tasksResult.data || []),
      notes: groupByLocationId(notesResult.data || []),
      photos: photosByLocation || {},
    });
  };

  const fetchLocations = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const { data, error } = await supabase
        .from('marketing_locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(dbToLocation);
      setLocations(mapped);

      await fetchRelatedData(mapped.map((item) => item.id));

      if (!selectedId && mapped.length > 0) {
        setSelectedId(mapped[0].id);
      }
    } catch (error) {
      console.error('Error loading marketing data:', error);
      setLoadError(error?.message || 'Could not load marketing data.');
      setLocations([]);
      setRelatedData({
        contracts: {},
        assets: {},
        events: {},
        tasks: {},
        notes: {},
        photos: {},
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const filteredLocations = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return enrichedLocations.filter((item) => {
      const haystack = [
        item.name,
        item.city,
        item.region,
        item.office,
        item.vendor,
        item.campaign,
        item.type,
        item.status,
      ].join(' ').toLowerCase();

      const matchesSearch = !searchText || haystack.includes(searchText);
      const matchesRegion = regionFilter === 'all' || item.region === regionFilter;
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesRegion && matchesType && matchesStatus;
    });
  }, [enrichedLocations, search, regionFilter, typeFilter, statusFilter]);

  const selectedLocation = useMemo(() => {
    return filteredLocations.find((item) => item.id === selectedId) || filteredLocations[0] || null;
  }, [filteredLocations, selectedId]);

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
      };
    }

    return {
      contracts: relatedData.contracts[locationId] || [],
      assets: relatedData.assets[locationId] || [],
      events: relatedData.events[locationId] || [],
      tasks: relatedData.tasks[locationId] || [],
      notes: relatedData.notes[locationId] || [],
      photos: relatedData.photos[locationId] || [],
    };
  }, [selectedLocation, relatedData]);

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

    const monthlySpend = enrichedLocations.reduce((sum, item) => sum + Number(item.monthlyCost || 0), 0);

    const officesWithMarketing = new Set(
      enrichedLocations
        .filter((item) => item.office && item.status !== 'expired')
        .map((item) => item.office)
    );

    const officesTotal = new Set(
      enrichedLocations
        .filter((item) => item.office)
        .map((item) => item.office)
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
  }, [enrichedLocations, relatedData]);

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
    setSelectedId(item.id);
    setViewMode('map');
  };

  const openCreateForm = () => {
    setEditingLocation(null);
    setFormData(EMPTY_FORM);
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

  const handleSaveLocation = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setFormError('Location name is required.');
      return;
    }

    if (!formData.city.trim()) {
      setFormError('City is required.');
      return;
    }

    if ((formData.lat && !formData.lng) || (!formData.lat && formData.lng)) {
      setFormError('Latitude and longitude must both be filled in, or both left blank.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      let nextFormData = { ...formData };

      if (formData.photoFile) {
        const uploadedPhotoUrl = await uploadMarketingPhoto(formData.photoFile);
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

    const { error } = await supabase.from('marketing_contracts').insert(payload);
    if (error) throw error;
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

  const groupedLocationCounts = useMemo(() => {
    const grouped = splitOfficeAndMarketingLocations(locations);
    return {
      offices: grouped.officeLocations.length,
      marketing: grouped.marketingAssets.length,
    };
  }, [locations]);

  const assetTypeCounts = useMemo(() => {
    return locations.reduce(
      (acc, location) => {
        if (location.type !== 'office') {
          acc.all += 1;
          acc[location.type] = (acc[location.type] || 0) + 1;
        }

        return acc;
      },
      {
        all: 0,
        billboard: 0,
        event: 0,
        sponsorship: 0,
      }
    );
  }, [locations]);

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
            placeholder="Search city, office, vendor..."
          />

          <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
            <option value="all">All Regions</option>
            {REGION_OPTIONS.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All Layers</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}s</option>
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
                locations={filteredLocations}
                selectedLocation={selectedLocation}
                onLocationSelect={handleSelectLocation}
                isLoading={isLoading}
            activeLocationGroupFilter={locationGroupFilter}
            activeAssetTypeFilter={assetTypeFilter}
                height={600}
              />

              <MarketingSidebar
                item={selectedLocation}
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
              />
            </section>
          )}

          {viewMode === 'list' && (
            <section className={styles.card}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Region</th>
                    <th>Office</th>
                    <th>Status</th>
                    <th>Renewal / Event Date</th>
                    <th>Cost</th>
                    <th>Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.length === 0 ? (
                    <tr>
                      <td colSpan="8">No marketing locations match the selected filters.</td>
                    </tr>
                  ) : (
                    filteredLocations.map((item) => {
                      const status = getStatus(item.status);
                      const tasks = relatedData.tasks[item.id] || [];
                      const openTasks = tasks.filter((task) => !task.completed).length;

                      return (
                        <tr key={item.id} onClick={() => handleSelectLocation(item)}>
                          <td>
                            <strong>{item.name}</strong>
                            <small>{item.city}</small>
                          </td>
                          <td>{item.type}</td>
                          <td>{item.region}</td>
                          <td>{item.office}</td>
                          <td>
                            <span className={`${styles.statusPill} ${styles[status.className]}`}>
                              {status.label}
                            </span>
                          </td>
                          <td>{item.eventDate || item.renewalDate || item.contractEnd || '—'}</td>
                          <td>{formatCurrency(item.monthlyCost)}</td>
                          <td>{openTasks}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
                            onClick={() => location && handleSelectLocation(location)}
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
}) => {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form className={styles.locationModal} onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
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
            <select value={formData.type} onChange={(event) => updateForm('type', event.target.value)}>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select value={formData.status} onChange={(event) => updateForm('status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            {formData.type === 'event' ? 'Event Name' : formData.type === 'office' ? 'Office / Location Name' : formData.type === 'sponsorship' ? 'Sponsorship Name' : 'Billboard Name'}
            <input
              value={formData.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder={formData.type === 'event' ? 'Community Event' : formData.type === 'office' ? 'CA117 Office Marketing' : formData.type === 'sponsorship' ? 'Team Sponsorship' : 'Highway 99 Digital Billboard'}
            />
          </label>

          <label>
            City
            <input
              value={formData.city}
              onChange={(event) => updateForm('city', event.target.value)}
              placeholder="Modesto"
            />
          </label>

          <label>
            Region
            <select value={formData.region} onChange={(event) => updateForm('region', event.target.value)}>
              {REGION_OPTIONS.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>

          {(formData.type === 'billboard' || formData.type === 'office') && (
            <label>
              Office
              <input
                value={formData.office}
                onChange={(event) => updateForm('office', event.target.value)}
                placeholder="CA117"
              />
            </label>
          )}

          <label className={styles.fullWidth}>
            {formData.type === 'billboard' ? 'Billboard Address / Cross Streets' : formData.type === 'event' ? 'Event Address / Venue' : formData.type === 'office' ? 'Office Address' : 'Sponsorship Location'}
            <input
              value={formData.address || ''}
              onChange={(event) => updateForm('address', event.target.value)}
              placeholder="Street, city, or nearest cross streets"
            />
          </label>

          <label>
            Latitude
            <input
              type="number"
              step="any"
              value={formData.lat}
              onChange={(event) => updateForm('lat', event.target.value)}
              placeholder="37.5582128"
            />
          </label>

          <label>
            Longitude
            <input
              type="number"
              step="any"
              value={formData.lng}
              onChange={(event) => updateForm('lng', event.target.value)}
              placeholder="-120.9178763"
            />
          </label>

          {formData.type === 'billboard' && (
            <>
              <label>
                Billboard Width
                <input
                  type="number"
                  step="any"
                  value={formData.billboardWidth || ''}
                  onChange={(event) => updateForm('billboardWidth', event.target.value)}
                  placeholder="48"
                />
              </label>

              <label>
                Billboard Height
                <input
                  type="number"
                  step="any"
                  value={formData.billboardHeight || ''}
                  onChange={(event) => updateForm('billboardHeight', event.target.value)}
                  placeholder="14"
                />
              </label>

              <label>
                Size Unit
                <select
                  value={formData.billboardSizeUnit || 'ft'}
                  onChange={(event) => updateForm('billboardSizeUnit', event.target.value)}
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
                  value={formData.placementType || ''}
                  onChange={(event) => updateForm('placementType', event.target.value)}
                  placeholder="Static, digital, wallscape, poster..."
                />
              </label>
            </>
          )}

          <label>
            {formData.type === 'event' ? 'Organizer' : 'Vendor / Organizer'}
            <input
              value={formData.vendor}
              onChange={(event) => updateForm('vendor', event.target.value)}
              placeholder={formData.type === 'billboard' ? 'Lamar' : 'Vendor or organizer'}
            />
          </label>

          <label>
            Contact Name
            <input
              value={formData.contactName || ''}
              onChange={(event) => updateForm('contactName', event.target.value)}
              placeholder="Vendor rep"
            />
          </label>

          <label>
            Contact Phone
            <input
              value={formData.contactPhone || ''}
              onChange={(event) => updateForm('contactPhone', event.target.value)}
              placeholder="555-555-5555"
            />
          </label>

          <label>
            Contact Email
            <input
              value={formData.contactEmail || ''}
              onChange={(event) => updateForm('contactEmail', event.target.value)}
              placeholder="rep@email.com"
            />
          </label>

          <label>
            {formData.type === 'event' ? 'Estimated Event Cost' : formData.type === 'sponsorship' ? 'Sponsorship Cost' : 'Monthly / Event Cost'}
            <input
              type="number"
              value={formData.monthlyCost}
              onChange={(event) => updateForm('monthlyCost', event.target.value)}
              placeholder="1850"
            />
          </label>

          {formData.type !== 'event' && (
            <>
              <label>
                Contract Start
                <input
                  type="date"
                  value={formData.contractStart}
                  onChange={(event) => updateForm('contractStart', event.target.value)}
                />
              </label>

              <label>
                Contract End
                <input
                  type="date"
                  value={formData.contractEnd}
                  onChange={(event) => updateForm('contractEnd', event.target.value)}
                />
              </label>

              <label>
                Renewal Date
                <input
                  type="date"
                  value={formData.renewalDate}
                  onChange={(event) => updateForm('renewalDate', event.target.value)}
                />
              </label>
            </>
          )}

          {formData.type === 'event' && (
            <>
              <label>
                Event Date
                <input
                  type="date"
                  value={formData.eventDate}
                  onChange={(event) => updateForm('eventDate', event.target.value)}
                />
              </label>

              <label>
                Expected Attendance
                <input
                  value={formData.traffic}
                  onChange={(event) => updateForm('traffic', event.target.value)}
                  placeholder="500 attendees"
                />
              </label>
            </>
          )}

          {formData.type !== 'event' && (
            <label>
              {formData.type === 'billboard' ? 'Traffic / Impressions' : 'Reach / Attendance'}
              <input
                value={formData.traffic}
                onChange={(event) => updateForm('traffic', event.target.value)}
                placeholder="91,000/day"
              />
            </label>
          )}

          <label>
            Campaign Name
            <input
              value={formData.campaign}
              onChange={(event) => updateForm('campaign', event.target.value)}
              placeholder="Instant Placas Summer"
            />
          </label>

          <label>
            Linked Campaign
            <CampaignSelector
              value={formData.campaignId || ''}
              onChange={(value) => updateForm('campaignId', value)}
              emptyLabel="No Linked Campaign"
            />
          </label>

          <label className={styles.fullWidth}>
            Upload Photo / Graphic
            <input
              type="file"
              accept="image/*"
              onChange={(event) => updateForm('photoFile', event.target.files?.[0] || null)}
            />
          </label>

          {(formData.photoFile || formData.photoUrl || formData.graphicUrl) && (
            <div className={styles.fullWidth} style={{ display: 'grid', gap: 8 }}>
              <strong style={{ color: '#334155', fontSize: 12 }}>Photo Preview</strong>
              {formData.photoFile ? (
                <img
                  src={URL.createObjectURL(formData.photoFile)}
                  alt="Selected upload preview"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid #e2e8f0' }}
                />
              ) : (
                <img
                  src={formData.photoUrl || formData.graphicUrl}
                  alt="Marketing preview"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid #e2e8f0' }}
                />
              )}
            </div>
          )}

          <label className={styles.fullWidth}>
            Photo / Graphic URL
            <input
              value={formData.photoUrl || formData.graphicUrl}
              onChange={(event) => {
                updateForm('photoUrl', event.target.value);
                updateForm('graphicUrl', event.target.value);
              }}
              placeholder="https://..."
            />
          </label>

          <label className={styles.fullWidth}>
            Graphic Text
            <input
              value={formData.graphicText}
              onChange={(event) => updateForm('graphicText', event.target.value)}
              placeholder="INSTANT! PLACAS"
            />
          </label>

          <label className={styles.fullWidth}>
            Contract URL
            <input
              value={formData.contractUrl}
              onChange={(event) => updateForm('contractUrl', event.target.value)}
              placeholder="https://..."
            />
          </label>

          <label className={styles.fullWidth}>
            Notes
            <textarea
              value={formData.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder={formData.type === 'billboard' ? 'Board direction, creative due dates, material specs, vendor notes...' : 'Contract terms, rep contact, renewal notes...'}
              rows={4}
            />
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