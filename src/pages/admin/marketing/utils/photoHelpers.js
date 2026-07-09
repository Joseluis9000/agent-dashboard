// src/pages/admin/marketing/utils/photoHelpers.js
export const getPrimaryPhoto = (photos = []) => {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return photos.find((photo) => photo.isPrimary) || photos[0];
};

export const getPrimaryPhotoUrl = ({ photos = [], fallbackPhotoUrl = '', fallbackGraphicUrl = '' } = {}) => {
  const primaryPhoto = getPrimaryPhoto(photos);
  return primaryPhoto?.url || fallbackPhotoUrl || fallbackGraphicUrl || '';
};

export const getNextPhotoIndex = (currentIndex, photos = []) => {
  if (!photos.length) return 0;
  return currentIndex >= photos.length - 1 ? 0 : currentIndex + 1;
};

export const getPreviousPhotoIndex = (currentIndex, photos = []) => {
  if (!photos.length) return 0;
  return currentIndex <= 0 ? photos.length - 1 : currentIndex - 1;
};

export const isImageFile = (file) => {
  if (!file) return false;
  return file.type?.startsWith('image/');
};

export const getPhotoLabel = (photo) => {
  if (!photo) return 'Photo';
  return photo.title || photo.type?.replace(/_/g, ' ') || 'Photo';
};
