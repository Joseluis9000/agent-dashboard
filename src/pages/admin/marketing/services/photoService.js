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
  EXTERIOR: 'exterior',
  INTERIOR: 'interior',
  STOREFRONT: 'storefront',
  SIGNAGE: 'signage',
  TEAM_OFFICE: 'team_office',
  OTHER: 'other',
});

const normalizePhotoParent = (input, fallbackType = 'location') => {
  if (input && typeof input === 'object') {
    const parentType = input.parentType === 'office' ? 'office' : 'location';
    const parentId = input.parentId || input.officeId || input.locationId || '';
    return { parentType, parentId };
  }

  return {
    parentType: fallbackType === 'office' ? 'office' : 'location',
    parentId: input || '',
  };
};

const getPhotoParentColumn = (parentType) =>
  parentType === 'office' ? 'office_id' : 'location_id';

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
  locationId: row.location_id || null,
  officeId: row.office_id || null,
  parentType: row.office_id ? 'office' : 'location',
  parentId: row.office_id || row.location_id || null,
  campaignId: row.campaign_id || null,
  photoUrl: row.photo_url || '',
  photoType: row.photo_type || PHOTO_TYPES.BILLBOARD,
  title: row.title || '',
  description: row.description || '',
  billboardSide: row.billboard_side || '',
  facingDirection: row.facing_direction || '',
  rotationType: row.rotation_type || '',
  creativeName: row.creative_name || '',
  creativeSlot: row.creative_slot === null || row.creative_slot === undefined
    ? null
    : Number(row.creative_slot),
  creativeTotal: row.creative_total === null || row.creative_total === undefined
    ? null
    : Number(row.creative_total),
  displayNotes: row.display_notes || '',
  sortOrder: Number(row.sort_order || 0),
  isPrimary: !!row.is_primary,
  uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

