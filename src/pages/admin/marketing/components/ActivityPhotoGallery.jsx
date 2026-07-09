// src/pages/admin/marketing/components/ActivityPhotoGallery.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import {
  ACTIVITY_PHOTO_TYPES,
  deleteActivityPhoto,
  getActivityPhotos,
  setPrimaryActivityPhoto,
  updateActivityPhoto,
  uploadAndCreateActivityPhoto,
} from '../services/activityPhotoService';

const PHOTO_TYPE_OPTIONS = [
  { value: ACTIVITY_PHOTO_TYPES.PROOF, label: 'Proof', icon: '📸' },
  { value: ACTIVITY_PHOTO_TYPES.STREET, label: 'Street / Area', icon: '🛣️' },
  { value: ACTIVITY_PHOTO_TYPES.TEAM, label: 'Team', icon: '👥' },
  { value: ACTIVITY_PHOTO_TYPES.RECEIPT, label: 'Receipt', icon: '🧾' },
  { value: ACTIVITY_PHOTO_TYPES.BEFORE, label: 'Before', icon: '⬅️' },
  { value: ACTIVITY_PHOTO_TYPES.AFTER, label: 'After', icon: '➡️' },
  { value: ACTIVITY_PHOTO_TYPES.OTHER, label: 'Other', icon: '📎' },
];

const getPhotoTypeMeta = (photoType) =>
  PHOTO_TYPE_OPTIONS.find((option) => option.value === photoType) || PHOTO_TYPE_OPTIONS[0];

const getPhotoTitle = (photo, index) => {
  if (photo?.title) return photo.title;
  return `${getPhotoTypeMeta(photo?.photoType).label} ${index + 1}`;
};

