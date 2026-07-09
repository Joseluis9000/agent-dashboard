// src/pages/admin/marketing/components/PhotoGallery.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import {
  PHOTO_TYPES,
  deleteMarketingPhoto,
  getMarketingPhotosByLocation,
  moveMarketingPhoto,
  setPrimaryMarketingPhoto,
  updateMarketingPhoto,
  uploadAndCreateMarketingPhoto,
} from '../services/photoService';

const PHOTO_TYPE_OPTIONS = [
  { value: 'all', label: 'All Assets', icon: '🗂️' },
  { value: PHOTO_TYPES.BILLBOARD, label: 'Billboard', icon: '📷' },
  { value: PHOTO_TYPES.ARTWORK_PROOF, label: 'Artwork Proof', icon: '🖼️' },
  { value: PHOTO_TYPES.DESIGN_MOCKUP, label: 'Design Mockup', icon: '🎨' },
  { value: PHOTO_TYPES.INSTALLATION, label: 'Installation', icon: '🛠️' },
  { value: PHOTO_TYPES.NIGHT, label: 'Night Photo', icon: '🌙' },
  { value: PHOTO_TYPES.DAMAGE, label: 'Damage', icon: '⚠️' },
  { value: PHOTO_TYPES.MAINTENANCE, label: 'Maintenance', icon: '🧹' },
  { value: PHOTO_TYPES.STREET_VIEW, label: 'Street View Ref', icon: '🛰️' },
  { value: PHOTO_TYPES.DRONE, label: 'Drone', icon: '🚁' },
  { value: PHOTO_TYPES.PERMIT, label: 'Permit', icon: '📄' },
  { value: PHOTO_TYPES.CONTRACT, label: 'Contract', icon: '📑' },
  { value: PHOTO_TYPES.INVOICE, label: 'Invoice', icon: '🧾' },
  { value: PHOTO_TYPES.OTHER, label: 'Other', icon: '📎' },
];

const getPhotoTitle = (photo, index) => {
  if (photo?.title) return photo.title;
  if (photo?.photoType) return `${photo.photoType.replaceAll('_', ' ')} photo`;
  return `Photo ${index + 1}`;
};

const getPhotoTypeMeta = (photoType) => {
  return PHOTO_TYPE_OPTIONS.find((item) => item.value === photoType) || {
    value: photoType || PHOTO_TYPES.OTHER,
    label: (photoType || 'photo').replaceAll('_', ' '),
    icon: '📎',
  };
};

const getPhotoTypeLabel = (photoType) => getPhotoTypeMeta(photoType).label;

const getPhotoTypeIcon = (photoType) => getPhotoTypeMeta(photoType).icon;

