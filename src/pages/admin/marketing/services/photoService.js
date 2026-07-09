// src/pages/admin/marketing/services/photoService.js

import { supabase } from '../../../../supabaseClient';
import {
  deleteMarketingAssetByPublicUrl,
  uploadMarketingPhoto,
} from './storageService';

export const PHOTO_TYPES = Object.freeze({
  BILLBOARD: 'billboard',
  ARTWORK_PROOF: 'artwork_proof',
  DESIGN_MOCKUP: 'design_mockup',
  INSTALLATION: 'installation',
  NIGHT: 'night',
  DAMAGE: 'damage',
  MAINTENANCE: 'maintenance',
  STREET_VIEW: 'street_view',
  DRONE: 'drone',
  PERMIT: 'permit',
  CONTRACT: 'contract',
  INVOICE: 'invoice',
  PROOF: 'proof',
  GRAPHIC: 'graphic',
  OTHER: 'other',
});

const getLocationCampaignId = async (locationId) => {
  if (!locationId) return null;

  const { data, error } = await supabase
    .from('marketing_locations')
    .select('campaign_id')
    .eq('id', locationId)
    .maybeSingle();

  if (error) throw error;

  return data?.campaign_id || null;
};

export const dbToMarketingPhoto = (row = {}) => ({
  id: row.id,
  locationId: row.location_id,
  campaignId: row.campaign_id || null,
  photoUrl: row.photo_url || '',
  photoType: row.photo_type || PHOTO_TYPES.BILLBOARD,
  title: row.title || '',
  description: row.description || '',
  sortOrder: Number(row.sort_order || 0),
  isPrimary: !!row.is_primary,
  uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

export const getMarketingPhotosByLocation = async (locationId) => {
  if (!locationId) return [];

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .select('*')
    .eq('location_id', locationId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(dbToMarketingPhoto);
};

export const getMarketingPhotosByLocations = async (locationIds = []) => {
  const ids = [...new Set((locationIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .select('*')
    .in('location_id', ids)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    const photo = dbToMarketingPhoto(row);
    if (!acc[photo.locationId]) acc[photo.locationId] = [];
    acc[photo.locationId].push(photo);
    return acc;
  }, {});
};

export const getMarketingPhotoById = async (photoId) => {
  if (!photoId) return null;

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .select('*')
    .eq('id', photoId)
    .single();

  if (error) throw error;

  return dbToMarketingPhoto(data);
};

export const clearPrimaryPhotos = async (locationId) => {
  if (!locationId) return;

  const { error } = await supabase
    .from('marketing_location_photos')
    .update({ is_primary: false })
    .eq('location_id', locationId)
    .eq('is_primary', true);

  if (error) throw error;
};

export const addMarketingPhotoRecord = async ({
  locationId,
  campaignId = null,
  photoUrl,
  photoType = PHOTO_TYPES.BILLBOARD,
  title = '',
  description = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  if (!locationId) throw new Error('Missing location ID.');
  if (!photoUrl) throw new Error('Missing photo URL.');

  const resolvedCampaignId = campaignId || await getLocationCampaignId(locationId);

  if (isPrimary) {
    await clearPrimaryPhotos(locationId);
  }

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .insert({
      location_id: locationId,
      campaign_id: resolvedCampaignId || null,
      photo_url: photoUrl,
      photo_type: photoType || PHOTO_TYPES.BILLBOARD,
      title: title?.trim() || null,
      description: description?.trim() || null,
      sort_order: Number(sortOrder || 0),
      is_primary: !!isPrimary,
      uploaded_by: uploadedBy || null,
    })
    .select()
    .single();

  if (error) throw error;

  return dbToMarketingPhoto(data);
};

export const uploadAndCreateMarketingPhoto = async ({
  file,
  locationId,
  campaignId = null,
  photoType = PHOTO_TYPES.BILLBOARD,
  title = '',
  description = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  const upload = await uploadMarketingPhoto({ file, locationId, photoType });

  const photo = await addMarketingPhotoRecord({
    locationId,
    campaignId,
    photoUrl: upload.publicUrl,
    photoType,
    title: title || upload.fileName,
    description,
    sortOrder,
    isPrimary,
    uploadedBy,
  });

  return {
    ...photo,
    filePath: upload.filePath,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
  };
};

export const updateMarketingPhoto = async (photoId, changes = {}) => {
  if (!photoId) throw new Error('Missing photo ID.');

  const payload = {};

  if ('photoType' in changes) payload.photo_type = changes.photoType || PHOTO_TYPES.BILLBOARD;
  if ('title' in changes) payload.title = changes.title?.trim() || null;
  if ('description' in changes) payload.description = changes.description?.trim() || null;
  if ('sortOrder' in changes) payload.sort_order = Number(changes.sortOrder || 0);
  if ('isPrimary' in changes) payload.is_primary = !!changes.isPrimary;
  if ('campaignId' in changes) payload.campaign_id = changes.campaignId || null;

  if (Object.keys(payload).length === 0) {
    return getMarketingPhotoById(photoId);
  }

  if (payload.is_primary) {
    const current = await getMarketingPhotoById(photoId);
    if (current?.locationId) await clearPrimaryPhotos(current.locationId);
  }

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .update(payload)
    .eq('id', photoId)
    .select()
    .single();

  if (error) throw error;

  return dbToMarketingPhoto(data);
};

export const setPrimaryMarketingPhoto = async (photoId) => {
  const photo = await getMarketingPhotoById(photoId);
  if (!photo) throw new Error('Photo not found.');

  await clearPrimaryPhotos(photo.locationId);

  return updateMarketingPhoto(photoId, { isPrimary: true });
};

export const moveMarketingPhoto = async (photoId, direction = 'up') => {
  const photo = await getMarketingPhotoById(photoId);
  if (!photo) throw new Error('Photo not found.');

  const photos = await getMarketingPhotosByLocation(photo.locationId);
  const currentIndex = photos.findIndex((item) => item.id === photoId);

  if (currentIndex === -1) return photos;

  const targetIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;

  if (targetIndex < 0 || targetIndex >= photos.length) {
    return photos;
  }

  const currentPhoto = photos[currentIndex];
  const targetPhoto = photos[targetIndex];

  const currentSortOrder = currentPhoto.sortOrder ?? currentIndex;
  const targetSortOrder = targetPhoto.sortOrder ?? targetIndex;

  const updates = [
    supabase
      .from('marketing_location_photos')
      .update({ sort_order: targetSortOrder })
      .eq('id', currentPhoto.id),
    supabase
      .from('marketing_location_photos')
      .update({ sort_order: currentSortOrder })
      .eq('id', targetPhoto.id),
  ];

  const results = await Promise.all(updates);
  const error = results.map((result) => result.error).find(Boolean);

  if (error) throw error;

  return getMarketingPhotosByLocation(photo.locationId);
};

export const syncLocationPhotosToCampaign = async (locationId, campaignId) => {
  if (!locationId) return [];

  const { error } = await supabase
    .from('marketing_location_photos')
    .update({ campaign_id: campaignId || null })
    .eq('location_id', locationId);

  if (error) throw error;

  return getMarketingPhotosByLocation(locationId);
};

export const deleteMarketingPhoto = async (photoId, { deleteFile = true } = {}) => {
  const photo = await getMarketingPhotoById(photoId);
  if (!photo) return { deleted: false };

  const { error } = await supabase
    .from('marketing_location_photos')
    .delete()
    .eq('id', photoId);

  if (error) throw error;

  if (deleteFile && photo.photoUrl) {
    await deleteMarketingAssetByPublicUrl(photo.photoUrl).catch((storageError) => {
      console.warn('Photo record was deleted, but storage cleanup failed:', storageError);
    });
  }

  return { deleted: true, photo };
};
