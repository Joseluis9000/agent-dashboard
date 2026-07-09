// src/pages/admin/marketing/services/storageService.js

import { supabase } from '../../../../supabaseClient';

export const MARKETING_ASSETS_BUCKET = 'marketing-assets';

const sanitizeFileName = (fileName = 'marketing-file') => {
  const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
  const baseName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return {
    baseName: baseName || 'marketing-file',
    extension: extension || 'jpg',
  };
};

export const getStoragePathFromPublicUrl = (publicUrl = '') => {
  if (!publicUrl || typeof publicUrl !== 'string') return '';

  const marker = `/storage/v1/object/public/${MARKETING_ASSETS_BUCKET}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) return '';

  return decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
};

export const getMarketingAssetPublicUrl = (filePath) => {
  if (!filePath) return '';

  const { data } = supabase.storage
    .from(MARKETING_ASSETS_BUCKET)
    .getPublicUrl(filePath);

  return data?.publicUrl || '';
};

export const uploadMarketingAsset = async ({
  file,
  folder = 'locations',
  locationId = '',
  filePrefix = 'asset',
  upsert = false,
}) => {
  if (!file) throw new Error('No file selected.');

  const { baseName, extension } = sanitizeFileName(file.name);
  const safeFolder = String(folder || 'locations').replace(/^\/+|\/+$/g, '');
  const safeLocationId = locationId ? String(locationId).replace(/[^a-z0-9-_]+/gi, '-') : 'unassigned';
  const safePrefix = String(filePrefix || 'asset').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  const filePath = `${safeFolder}/${safeLocationId}/${Date.now()}-${safePrefix}-${baseName}.${extension}`;

  const { error } = await supabase.storage
    .from(MARKETING_ASSETS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  return {
    filePath,
    publicUrl: getMarketingAssetPublicUrl(filePath),
    fileName: file.name,
    mimeType: file.type || '',
    sizeBytes: file.size || 0,
  };
};

export const uploadMarketingPhoto = async ({ file, locationId = '', photoType = 'billboard' }) => {
  return uploadMarketingAsset({
    file,
    folder: 'photos',
    locationId,
    filePrefix: photoType || 'photo',
  });
};

export const uploadMarketingContract = async ({ file, locationId = '' }) => {
  return uploadMarketingAsset({
    file,
    folder: 'contracts',
    locationId,
    filePrefix: 'contract',
  });
};

export const uploadMarketingGraphic = async ({ file, locationId = '' }) => {
  return uploadMarketingAsset({
    file,
    folder: 'graphics',
    locationId,
    filePrefix: 'graphic',
  });
};

export const deleteMarketingAssetByPath = async (filePath) => {
  if (!filePath) return { deleted: false };

  const { error } = await supabase.storage
    .from(MARKETING_ASSETS_BUCKET)
    .remove([filePath]);

  if (error) throw error;

  return { deleted: true };
};

export const deleteMarketingAssetByPublicUrl = async (publicUrl) => {
  const filePath = getStoragePathFromPublicUrl(publicUrl);
  if (!filePath) return { deleted: false };

  return deleteMarketingAssetByPath(filePath);
};
