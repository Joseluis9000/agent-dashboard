// src/pages/admin/marketing/services/activityPhotoService.js

import { supabase } from '../../../../supabaseClient';
import {
  deleteMarketingAssetByPublicUrl,
  uploadMarketingPhoto,
} from './storageService';

export const ACTIVITY_PHOTO_TYPES = Object.freeze({
  PROOF: 'proof',
  STREET: 'street',
  TEAM: 'team',
  RECEIPT: 'receipt',
  BEFORE: 'before',
  AFTER: 'after',
  OTHER: 'other',
});

const getActivityCampaignId = async (activityId) => {
  if (!activityId) return null;

  const { data, error } = await supabase
    .from('marketing_activities')
    .select('campaign_id')
    .eq('id', activityId)
    .maybeSingle();

  if (error) throw error;

  return data?.campaign_id || null;
};

export const dbToActivityPhoto = (row = {}) => ({
  id: row.id,
  activityId: row.activity_id,
  campaignId: row.campaign_id || null,
  photoUrl: row.photo_url || '',
  photoType: row.photo_type || ACTIVITY_PHOTO_TYPES.PROOF,
  title: row.title || '',
  description: row.description || '',
  sortOrder: Number(row.sort_order || 0),
  isPrimary: !!row.is_primary,
  uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

export const getActivityPhotos = async (activityId) => {
  if (!activityId) return [];

  const { data, error } = await supabase
    .from('marketing_activity_photos')
    .select('*')
    .eq('activity_id', activityId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(dbToActivityPhoto);
};

export const getActivityPhotosByActivities = async (activityIds = []) => {
  const ids = [...new Set((activityIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('marketing_activity_photos')
    .select('*')
    .in('activity_id', ids)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    const photo = dbToActivityPhoto(row);
    if (!acc[photo.activityId]) acc[photo.activityId] = [];
    acc[photo.activityId].push(photo);
    return acc;
  }, {});
};

export const getActivityPhotoById = async (photoId) => {
  if (!photoId) return null;

  const { data, error } = await supabase
    .from('marketing_activity_photos')
    .select('*')
    .eq('id', photoId)
    .single();

  if (error) throw error;

  return dbToActivityPhoto(data);
};

export const clearPrimaryActivityPhotos = async (activityId) => {
  if (!activityId) return;

  const { error } = await supabase
    .from('marketing_activity_photos')
    .update({ is_primary: false })
    .eq('activity_id', activityId)
    .eq('is_primary', true);

  if (error) throw error;
};

export const addActivityPhotoRecord = async ({
  activityId,
  campaignId = null,
  photoUrl,
  photoType = ACTIVITY_PHOTO_TYPES.PROOF,
  title = '',
  description = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  if (!activityId) throw new Error('Missing activity ID.');
  if (!photoUrl) throw new Error('Missing photo URL.');

  const resolvedCampaignId = campaignId || await getActivityCampaignId(activityId);

  if (isPrimary) {
    await clearPrimaryActivityPhotos(activityId);
  }

  const { data, error } = await supabase
    .from('marketing_activity_photos')
    .insert({
      activity_id: activityId,
      campaign_id: resolvedCampaignId || null,
      photo_url: photoUrl,
      photo_type: photoType || ACTIVITY_PHOTO_TYPES.PROOF,
      title: title?.trim() || null,
      description: description?.trim() || null,
      sort_order: Number(sortOrder || 0),
      is_primary: !!isPrimary,
      uploaded_by: uploadedBy || null,
    })
    .select()
    .single();

  if (error) throw error;

  return dbToActivityPhoto(data);
};

export const uploadAndCreateActivityPhoto = async ({
  file,
  activityId,
  campaignId = null,
  photoType = ACTIVITY_PHOTO_TYPES.PROOF,
  title = '',
  description = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  const upload = await uploadMarketingPhoto({
    file,
    locationId: activityId,
    photoType: `activity_${photoType}`,
  });

  return addActivityPhotoRecord({
    activityId,
    campaignId,
    photoUrl: upload.publicUrl,
    photoType,
    title: title || upload.fileName,
    description,
    sortOrder,
    isPrimary,
    uploadedBy,
  });
};

export const updateActivityPhoto = async (photoId, changes = {}) => {
  if (!photoId) throw new Error('Missing photo ID.');

  const payload = {};

  if ('photoType' in changes) payload.photo_type = changes.photoType || ACTIVITY_PHOTO_TYPES.PROOF;
  if ('title' in changes) payload.title = changes.title?.trim() || null;
  if ('description' in changes) payload.description = changes.description?.trim() || null;
  if ('sortOrder' in changes) payload.sort_order = Number(changes.sortOrder || 0);
  if ('isPrimary' in changes) payload.is_primary = !!changes.isPrimary;
  if ('campaignId' in changes) payload.campaign_id = changes.campaignId || null;

  if (Object.keys(payload).length === 0) {
    return getActivityPhotoById(photoId);
  }

  if (payload.is_primary) {
    const current = await getActivityPhotoById(photoId);
    if (current?.activityId) await clearPrimaryActivityPhotos(current.activityId);
  }

  const { data, error } = await supabase
    .from('marketing_activity_photos')
    .update(payload)
    .eq('id', photoId)
    .select()
    .single();

  if (error) throw error;

  return dbToActivityPhoto(data);
};

export const setPrimaryActivityPhoto = async (photoId) => {
  const photo = await getActivityPhotoById(photoId);
  if (!photo) throw new Error('Photo not found.');

  await clearPrimaryActivityPhotos(photo.activityId);

  return updateActivityPhoto(photoId, { isPrimary: true });
};

export const syncActivityPhotosToCampaign = async (activityId, campaignId) => {
  if (!activityId) return [];

  const { error } = await supabase
    .from('marketing_activity_photos')
    .update({ campaign_id: campaignId || null })
    .eq('activity_id', activityId);

  if (error) throw error;

  return getActivityPhotos(activityId);
};

export const deleteActivityPhoto = async (photoId, { deleteFile = true } = {}) => {
  const photo = await getActivityPhotoById(photoId);
  if (!photo) return { deleted: false };

  const { error } = await supabase
    .from('marketing_activity_photos')
    .delete()
    .eq('id', photoId);

  if (error) throw error;

  if (deleteFile && photo.photoUrl) {
    await deleteMarketingAssetByPublicUrl(photo.photoUrl).catch((storageError) => {
      console.warn('Activity photo record deleted, but storage cleanup failed:', storageError);
    });
  }

  return { deleted: true, photo };
};
