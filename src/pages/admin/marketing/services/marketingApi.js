// src/pages/admin/marketing/services/marketingApi.js

import { supabase } from '../../../../supabaseClient';
import {
  attachPhotosToLocations,
  dbRowToLocation,
  locationToDbPayload,
} from '../types/locationModel';
import { groupByLocationId } from '../utils/marketingHelpers';
import { uploadMarketingPhoto } from './storageService';

export const RELATED_TABLES = Object.freeze({
  CONTRACTS: 'marketing_contracts',
  ASSETS: 'marketing_assets',
  EVENTS: 'marketing_events',
  TASKS: 'marketing_tasks',
  NOTES: 'marketing_notes',
  PHOTOS: 'marketing_location_photos',
});

export const EMPTY_RELATED_DATA = Object.freeze({
  contracts: {},
  assets: {},
  events: {},
  tasks: {},
  notes: {},
  photos: {},
});

export const getEmptyRelatedData = () => ({
  contracts: {},
  assets: {},
  events: {},
  tasks: {},
  notes: {},
  photos: {},
});

const throwIfError = (error) => {
  if (error) throw error;
};

export const fetchRelatedData = async (locationIds = []) => {
  if (!locationIds.length) return getEmptyRelatedData();

  const [
    contractsResult,
    assetsResult,
    eventsResult,
    tasksResult,
    notesResult,
    photosResult,
  ] = await Promise.all([
    supabase
      .from(RELATED_TABLES.CONTRACTS)
      .select('*')
      .in('location_id', locationIds)
      .order('end_date', { ascending: true, nullsFirst: false }),
    supabase
      .from(RELATED_TABLES.ASSETS)
      .select('*')
      .in('location_id', locationIds)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from(RELATED_TABLES.EVENTS)
      .select('*')
      .in('location_id', locationIds)
      .order('event_date', { ascending: true, nullsFirst: false }),
    supabase
      .from(RELATED_TABLES.TASKS)
      .select('*')
      .in('location_id', locationIds)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from(RELATED_TABLES.NOTES)
      .select('*')
      .in('location_id', locationIds)
      .order('created_at', { ascending: false }),
    supabase
      .from(RELATED_TABLES.PHOTOS)
      .select('*')
      .in('location_id', locationIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  const errors = [
    contractsResult.error,
    assetsResult.error,
    eventsResult.error,
    tasksResult.error,
    notesResult.error,
    photosResult.error,
  ].filter(Boolean);

  if (errors.length > 0) throw errors[0];

  return {
    contracts: groupByLocationId(contractsResult.data || []),
    assets: groupByLocationId(assetsResult.data || []),
    events: groupByLocationId(eventsResult.data || []),
    tasks: groupByLocationId(tasksResult.data || []),
    notes: groupByLocationId(notesResult.data || []),
    photos: groupByLocationId(photosResult.data || []),
  };
};

export const fetchMarketingLocations = async () => {
  const { data, error } = await supabase
    .from('marketing_locations')
    .select('*')
    .order('created_at', { ascending: false });

  throwIfError(error);

  const baseLocations = (data || []).map(dbRowToLocation);
  const relatedData = await fetchRelatedData(baseLocations.map((location) => location.id));
  const locations = attachPhotosToLocations(baseLocations, relatedData.photos);

  return {
    locations,
    relatedData,
  };
};

export const createMarketingLocation = async (form) => {
  const payload = locationToDbPayload(form);

  const { data, error } = await supabase
    .from('marketing_locations')
    .insert(payload)
    .select()
    .single();

  throwIfError(error);

  let createdLocation = dbRowToLocation(data);

  if (form?.photoFile) {
    const photoUrl = await uploadMarketingPhoto({
      file: form.photoFile,
      locationId: createdLocation.id,
      photoType: createdLocation.type || 'billboard',
    });

    if (photoUrl) {
      await createLocationPhoto(createdLocation.id, {
        photoUrl,
        photoType: createdLocation.type || 'billboard',
        title: form.name || createdLocation.name || 'Marketing Photo',
        isPrimary: true,
        sortOrder: 0,
      });

      const { data: updatedData, error: updateError } = await supabase
        .from('marketing_locations')
        .update({ photo_url: photoUrl, graphic_url: photoUrl })
        .eq('id', createdLocation.id)
        .select()
        .single();

      throwIfError(updateError);
      createdLocation = dbRowToLocation(updatedData);
    }
  }

  return createdLocation;
};

export const updateMarketingLocation = async (locationId, form) => {
  const payload = locationToDbPayload(form);

  let nextPayload = { ...payload };

  if (form?.photoFile) {
    const photoUrl = await uploadMarketingPhoto({
      file: form.photoFile,
      locationId,
      photoType: form.type || 'billboard',
    });

    if (photoUrl) {
      await createLocationPhoto(locationId, {
        photoUrl,
        photoType: form.type || 'billboard',
        title: form.name || 'Marketing Photo',
        isPrimary: false,
      });

      nextPayload = {
        ...nextPayload,
        photo_url: photoUrl,
        graphic_url: photoUrl,
      };
    }
  }

  const { data, error } = await supabase
    .from('marketing_locations')
    .update(nextPayload)
    .eq('id', locationId)
    .select()
    .single();

  throwIfError(error);
  return dbRowToLocation(data);
};

export const deleteMarketingLocation = async (locationId) => {
  const { error } = await supabase
    .from('marketing_locations')
    .delete()
    .eq('id', locationId);

  throwIfError(error);
  return true;
};

export const createContract = async (locationId, form) => {
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

  const { data, error } = await supabase
    .from(RELATED_TABLES.CONTRACTS)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const createAsset = async (locationId, form) => {
  const payload = {
    location_id: locationId,
    asset_type: form.assetType || 'billboard_graphic',
    title: form.title?.trim() || 'Marketing Asset',
    file_url: form.fileUrl?.trim() || null,
    thumbnail_url: form.thumbnailUrl?.trim() || null,
  };

  const { data, error } = await supabase
    .from(RELATED_TABLES.ASSETS)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const createEvent = async (locationId, location, form) => {
  const payload = {
    location_id: locationId,
    office: location?.office || null,
    region: location?.region || null,
    title: form.title?.trim() || 'Marketing Event',
    description: form.description?.trim() || null,
    event_date: form.eventDate || null,
    end_date: form.endDate || null,
    organizer: form.organizer?.trim() || null,
    estimated_cost: Number(form.estimatedCost || 0),
    completed: !!form.completed,
    notes: form.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from(RELATED_TABLES.EVENTS)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const createTask = async (locationId, form) => {
  const payload = {
    location_id: locationId,
    assigned_to: form.assignedTo?.trim() || null,
    priority: form.priority || 'Medium',
    title: form.title?.trim() || 'Marketing Task',
    description: form.description?.trim() || null,
    due_date: form.dueDate || null,
    completed: !!form.completed,
  };

  const { data, error } = await supabase
    .from(RELATED_TABLES.TASKS)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const createNote = async (locationId, form) => {
  const payload = {
    location_id: locationId,
    author: form.author?.trim() || 'Admin',
    note: form.note?.trim() || '',
  };

  if (!payload.note) throw new Error('Note cannot be blank.');

  const { data, error } = await supabase
    .from(RELATED_TABLES.NOTES)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const updateTaskCompletion = async (task) => {
  const nextCompleted = !task.completed;

  const { data, error } = await supabase
    .from(RELATED_TABLES.TASKS)
    .update({
      completed: nextCompleted,
      completed_at: nextCompleted ? new Date().toISOString() : null,
    })
    .eq('id', task.id)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const deleteRelatedRow = async (table, id) => {
  const allowedTables = new Set(Object.values(RELATED_TABLES));

  if (!allowedTables.has(table)) {
    throw new Error(`Unsupported related table: ${table}`);
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  throwIfError(error);
  return true;
};

export const createLocationPhoto = async (locationId, form = {}) => {
  const payload = {
    location_id: locationId,
    photo_url: form.photoUrl || form.photo_url || '',
    photo_type: form.photoType || form.photo_type || 'billboard',
    title: form.title?.trim?.() || form.title || null,
    description: form.description?.trim?.() || form.description || null,
    sort_order: Number(form.sortOrder ?? form.sort_order ?? 0),
    is_primary: !!(form.isPrimary ?? form.is_primary),
  };

  if (!payload.photo_url) throw new Error('Photo URL is required.');

  if (payload.is_primary) {
    await supabase
      .from(RELATED_TABLES.PHOTOS)
      .update({ is_primary: false })
      .eq('location_id', locationId);
  }

  const { data, error } = await supabase
    .from(RELATED_TABLES.PHOTOS)
    .insert(payload)
    .select()
    .single();

  throwIfError(error);
  return data;
};

export const setPrimaryLocationPhoto = async (locationId, photoId) => {
  await supabase
    .from(RELATED_TABLES.PHOTOS)
    .update({ is_primary: false })
    .eq('location_id', locationId);

  const { data, error } = await supabase
    .from(RELATED_TABLES.PHOTOS)
    .update({ is_primary: true })
    .eq('id', photoId)
    .select()
    .single();

  throwIfError(error);

  if (data?.photo_url) {
    await supabase
      .from('marketing_locations')
      .update({ photo_url: data.photo_url, graphic_url: data.photo_url })
      .eq('id', locationId);
  }

  return data;
};

export const deleteLocationPhoto = async (photoId) => {
  const { error } = await supabase
    .from(RELATED_TABLES.PHOTOS)
    .delete()
    .eq('id', photoId);

  throwIfError(error);
  return true;
};

export const marketingApi = {
  fetchMarketingLocations,
  fetchRelatedData,
  createMarketingLocation,
  updateMarketingLocation,
  deleteMarketingLocation,
  createContract,
  createAsset,
  createEvent,
  createTask,
  createNote,
  updateTaskCompletion,
  deleteRelatedRow,
  createLocationPhoto,
  setPrimaryLocationPhoto,
  deleteLocationPhoto,
};

export default marketingApi;
