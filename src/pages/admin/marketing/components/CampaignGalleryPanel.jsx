// src/pages/admin/marketing/components/CampaignGalleryPanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getCampaignRollup } from '../services/campaignService';

const FILTERS = [
  { value: 'all', label: 'All Photos' },
  { value: 'location', label: 'Location Photos' },
  { value: 'activity', label: 'Activity Photos' },
];

const photoTypeLabel = (type = '') =>
  String(type || 'photo').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const normalizePhotos = (rollup) => {
  const locationPhotos = (rollup.locationPhotos || []).map((photo) => ({
    id: `location-${photo.id}`,
    rawId: photo.id,
    source: 'location',
    photoUrl: photo.photo_url,
    title: photo.title || photoTypeLabel(photo.photo_type),
    description: photo.description || '',
    photoType: photo.photo_type || 'photo',
    isPrimary: !!photo.is_primary,
    date: photo.created_at,
  }));

  const activityPhotos = (rollup.activityPhotos || []).map((photo) => ({
    id: `activity-${photo.id}`,
    rawId: photo.id,
    source: 'activity',
    photoUrl: photo.photo_url,
    title: photo.title || photoTypeLabel(photo.photo_type),
    description: photo.description || '',
    photoType: photo.photo_type || 'photo',
    isPrimary: !!photo.is_primary,
    date: photo.created_at,
  }));

  return [...locationPhotos, ...activityPhotos].sort((a, b) => {
    const aDate = new Date(a.date || 0).getTime();
    const bDate = new Date(b.date || 0).getTime();
    return bDate - aDate;
  });
};

const CampaignGalleryPanel = ({ campaign }) => {
  const [rollup, setRollup] = useState({
    locations: [],
    activities: [],
    locationPhotos: [],
    activityPhotos: [],
  });
  const [filter, setFilter] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadRollup = async () => {
      if (!campaign?.id) return;

      setIsLoading(true);
      setError('');

      try {
        const nextRollup = await getCampaignRollup(campaign.id);
        if (isMounted) {
          setRollup(nextRollup);
          setActiveIndex(0);
        }
      } catch (galleryError) {
        console.error('Error loading campaign gallery:', galleryError);
        if (isMounted) setError(galleryError?.message || 'Could not load campaign gallery.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadRollup();

    return () => {
      isMounted = false;
    };
  }, [campaign?.id]);

  const allPhotos = useMemo(() => normalizePhotos(rollup), [rollup]);

  const filteredPhotos = useMemo(() => {
    if (filter === 'all') return allPhotos;
    return allPhotos.filter((photo) => photo.source === filter);
  }, [allPhotos, filter]);

  const activePhoto = filteredPhotos[activeIndex] || filteredPhotos[0] || null;

  const counts = useMemo(() => {
    return allPhotos.reduce(
      (acc, photo) => {
        acc.all += 1;
        acc[photo.source] += 1;
        return acc;
      },
      { all: 0, location: 0, activity: 0 }
    );
  }, [allPhotos]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  useEffect(() => {
    if (activeIndex > filteredPhotos.length - 1) {
      setActiveIndex(Math.max(filteredPhotos.length - 1, 0));
    }
  }, [activeIndex, filteredPhotos.length]);

  const goPrevious = () => {
    if (filteredPhotos.length <= 1) return;
    setActiveIndex((current) => (current === 0 ? filteredPhotos.length - 1 : current - 1));
  };

  const goNext = () => {
    if (filteredPhotos.length <= 1) return;
    setActiveIndex((current) => (current === filteredPhotos.length - 1 ? 0 : current + 1));
  };

  if (!campaign) return null;

  if (isLoading) {
    return <div className={styles.emptyState}>Loading campaign gallery...</div>;
  }

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Campaign Gallery</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Photos and proof images linked to this campaign from locations and field activities.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            style={{
              border: filter === option.value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
              background: filter === option.value ? '#eff6ff' : '#ffffff',
              color: filter === option.value ? '#0369a1' : '#475569',
              borderRadius: 999,
              padding: '6px 9px',
              fontWeight: 900,
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {option.label} ({counts[option.value] || 0})
          </button>
        ))}
      </div>

      {filteredPhotos.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 14, background: '#f8fafc', padding: 16, color: '#64748b', fontWeight: 850, textAlign: 'center' }}>
          No photos linked to this campaign yet.
        </div>
      ) : (
        <>
          <div
            className={styles.imagePreview}
            style={{
              minHeight: 300,
              position: 'relative',
              background: '#f8fafc',
            }}
          >
            <img
              src={activePhoto.photoUrl}
              alt={activePhoto.title}
              onClick={() => setFullscreen(true)}
              style={{ cursor: 'zoom-in', objectFit: 'contain' }}
            />

            <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                {activePhoto.source === 'location' ? '📍 Location' : '🏃 Activity'}
              </span>

              <span style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 950 }}>
                {photoTypeLabel(activePhoto.photoType)}
              </span>
            </div>

            <button type="button" className={styles.secondaryBtn} onClick={() => setFullscreen(true)} style={{ position: 'absolute', right: 12, top: 12 }}>
              Fullscreen
            </button>

            {filteredPhotos.length > 1 && (
              <>
                <button type="button" onClick={goPrevious} className={styles.secondaryBtn} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  ‹
                </button>
                <button type="button" onClick={goNext} className={styles.secondaryBtn} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  ›
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ color: '#0f172a' }}>{activePhoto.title}</strong>
            <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
              {formatDate(activePhoto.date)}
              {activePhoto.description ? ` • ${activePhoto.description}` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {filteredPhotos.map((photo, index) => (
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
        </>
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
          <button type="button" className={styles.secondaryBtn} onClick={() => setFullscreen(false)} style={{ position: 'absolute', right: 24, top: 24 }}>
            Close
          </button>

          {filteredPhotos.length > 1 && (
            <>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  goPrevious();
                }}
                style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)' }}
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
                style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)' }}
              >
                ›
              </button>
            </>
          )}

          <img
            src={activePhoto.photoUrl}
            alt={activePhoto.title}
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: '94vw',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 14,
              background: '#ffffff',
            }}
          />
        </div>
      )}
    </section>
  );
};

export default CampaignGalleryPanel;