export const getMarketingPhotosByLocation = async (parentInput) => {
  const { parentType, parentId } = normalizePhotoParent(parentInput);
  if (!parentId) return [];

  const parentColumn = getPhotoParentColumn(parentType);

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .select('*')
    .eq(parentColumn, parentId)
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

export const clearPrimaryPhotos = async (parentInput) => {
  const { parentType, parentId } = normalizePhotoParent(parentInput);
  if (!parentId) return;

  const parentColumn = getPhotoParentColumn(parentType);

  const { error } = await supabase
    .from('marketing_location_photos')
    .update({ is_primary: false })
    .eq(parentColumn, parentId)
    .eq('is_primary', true);

  if (error) throw error;
};

export const addMarketingPhotoRecord = async ({
  parentType = 'location',
  parentId = '',
  locationId = '',
  officeId = '',
  campaignId = null,
  photoUrl,
  photoType = PHOTO_TYPES.BILLBOARD,
  title = '',
  description = '',
  billboardSide = '',
  facingDirection = '',
  rotationType = '',
  creativeName = '',
  creativeSlot = null,
  creativeTotal = null,
  displayNotes = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  const normalized = normalizePhotoParent(
    {
      parentType,
      parentId: parentId || officeId || locationId,
    },
    parentType
  );

  if (!normalized.parentId) throw new Error('Missing photo parent ID.');
  if (!photoUrl) throw new Error('Missing photo URL.');

  const isOffice = normalized.parentType === 'office';
  const resolvedCampaignId = isOffice
    ? null
    : campaignId || await getLocationCampaignId(normalized.parentId);

  if (isPrimary) {
    await clearPrimaryPhotos(normalized);
  }

  const { data, error } = await supabase
    .from('marketing_location_photos')
    .insert({
      location_id: isOffice ? null : normalized.parentId,
      office_id: isOffice ? normalized.parentId : null,
      campaign_id: resolvedCampaignId || null,
      photo_url: photoUrl,
      photo_type: photoType || (isOffice ? PHOTO_TYPES.EXTERIOR : PHOTO_TYPES.BILLBOARD),
      title: title?.trim() || null,
      description: description?.trim() || null,
      billboard_side: isOffice ? null : billboardSide?.trim() || null,
      facing_direction: isOffice ? null : facingDirection?.trim() || null,
      rotation_type: isOffice ? null : rotationType?.trim() || null,
      creative_name: isOffice ? null : creativeName?.trim() || null,
      creative_slot: isOffice || creativeSlot === null || creativeSlot === undefined || creativeSlot === ''
        ? null
        : Number(creativeSlot),
      creative_total: isOffice || creativeTotal === null || creativeTotal === undefined || creativeTotal === ''
        ? null
        : Number(creativeTotal),
      display_notes: isOffice ? null : displayNotes?.trim() || null,
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
  parentType = 'location',
  parentId = '',
  locationId = '',
  officeId = '',
  campaignId = null,
  photoType = PHOTO_TYPES.BILLBOARD,
  title = '',
  description = '',
  billboardSide = '',
  facingDirection = '',
  rotationType = '',
  creativeName = '',
  creativeSlot = null,
  creativeTotal = null,
  displayNotes = '',
  sortOrder = 0,
  isPrimary = false,
  uploadedBy = null,
}) => {
  const normalized = normalizePhotoParent({
    parentType,
    parentId: parentId || officeId || locationId,
  }, parentType);

  if (!normalized.parentId) throw new Error('Missing photo parent ID.');

  // storageService only needs a stable folder identifier. The real UUID works
  // for both marketing locations and Settings offices.
  const upload = await uploadMarketingPhoto({
    file,
    locationId: normalized.parentId,
    photoType,
  });

  const photo = await addMarketingPhotoRecord({
    parentType: normalized.parentType,
    parentId: normalized.parentId,
    campaignId,
    photoUrl: upload.publicUrl,
    photoType,
    title: title || upload.fileName,
    description,
    billboardSide,
    facingDirection,
    rotationType,
    creativeName,
    creativeSlot,
    creativeTotal,
    displayNotes,
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
  if ('billboardSide' in changes) payload.billboard_side = changes.billboardSide?.trim() || null;
  if ('facingDirection' in changes) payload.facing_direction = changes.facingDirection?.trim() || null;
  if ('rotationType' in changes) payload.rotation_type = changes.rotationType?.trim() || null;
  if ('creativeName' in changes) payload.creative_name = changes.creativeName?.trim() || null;
  if ('creativeSlot' in changes) {
    payload.creative_slot =
      changes.creativeSlot === null ||
      changes.creativeSlot === undefined ||
      changes.creativeSlot === ''
        ? null
        : Number(changes.creativeSlot);
  }
  if ('creativeTotal' in changes) {
    payload.creative_total =
      changes.creativeTotal === null ||
      changes.creativeTotal === undefined ||
      changes.creativeTotal === ''
        ? null
        : Number(changes.creativeTotal);
  }
  if ('displayNotes' in changes) payload.display_notes = changes.displayNotes?.trim() || null;
  if ('sortOrder' in changes) payload.sort_order = Number(changes.sortOrder || 0);
  if ('isPrimary' in changes) payload.is_primary = !!changes.isPrimary;
  if ('campaignId' in changes) payload.campaign_id = changes.campaignId || null;

  if (Object.keys(payload).length === 0) {
    return getMarketingPhotoById(photoId);
  }

  if (payload.is_primary) {
    const current = await getMarketingPhotoById(photoId);
    if (current?.parentId) {
      await clearPrimaryPhotos({
        parentType: current.parentType,
        parentId: current.parentId,
      });
    }
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

  await clearPrimaryPhotos({
    parentType: photo.parentType,
    parentId: photo.parentId,
  });

  return updateMarketingPhoto(photoId, { isPrimary: true });
};

export const moveMarketingPhoto = async (input, legacyDirection = 'up') => {
  const isObjectInput = input && typeof input === 'object';

  const photoId = isObjectInput ? input.photoId : input;
  const providedPhotos = isObjectInput && Array.isArray(input.photos) ? input.photos : null;

  let direction = isObjectInput ? input.direction : legacyDirection;

  // PhotoGallery passes -1 / 1. Older callers may pass "up" / "down".
  if (direction === -1) direction = 'up';
  if (direction === 1) direction = 'down';

  const photo = await getMarketingPhotoById(photoId);
  if (!photo) throw new Error('Photo not found.');

  const parent = { parentType: photo.parentType, parentId: photo.parentId };
  const photos = providedPhotos || await getMarketingPhotosByLocation(parent);
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

  return getMarketingPhotosByLocation(parent);
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