const ActivityPhotoGallery = ({
  activity = null,
  activityId = '',
  canEdit = true,
  onPhotosChange,
}) => {
  const resolvedActivityId = activityId || activity?.id || '';
  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [photoType, setPhotoType] = useState(ACTIVITY_PHOTO_TYPES.PROOF);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  const activePhoto = photos[activeIndex] || photos[0] || null;

  const notifyPhotosChange = useCallback((nextPhotos) => {
    if (typeof onPhotosChange === 'function') {
      onPhotosChange(resolvedActivityId, nextPhotos);
    }
  }, [onPhotosChange, resolvedActivityId]);

  const loadPhotos = useCallback(async () => {
    if (!resolvedActivityId) {
      setPhotos([]);
      setActiveIndex(0);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const nextPhotos = await getActivityPhotos(resolvedActivityId);
      setPhotos(nextPhotos);
      setActiveIndex(0);
    } catch (loadError) {
      console.error('Error loading activity photos:', loadError);
      setError(loadError?.message || 'Could not load activity photos.');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedActivityId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    if (activeIndex > photos.length - 1) {
      setActiveIndex(Math.max(photos.length - 1, 0));
    }
  }, [activeIndex, photos.length]);

  const goPrevious = () => {
    if (photos.length <= 1) return;
    setActiveIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
  };

  const goNext = () => {
    if (photos.length <= 1) return;
    setActiveIndex((current) => (current === photos.length - 1 ? 0 : current + 1));
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'));

    if (!resolvedActivityId) {
      setError('Save the activity before uploading photos.');
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

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        await uploadAndCreateActivityPhoto({
          file,
          activityId: resolvedActivityId,
          photoType,
          title: file.name,
          sortOrder: existingCount + index,
          isPrimary: existingCount === 0 && index === 0,
        });
      }

      const nextPhotos = await getActivityPhotos(resolvedActivityId);
      setPhotos(nextPhotos);
      setActiveIndex(Math.max(nextPhotos.length - files.length, 0));
      notifyPhotosChange(nextPhotos);
    } catch (uploadError) {
      console.error('Error uploading activity photo:', uploadError);
      setError(uploadError?.message || 'Could not upload photo.');
    } finally {
      setIsUploading(false);
      setDragActive(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetPrimary = async (photo) => {
    if (!photo?.id || photo.isPrimary) return;

    setIsSaving(true);
    setError('');

    try {
      await setPrimaryActivityPhoto(photo.id);
      const nextPhotos = await getActivityPhotos(resolvedActivityId);
      setPhotos(nextPhotos);
      setActiveIndex(0);
      notifyPhotosChange(nextPhotos);
    } catch (saveError) {
      console.error('Error setting primary activity photo:', saveError);
      setError(saveError?.message || 'Could not set primary photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (photo) => {
    if (!photo?.id) return;
    const confirmed = window.confirm('Delete this activity photo?');
    if (!confirmed) return;

    setIsSaving(true);
    setError('');

    try {
      await deleteActivityPhoto(photo.id, { deleteFile: true });
      const nextPhotos = await getActivityPhotos(resolvedActivityId);
      setPhotos(nextPhotos);
      setActiveIndex((current) => Math.max(Math.min(current, nextPhotos.length - 1), 0));
      notifyPhotosChange(nextPhotos);
    } catch (deleteError) {
      console.error('Error deleting activity photo:', deleteError);
      setError(deleteError?.message || 'Could not delete photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (photo, changes) => {
    if (!photo?.id) return;

    try {
      const updated = await updateActivityPhoto(photo.id, changes);
      setPhotos((currentPhotos) => {
        const nextPhotos = currentPhotos.map((item) => (item.id === updated.id ? updated : item));
        notifyPhotosChange(nextPhotos);
        return nextPhotos;
      });
    } catch (updateError) {
      console.error('Error updating activity photo:', updateError);
      setError(updateError?.message || 'Could not update photo.');
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

    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    if (event.type === 'dragleave') setDragActive(false);
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Activity Photos</h3>
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>
            {photos.length === 0 ? 'No proof photos uploaded yet.' : `${photos.length} photo(s) attached`}
          </span>
        </div>

        {canEdit && (
          <select
            value={photoType}
            onChange={(event) => setPhotoType(event.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 8px', fontWeight: 800 }}
          >
            {PHOTO_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={styles.imagePreview}
        style={{
          minHeight: 220,
          position: 'relative',
          borderStyle: dragActive ? 'dashed' : undefined,
          borderColor: dragActive ? '#0ea5e9' : undefined,
          background: dragActive ? '#eff6ff' : undefined,
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

            <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6 }}>
              <span style={{ background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                {getPhotoTypeMeta(activePhoto.photoType).icon} {getPhotoTypeMeta(activePhoto.photoType).label}
              </span>

              {activePhoto.isPrimary && (
                <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                  Primary
                </span>
              )}
            </div>

            {photos.length > 1 && (
              <>
                <button type="button" onClick={goPrevious} className={styles.secondaryBtn} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>‹</button>
                <button type="button" onClick={goNext} className={styles.secondaryBtn} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>›</button>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 850 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
            <div>Drop proof photos here or upload from below.</div>
          </div>
        )}
      </div>

      {activePhoto && canEdit && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className={styles.secondaryBtn} onClick={() => handleSetPrimary(activePhoto)} disabled={isSaving || activePhoto.isPrimary}>
              Set Primary
            </button>
            <button type="button" className={styles.dangerBtn} onClick={() => handleDelete(activePhoto)} disabled={isSaving}>
              Delete
            </button>
          </div>

          <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#334155', fontWeight: 850 }}>
            Photo Title
            <input
              defaultValue={activePhoto.title || ''}
              onBlur={(event) => handleUpdate(activePhoto, { title: event.target.value })}
              style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}
            />
          </label>

          <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#334155', fontWeight: 850 }}>
            Description
            <textarea
              defaultValue={activePhoto.description || ''}
              onBlur={(event) => handleUpdate(activePhoto, { description: event.target.value })}
              rows={2}
              style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}
            />
          </label>
        </div>
      )}

      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {photos.map((photo, index) => (
            <button
              key={photo.id}
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
              }}
            >
              <img src={photo.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7, display: 'block' }} />
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ border: '1px dashed #93c5fd', borderRadius: 14, padding: 12, background: '#f8fbff', display: 'grid', gap: 8 }}>
          <strong style={{ color: '#075985', fontSize: 13 }}>Upload Proof Photos</strong>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => uploadFiles(event.target.files)}
            disabled={isUploading || !resolvedActivityId}
          />
          <small style={{ color: '#64748b', fontWeight: 750 }}>
            {resolvedActivityId ? 'Upload photos showing the work was completed.' : 'Save this activity before uploading photos.'}
          </small>
          {isUploading && <strong style={{ color: '#0ea5e9' }}>Uploading photos...</strong>}
        </div>
      )}

      {fullscreen && activePhoto && (
        <div
          onClick={() => setFullscreen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.86)', display: 'grid', placeItems: 'center', padding: 24 }}
        >
          <button type="button" className={styles.secondaryBtn} onClick={() => setFullscreen(false)} style={{ position: 'absolute', right: 24, top: 24 }}>
            Close
          </button>
          <img
            src={activePhoto.photoUrl}
            alt={getPhotoTitle(activePhoto, activeIndex)}
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 14, background: '#fff' }}
          />
        </div>
      )}
    </section>
  );
};

export default ActivityPhotoGallery;