const PhotoGallery = ({
  location = null,
  locationId = '',
  fallbackPhotoUrl = '',
  fallbackTitle = '',
  canEdit = true,
  onPhotosChange,
}) => {
  const resolvedLocationId = locationId || location?.id || '';
  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoType, setPhotoType] = useState(PHOTO_TYPES.BILLBOARD);
  const [assetFilter, setAssetFilter] = useState('all');
  const [dragActive, setDragActive] = useState(false);

  const fallbackPhoto = useMemo(() => {
    if (!fallbackPhotoUrl) return null;

    return {
      id: 'fallback-photo',
      locationId: resolvedLocationId,
      photoUrl: fallbackPhotoUrl,
      photoType: PHOTO_TYPES.BILLBOARD,
      title: fallbackTitle || location?.name || 'Main Photo',
      description: 'Legacy photo from marketing_locations.photo_url or graphic_url.',
      sortOrder: 0,
      isPrimary: true,
      isFallback: true,
    };
  }, [fallbackPhotoUrl, fallbackTitle, location?.name, resolvedLocationId]);

  const allDisplayPhotos = useMemo(() => {
    if (photos.length > 0) return photos;
    return fallbackPhoto ? [fallbackPhoto] : [];
  }, [fallbackPhoto, photos]);

  const assetCounts = useMemo(() => {
    return allDisplayPhotos.reduce((acc, photo) => {
      const key = photo.photoType || PHOTO_TYPES.OTHER;
      acc[key] = (acc[key] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, { all: 0 });
  }, [allDisplayPhotos]);

  const displayPhotos = useMemo(() => {
    if (assetFilter === 'all') return allDisplayPhotos;
    return allDisplayPhotos.filter((photo) => photo.photoType === assetFilter);
  }, [allDisplayPhotos, assetFilter]);

  const activePhoto = displayPhotos[activeIndex] || displayPhotos[0] || null;
  const editablePhotos = displayPhotos.filter((photo) => !photo.isFallback);

  const notifyPhotosChange = useCallback((nextPhotos) => {
    if (typeof onPhotosChange === 'function') {
      onPhotosChange(nextPhotos);
    }
  }, [onPhotosChange]);

  const loadPhotos = useCallback(async () => {
    if (!resolvedLocationId) {
      setPhotos([]);
      setActiveIndex(0);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const nextPhotos = await getMarketingPhotosByLocation(resolvedLocationId);
      setPhotos(nextPhotos);
      setActiveIndex(0);
    } catch (loadError) {
      console.error('Error loading marketing photos:', loadError);
      setError(loadError?.message || 'Could not load photos.');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedLocationId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    setActiveIndex(0);
  }, [assetFilter, resolvedLocationId]);

  useEffect(() => {
    if (activeIndex > displayPhotos.length - 1) {
      setActiveIndex(Math.max(displayPhotos.length - 1, 0));
    }
  }, [activeIndex, displayPhotos.length]);

  useEffect(() => {
    if (!fullscreen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFullscreen(false);
      if (event.key === 'ArrowLeft') goPrevious();
      if (event.key === 'ArrowRight') goNext();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, displayPhotos.length]);

  const goPrevious = () => {
    if (displayPhotos.length <= 1) return;
    setActiveIndex((current) => (current === 0 ? displayPhotos.length - 1 : current - 1));
  };

  const goNext = () => {
    if (displayPhotos.length <= 1) return;
    setActiveIndex((current) => (current === displayPhotos.length - 1 ? 0 : current + 1));
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'));

    if (!resolvedLocationId) {
      setError('Save the marketing location before uploading gallery photos.');
      return;
    }

    if (files.length === 0) {
      setError('Please choose at least one image file.');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const existingCount = photos.length;
      const uploaded = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadedPhoto = await uploadAndCreateMarketingPhoto({
          file,
          locationId: resolvedLocationId,
          photoType,
          title: file.name,
          sortOrder: existingCount + index,
          isPrimary: existingCount === 0 && index === 0,
        });
        uploaded.push(uploadedPhoto);
      }

      const nextPhotos = await getMarketingPhotosByLocation(resolvedLocationId);
      setPhotos(nextPhotos);

      const firstUploadedId = uploaded[0]?.id;
      const nextIndex = firstUploadedId
        ? nextPhotos.findIndex((photo) => photo.id === firstUploadedId)
        : Math.max(nextPhotos.length - uploaded.length, 0);

      setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
      notifyPhotosChange(nextPhotos);
    } catch (uploadError) {
      console.error('Error uploading marketing photo:', uploadError);
      setError(uploadError?.message || 'Could not upload photo.');
    } finally {
      setIsUploading(false);
      setDragActive(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetPrimary = async (photo) => {
    if (!photo?.id || photo.isFallback || photo.isPrimary) return;

    setIsSaving(true);
    setError('');

    try {
      const primaryPhoto = await setPrimaryMarketingPhoto(photo.id);
      const nextPhotos = await getMarketingPhotosByLocation(primaryPhoto.locationId);
      setPhotos(nextPhotos);
      setActiveIndex(0);
      notifyPhotosChange(nextPhotos);
    } catch (saveError) {
      console.error('Error setting primary marketing photo:', saveError);
      setError(saveError?.message || 'Could not set primary photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePhoto = async (photo) => {
    if (!photo?.id || photo.isFallback) return;

    const confirmed = window.confirm('Delete this photo from the gallery?');
    if (!confirmed) return;

    setIsSaving(true);
    setError('');

    try {
      await deleteMarketingPhoto(photo.id, { deleteFile: true });
      const nextPhotos = await getMarketingPhotosByLocation(resolvedLocationId);
      setPhotos(nextPhotos);
      setActiveIndex((current) => Math.max(Math.min(current, nextPhotos.length - 1), 0));
      notifyPhotosChange(nextPhotos);
    } catch (deleteError) {
      console.error('Error deleting marketing photo:', deleteError);
      setError(deleteError?.message || 'Could not delete photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePhoto = async (photo, changes) => {
    if (!photo?.id || photo.isFallback) return;

    setError('');

    try {
      const updated = await updateMarketingPhoto(photo.id, changes);
      setPhotos((currentPhotos) => {
        const nextPhotos = currentPhotos.map((item) => (item.id === updated.id ? updated : item));
        notifyPhotosChange(nextPhotos);
        return nextPhotos;
      });
    } catch (updateError) {
      console.error('Error updating photo:', updateError);
      setError(updateError?.message || 'Could not update photo.');
    }
  };

  const handleMovePhoto = async (photo, direction) => {
    if (!photo?.id || photo.isFallback || editablePhotos.length <= 1) return;

    setIsSaving(true);
    setError('');

    try {
      const nextPhotos = await moveMarketingPhoto({
        photos: editablePhotos,
        photoId: photo.id,
        direction,
      });

      setPhotos(nextPhotos);

      const nextIndex = nextPhotos.findIndex((item) => item.id === photo.id);
      setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
      notifyPhotosChange(nextPhotos);
    } catch (moveError) {
      console.error('Error reordering photos:', moveError);
      setError(moveError?.message || 'Could not reorder photos.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (!canEdit || isUploading) return;
    uploadFiles(event.dataTransfer.files);
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canEdit) return;

    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    }

    if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Photo Gallery</h3>
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>
            {displayPhotos.length === 0
              ? 'No photos uploaded yet.'
              : `Photo ${Math.min(activeIndex + 1, displayPhotos.length)} of ${displayPhotos.length}`}
          </span>
        </div>

        {canEdit && (
          <select
            value={photoType}
            onChange={(event) => setPhotoType(event.target.value)}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '7px 8px',
              fontWeight: 800,
              color: '#334155',
              background: '#fff',
            }}
          >
            {PHOTO_TYPE_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
              <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {allDisplayPhotos.length > 0 && (
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
          {PHOTO_TYPE_OPTIONS.filter((option) => option.value === 'all' || assetCounts[option.value]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAssetFilter(option.value)}
              style={{
                border: assetFilter === option.value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
                background: assetFilter === option.value ? '#eff6ff' : '#ffffff',
                color: assetFilter === option.value ? '#0369a1' : '#475569',
                borderRadius: 999,
                padding: '6px 9px',
                fontWeight: 900,
                fontSize: 11,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {option.icon} {option.label} ({assetCounts[option.value] || 0})
            </button>
          ))}
        </div>
      )}

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={styles.imagePreview}
        style={{
          minHeight: 260,
          borderStyle: dragActive ? 'dashed' : undefined,
          borderColor: dragActive ? '#0ea5e9' : undefined,
          background: dragActive ? '#eff6ff' : undefined,
          position: 'relative',
        }}
      >
        {isLoading ? (
          <strong style={{ color: '#64748b' }}>Loading photos...</strong>
        ) : activePhoto ? (
          <>
            <img
              src={activePhoto.photoUrl}
              alt={getPhotoTitle(activePhoto, activeIndex)}
              onClick={() => setFullscreen(true)}
              style={{ cursor: 'zoom-in' }}
            />

            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                {getPhotoTypeIcon(activePhoto.photoType)} {getPhotoTypeLabel(activePhoto.photoType)}
              </span>

              {activePhoto.isPrimary && (
                <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                  Primary
                </span>
              )}

              {activePhoto.isFallback && (
                <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                  Legacy
                </span>
              )}
            </div>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setFullscreen(true)}
              style={{ position: 'absolute', right: 12, top: 12 }}
            >
              Fullscreen
            </button>

            {displayPhotos.length > 1 && (
              <>
                <button type="button" onClick={goPrevious} className={styles.secondaryBtn} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} aria-label="Previous photo">
                  ‹
                </button>
                <button type="button" onClick={goNext} className={styles.secondaryBtn} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} aria-label="Next photo">
                  ›
                </button>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 850 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
            <div>{assetFilter === 'all' ? 'Drop photos here or upload from below.' : 'No photos in this asset category.'}</div>
          </div>
        )}
      </div>

      {activePhoto && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 3 }}>
              <strong style={{ color: '#0f172a' }}>{getPhotoTitle(activePhoto, activeIndex)}</strong>
              <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>
                {getPhotoTypeIcon(activePhoto.photoType)} {getPhotoTypeLabel(activePhoto.photoType)}
                {activePhoto.description ? ` • ${activePhoto.description}` : ''}
              </span>
            </div>

            {!activePhoto.isFallback && canEdit && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => handleMovePhoto(activePhoto, -1)} disabled={isSaving || activeIndex <= 0}>
                  Move Up
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => handleMovePhoto(activePhoto, 1)} disabled={isSaving || activeIndex >= editablePhotos.length - 1}>
                  Move Down
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => handleSetPrimary(activePhoto)} disabled={isSaving || activePhoto.isPrimary}>
                  Set Primary
                </button>
                <button type="button" className={styles.dangerBtn} onClick={() => handleDeletePhoto(activePhoto)} disabled={isSaving}>
                  Delete
                </button>
              </div>
            )}
          </div>

          {!activePhoto.isFallback && canEdit && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#334155', fontWeight: 850 }}>
                Photo Title
                <input
                  defaultValue={activePhoto.title || ''}
                  onBlur={(event) => handleUpdatePhoto(activePhoto, { title: event.target.value })}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}
                />
              </label>

              <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#334155', fontWeight: 850 }}>
                Photo Type
                <select
                  value={activePhoto.photoType || PHOTO_TYPES.BILLBOARD}
                  onChange={(event) => handleUpdatePhoto(activePhoto, { photoType: event.target.value })}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}
                >
                  {PHOTO_TYPE_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                    <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#334155', fontWeight: 850 }}>
                Description
                <textarea
                  defaultValue={activePhoto.description || ''}
                  onBlur={(event) => handleUpdatePhoto(activePhoto, { description: event.target.value })}
                  rows={2}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {displayPhotos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {displayPhotos.map((photo, index) => (
            <button
              key={photo.id || photo.photoUrl}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                border: index === activeIndex ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 3,
                background: '#fff',
                cursor: 'pointer',
                width: 74,
                height: 56,
                flex: '0 0 auto',
                position: 'relative',
              }}
              aria-label={`Show ${getPhotoTitle(photo, index)}`}
            >
              <img src={photo.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7, display: 'block' }} />
              {photo.isPrimary && (
                <span style={{ position: 'absolute', right: 2, top: 2, width: 9, height: 9, borderRadius: 999, background: '#22c55e', border: '1px solid #ffffff' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {allDisplayPhotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
          {PHOTO_TYPE_OPTIONS.filter((option) => option.value !== 'all' && assetCounts[option.value]).slice(0, 8).map((option) => (
            <div
              key={option.value}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 8,
                background: '#f8fafc',
                textAlign: 'center',
                display: 'grid',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 15 }}>{option.icon}</span>
              <strong style={{ color: '#0f172a', fontSize: 13 }}>{assetCounts[option.value]}</strong>
              <small style={{ color: '#64748b', fontWeight: 850, fontSize: 9 }}>{option.label}</small>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ border: '1px dashed #93c5fd', borderRadius: 14, padding: 12, background: '#f8fbff', display: 'grid', gap: 8 }}>
          <strong style={{ color: '#075985', fontSize: 13 }}>Upload Photos</strong>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => uploadFiles(event.target.files)}
            disabled={isUploading || !resolvedLocationId}
          />
          <small style={{ color: '#64748b', fontWeight: 750 }}>
            {resolvedLocationId
              ? 'Select multiple photos or drag images into the preview area.'
              : 'Save this marketing location before uploading gallery photos.'}
          </small>
          {isUploading && <strong style={{ color: '#0ea5e9' }}>Uploading photos...</strong>}
        </div>
      )}

      {fullscreen && activePhoto && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(15,23,42,0.86)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setFullscreen(false)}
            style={{ position: 'absolute', right: 24, top: 24, zIndex: 2 }}
          >
            Close
          </button>

          {displayPhotos.length > 1 && (
            <>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  goPrevious();
                }}
                style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
              >
                ›
              </button>
            </>
          )}

          <img
            src={activePhoto.photoUrl}
            alt={getPhotoTitle(activePhoto, activeIndex)}
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: '94vw',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 14,
              boxShadow: '0 30px 90px rgba(0,0,0,0.45)',
              background: '#ffffff',
            }}
          />
        </div>
      )}
    </section>
  );
};

export default PhotoGallery;
