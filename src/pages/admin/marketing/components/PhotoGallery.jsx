// src/pages/admin/marketing/components/PhotoGallery.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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


const OFFICE_PHOTO_TYPE_OPTIONS = [
  { value: 'all', label: 'All Photos', icon: '🗂️' },
  { value: PHOTO_TYPES.EXTERIOR, label: 'Exterior', icon: '🏢' },
  { value: PHOTO_TYPES.INTERIOR, label: 'Interior', icon: '🪑' },
  { value: PHOTO_TYPES.STOREFRONT, label: 'Storefront', icon: '🏪' },
  { value: PHOTO_TYPES.SIGNAGE, label: 'Signage', icon: '🪧' },
  { value: PHOTO_TYPES.TEAM_OFFICE, label: 'Team / Office', icon: '👥' },
  { value: PHOTO_TYPES.OTHER, label: 'Other', icon: '📎' },
];



const BILLBOARD_SIDE_OPTIONS = [
  { value: '', label: 'Not Specified' },
  { value: 'A', label: 'Side A' },
  { value: 'B', label: 'Side B' },
  { value: 'Other', label: 'Other / Additional Face' },
];


const ROTATION_TYPE_OPTIONS = [
  { value: '', label: 'Not Specified' },
  { value: 'static', label: 'Static Billboard' },
  { value: 'digital', label: 'Digital Rotation' },
];


const getPhotoTitle = (photo, index) => {
  if (photo?.title) return photo.title;

  if (photo?.photoType) {
    return `${photo.photoType.replaceAll('_', ' ')} photo`;
  }

  return `Photo ${index + 1}`;
};


const getPhotoTypeMeta = (photoType) => {
  return (
    [...PHOTO_TYPE_OPTIONS, ...OFFICE_PHOTO_TYPE_OPTIONS].find((item) => item.value === photoType) || {
      value: photoType || PHOTO_TYPES.OTHER,
      label: (photoType || 'photo').replaceAll('_', ' '),
      icon: '📎',
    }
  );
};


const getPhotoTypeLabel = (photoType) =>
  getPhotoTypeMeta(photoType).label;


const getPhotoTypeIcon = (photoType) =>
  getPhotoTypeMeta(photoType).icon;


const getBillboardSideLabel = (side) => {
  if (!side) return '';

  const found = BILLBOARD_SIDE_OPTIONS.find(
    (option) => option.value === side
  );

  return found?.label || side;
};


const getRotationLabel = (rotationType) => {
  if (!rotationType) return '';

  const found = ROTATION_TYPE_OPTIONS.find(
    (option) => option.value === rotationType
  );

  return found?.label || rotationType;
};


const getCreativePositionLabel = (photo) => {
  const slot = Number(photo?.creativeSlot || 0);
  const total = Number(photo?.creativeTotal || 0);

  if (!slot && !total) return '';

  if (slot && total) {
    return `Design ${slot} of ${total}`;
  }

  if (slot) {
    return `Design ${slot}`;
  }

  return `${total} designs`;
};


const PhotoGallery = ({
  location = null,
  locationId = '',
  fallbackPhotoUrl = '',
  fallbackTitle = '',
  canEdit = true,

  // Current callback name.
  onPhotosChange,

  // Kept for compatibility with earlier MarketingSidebar versions.
  onLocationUpdate,
}) => {
  const isSettingsOffice =
    location?.source === 'settings_office' ||
    location?.sourceType === 'office';

  const isOffice = isSettingsOffice || location?.type === 'office';

  const resolvedParentType = isSettingsOffice ? 'office' : 'location';

  const resolvedParentId = isSettingsOffice
    ? location?.settingsOfficeId || location?.sourceId || ''
    : locationId || location?.sourceId || location?.id || '';

  // Keep the UI/map ID separate from the UUID used by Supabase.
  const resolvedLocationId = locationId || location?.id || resolvedParentId || '';

  const resolvedPhotoParent = useMemo(
    () => ({
      parentType: resolvedParentType,
      parentId: resolvedParentId,
    }),
    [resolvedParentId, resolvedParentType]
  );

  const activePhotoTypeOptions = isOffice
    ? OFFICE_PHOTO_TYPE_OPTIONS
    : PHOTO_TYPE_OPTIONS;

  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [fullscreen, setFullscreen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState('');

  const [photoType, setPhotoType] = useState(
    isOffice ? PHOTO_TYPES.EXTERIOR : PHOTO_TYPES.BILLBOARD
  );

  const [assetFilter, setAssetFilter] = useState('all');
  const [dragActive, setDragActive] = useState(false);

  const [creativeDraft, setCreativeDraft] = useState({
    billboardSide: '',
    facingDirection: '',
    rotationType: '',
    creativeName: '',
    creativeSlot: '',
    creativeTotal: '',
    displayNotes: '',
  });

  const [isSavingCreative, setIsSavingCreative] = useState(false);
  const [creativeSaved, setCreativeSaved] = useState(false);


  useEffect(() => {
    setPhotoType(isOffice ? PHOTO_TYPES.EXTERIOR : PHOTO_TYPES.BILLBOARD);
    setAssetFilter('all');
  }, [isOffice, resolvedParentId]);


  const fallbackPhoto = useMemo(() => {
    if (!fallbackPhotoUrl) return null;

    return {
      id: 'fallback-photo',
      locationId: resolvedLocationId,

      photoUrl: fallbackPhotoUrl,

      photoType: isOffice ? PHOTO_TYPES.EXTERIOR : PHOTO_TYPES.BILLBOARD,

      title:
        fallbackTitle ||
        location?.name ||
        'Main Photo',

      description:
        'Legacy photo from marketing_locations.photo_url or graphic_url.',

      billboardSide: '',
      facingDirection: '',
      rotationType: '',
      creativeName: '',
      creativeSlot: null,
      creativeTotal: null,
      displayNotes: '',

      sortOrder: 0,
      isPrimary: true,
      isFallback: true,
    };
  }, [
    fallbackPhotoUrl,
    fallbackTitle,
    location?.name,
    resolvedLocationId,
    isOffice,
  ]);


  const allDisplayPhotos = useMemo(() => {
    if (photos.length > 0) {
      return photos;
    }

    return fallbackPhoto ? [fallbackPhoto] : [];
  }, [fallbackPhoto, photos]);


  const assetCounts = useMemo(() => {
    return allDisplayPhotos.reduce(
      (acc, photo) => {
        const key =
          photo.photoType ||
          PHOTO_TYPES.OTHER;

        acc[key] =
          (acc[key] || 0) + 1;

        acc.all =
          (acc.all || 0) + 1;

        return acc;
      },
      { all: 0 }
    );
  }, [allDisplayPhotos]);


  const displayPhotos = useMemo(() => {
    if (assetFilter === 'all') {
      return allDisplayPhotos;
    }

    return allDisplayPhotos.filter(
      (photo) =>
        photo.photoType === assetFilter
    );
  }, [
    allDisplayPhotos,
    assetFilter,
  ]);


  const activePhoto =
    displayPhotos[activeIndex] ||
    displayPhotos[0] ||
    null;


  const editablePhotos =
    displayPhotos.filter(
      (photo) => !photo.isFallback
    );


  useEffect(() => {
    if (!activePhoto) {
      setCreativeDraft({
        billboardSide: '',
        facingDirection: '',
        rotationType: '',
        creativeName: '',
        creativeSlot: '',
        creativeTotal: '',
        displayNotes: '',
      });
      setCreativeSaved(false);
      return;
    }

    setCreativeDraft({
      billboardSide: activePhoto.billboardSide || '',
      facingDirection: activePhoto.facingDirection || '',
      rotationType: activePhoto.rotationType || '',
      creativeName: activePhoto.creativeName || '',
      creativeSlot: activePhoto.creativeSlot ?? '',
      creativeTotal: activePhoto.creativeTotal ?? '',
      displayNotes: activePhoto.displayNotes || '',
    });

    setCreativeSaved(false);
  }, [activePhoto]);


  const notifyPhotosChange = useCallback(
    (nextPhotos) => {
      if (typeof onPhotosChange === 'function') {
        onPhotosChange(nextPhotos);
      }

      if (typeof onLocationUpdate === 'function') {
        onLocationUpdate(resolvedLocationId, nextPhotos);
      }
    },
    [
      onPhotosChange,
      onLocationUpdate,
      resolvedLocationId,
    ]
  );


  const loadPhotos = useCallback(
    async () => {
      if (!resolvedParentId) {
        setPhotos([]);
        setActiveIndex(0);
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const nextPhotos =
          await getMarketingPhotosByLocation(
            resolvedPhotoParent
          );

        setPhotos(nextPhotos);
        setActiveIndex(0);
      } catch (loadError) {
        console.error(
          'Error loading marketing photos:',
          loadError
        );

        setError(
          loadError?.message ||
            'Could not load photos.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [resolvedParentId, resolvedPhotoParent]
  );


  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);


  useEffect(() => {
    setActiveIndex(0);
  }, [
    assetFilter,
    resolvedLocationId,
  ]);


  useEffect(() => {
    if (
      activeIndex >
      displayPhotos.length - 1
    ) {
      setActiveIndex(
        Math.max(
          displayPhotos.length - 1,
          0
        )
      );
    }
  }, [
    activeIndex,
    displayPhotos.length,
  ]);


  const goPrevious = useCallback(() => {
    if (displayPhotos.length <= 1) {
      return;
    }

    setActiveIndex((current) =>
      current === 0
        ? displayPhotos.length - 1
        : current - 1
    );
  }, [displayPhotos.length]);


  const goNext = useCallback(() => {
    if (displayPhotos.length <= 1) {
      return;
    }

    setActiveIndex((current) =>
      current === displayPhotos.length - 1
        ? 0
        : current + 1
    );
  }, [displayPhotos.length]);


  useEffect(() => {
    if (!fullscreen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }

      if (event.key === 'ArrowLeft') {
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        goNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () =>
      window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, goPrevious, goNext]);


  const uploadFiles = async (
    fileList
  ) => {
    const files = Array.from(
      fileList || []
    ).filter((file) =>
      file?.type?.startsWith(
        'image/'
      )
    );

    if (!resolvedParentId) {
      setError(
        'Save the marketing location before uploading gallery photos.'
      );

      return;
    }

    if (files.length === 0) {
      setError(
        'Please choose at least one image file.'
      );

      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const existingCount =
        photos.length;

      const uploaded = [];

      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file = files[index];

        const uploadedPhoto =
          await uploadAndCreateMarketingPhoto(
            {
              file,

              parentType: resolvedParentType,
              parentId: resolvedParentId,

              photoType,

              title: file.name,

              sortOrder:
                existingCount +
                index,

              isPrimary:
                existingCount === 0 &&
                index === 0,
            }
          );

        uploaded.push(
          uploadedPhoto
        );
      }

      const nextPhotos =
        await getMarketingPhotosByLocation(
          resolvedPhotoParent
        );

      setPhotos(nextPhotos);

      const firstUploadedId =
        uploaded[0]?.id;

      const nextIndex =
        firstUploadedId
          ? nextPhotos.findIndex(
              (photo) =>
                photo.id ===
                firstUploadedId
            )
          : Math.max(
              nextPhotos.length -
                uploaded.length,
              0
            );

      setActiveIndex(
        nextIndex >= 0
          ? nextIndex
          : 0
      );

      notifyPhotosChange(
        nextPhotos
      );
    } catch (uploadError) {
      console.error(
        'Error uploading marketing photo:',
        uploadError
      );

      setError(
        uploadError?.message ||
          'Could not upload photo.'
      );
    } finally {
      setIsUploading(false);
      setDragActive(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          '';
      }
    }
  };


  const handleSetPrimary =
    async (photo) => {
      if (
        !photo?.id ||
        photo.isFallback ||
        photo.isPrimary
      ) {
        return;
      }

      setIsSaving(true);
      setError('');

      try {
        const primaryPhoto =
          await setPrimaryMarketingPhoto(
            photo.id
          );

        const nextPhotos =
          await getMarketingPhotosByLocation({
            parentType: primaryPhoto.parentType,
            parentId: primaryPhoto.parentId,
          });

        setPhotos(nextPhotos);

        setActiveIndex(0);

        notifyPhotosChange(
          nextPhotos
        );
      } catch (saveError) {
        console.error(
          'Error setting primary marketing photo:',
          saveError
        );

        setError(
          saveError?.message ||
            'Could not set primary photo.'
        );
      } finally {
        setIsSaving(false);
      }
    };


  const handleDeletePhoto =
    async (photo) => {
      if (
        !photo?.id ||
        photo.isFallback
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          'Delete this photo from the gallery?'
        );

      if (!confirmed) {
        return;
      }

      setIsSaving(true);
      setError('');

      try {
        await deleteMarketingPhoto(
          photo.id,
          {
            deleteFile: true,
          }
        );

        const nextPhotos =
          await getMarketingPhotosByLocation(
            resolvedPhotoParent
          );

        setPhotos(nextPhotos);

        setActiveIndex(
          (current) =>
            Math.max(
              Math.min(
                current,
                nextPhotos.length -
                  1
              ),
              0
            )
        );

        notifyPhotosChange(
          nextPhotos
        );
      } catch (deleteError) {
        console.error(
          'Error deleting marketing photo:',
          deleteError
        );

        setError(
          deleteError?.message ||
            'Could not delete photo.'
        );
      } finally {
        setIsSaving(false);
      }
    };


  const handleUpdatePhoto =
    async (
      photo,
      changes
    ) => {
      if (
        !photo?.id ||
        photo.isFallback
      ) {
        return;
      }

      setError('');

      try {
        const updated =
          await updateMarketingPhoto(
            photo.id,
            changes
          );

        setPhotos(
          (currentPhotos) => {
            const nextPhotos =
              currentPhotos.map(
                (item) =>
                  item.id ===
                  updated.id
                    ? updated
                    : item
              );

            notifyPhotosChange(
              nextPhotos
            );

            return nextPhotos;
          }
        );
      } catch (updateError) {
        console.error(
          'Error updating photo:',
          updateError
        );

        setError(
          updateError?.message ||
            'Could not update photo.'
        );
      }
    };


  const updateCreativeDraft = (field, value) => {
    setCreativeDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
    setCreativeSaved(false);
  };


  const handleSaveCreativeDetails = async () => {
    if (!activePhoto?.id || activePhoto.isFallback) return;

    setIsSavingCreative(true);
    setCreativeSaved(false);
    setError('');

    try {
      const updated = await updateMarketingPhoto(activePhoto.id, {
        billboardSide: creativeDraft.billboardSide,
        facingDirection: creativeDraft.facingDirection,
        rotationType: creativeDraft.rotationType,
        creativeName: creativeDraft.creativeName,
        creativeSlot: creativeDraft.creativeSlot,
        creativeTotal: creativeDraft.creativeTotal,
        displayNotes: creativeDraft.displayNotes,
      });

      // Update only the local gallery state. Do not notify the whole parent
      // for ordinary creative metadata edits, which prevents the strobing.
      setPhotos((currentPhotos) =>
        currentPhotos.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setCreativeSaved(true);
    } catch (saveError) {
      console.error('Error saving creative details:', saveError);
      setError(
        saveError?.message ||
          'Could not save billboard creative details.'
      );
    } finally {
      setIsSavingCreative(false);
    }
  };


  const handleMovePhoto =
    async (
      photo,
      direction
    ) => {
      if (
        !photo?.id ||
        photo.isFallback ||
        editablePhotos.length <= 1
      ) {
        return;
      }

      setIsSaving(true);
      setError('');

      try {
        const nextPhotos =
          await moveMarketingPhoto(
            {
              photos:
                editablePhotos,

              photoId:
                photo.id,

              direction,
            }
          );

        setPhotos(nextPhotos);

        const nextIndex =
          nextPhotos.findIndex(
            (item) =>
              item.id ===
              photo.id
          );

        setActiveIndex(
          nextIndex >= 0
            ? nextIndex
            : 0
        );

        notifyPhotosChange(
          nextPhotos
        );
      } catch (moveError) {
        console.error(
          'Error reordering photos:',
          moveError
        );

        setError(
          moveError?.message ||
            'Could not reorder photos.'
        );
      } finally {
        setIsSaving(false);
      }
    };


  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);

    if (
      !canEdit ||
      isUploading
    ) {
      return;
    }

    uploadFiles(
      event.dataTransfer.files
    );
  };


  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canEdit) {
      return;
    }

    if (
      event.type ===
        'dragenter' ||
      event.type ===
        'dragover'
    ) {
      setDragActive(true);
    }

    if (
      event.type ===
      'dragleave'
    ) {
      setDragActive(false);
    }
  };


  const activeSideLabel =
    getBillboardSideLabel(
      activePhoto?.billboardSide
    );

  const activeRotationLabel =
    getRotationLabel(
      activePhoto?.rotationType
    );

  const activeCreativePosition =
    getCreativePositionLabel(
      activePhoto
    );

  const draftSideLabel =
    getBillboardSideLabel(
      creativeDraft.billboardSide
    );

  const draftRotationLabel =
    getRotationLabel(
      creativeDraft.rotationType
    );

  const draftCreativePosition =
    getCreativePositionLabel({
      creativeSlot: creativeDraft.creativeSlot,
      creativeTotal: creativeDraft.creativeTotal,
    });


  return (
    <section
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
            }}
          >
            Photo Gallery
          </h3>

          <span
            style={{
              color: '#64748b',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {displayPhotos.length ===
            0
              ? 'No photos uploaded yet.'
              : `Photo ${Math.min(
                  activeIndex + 1,
                  displayPhotos.length
                )} of ${
                  displayPhotos.length
                }`}
          </span>
        </div>

        {canEdit && (
          <select
            value={photoType}
            onChange={(event) =>
              setPhotoType(
                event.target.value
              )
            }
            style={{
              border:
                '1px solid #e2e8f0',

              borderRadius: 10,

              padding:
                '7px 8px',

              fontWeight: 800,

              color: '#334155',

              background: '#fff',
            }}
          >
            {activePhotoTypeOptions.filter(
              (option) =>
                option.value !==
                'all'
            ).map((option) => (
              <option
                key={
                  option.value
                }
                value={
                  option.value
                }
              >
                {option.icon}{' '}
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>


      {error && (
        <div
          className={
            styles.errorBanner
          }
        >
          {error}
        </div>
      )}


      {allDisplayPhotos.length >
        0 && (
        <div
          style={{
            display: 'flex',
            gap: 7,
            overflowX: 'auto',
            paddingBottom: 3,
          }}
        >
          {activePhotoTypeOptions.filter(
            (option) =>
              option.value ===
                'all' ||
              assetCounts[
                option.value
              ]
          ).map((option) => (
            <button
              key={
                option.value
              }
              type="button"
              onClick={() =>
                setAssetFilter(
                  option.value
                )
              }
              style={{
                border:
                  assetFilter ===
                  option.value
                    ? '1px solid #0ea5e9'
                    : '1px solid #e2e8f0',

                background:
                  assetFilter ===
                  option.value
                    ? '#eff6ff'
                    : '#ffffff',

                color:
                  assetFilter ===
                  option.value
                    ? '#0369a1'
                    : '#475569',

                borderRadius: 999,

                padding:
                  '6px 9px',

                fontWeight: 900,

                fontSize: 11,

                whiteSpace:
                  'nowrap',

                cursor: 'pointer',
              }}
            >
              {option.icon}{' '}
              {option.label} (
              {assetCounts[
                option.value
              ] || 0}
              )
            </button>
          ))}
        </div>
      )}


      <div
        onDragEnter={
          handleDrag
        }
        onDragOver={
          handleDrag
        }
        onDragLeave={
          handleDrag
        }
        onDrop={handleDrop}
        className={
          styles.imagePreview
        }
        style={{
          minHeight: 260,

          borderStyle:
            dragActive
              ? 'dashed'
              : undefined,

          borderColor:
            dragActive
              ? '#0ea5e9'
              : undefined,

          background:
            dragActive
              ? '#eff6ff'
              : undefined,

          position:
            'relative',
        }}
      >
        {isLoading ? (
          <strong
            style={{
              color: '#64748b',
            }}
          >
            Loading photos...
          </strong>
        ) : activePhoto ? (
          <>
            <img
              src={
                activePhoto.photoUrl
              }
              alt={getPhotoTitle(
                activePhoto,
                activeIndex
              )}
              onClick={() =>
                setFullscreen(
                  true
                )
              }
              style={{
                cursor:
                  'zoom-in',
              }}
            />


            <div
              style={{
                position:
                  'absolute',

                top: 12,

                left: 12,

                display: 'flex',

                gap: 6,

                flexWrap:
                  'wrap',

                maxWidth:
                  'calc(100% - 100px)',
              }}
            >
              <span
                style={{
                  background:
                    '#e0f2fe',

                  color:
                    '#075985',

                  border:
                    '1px solid #bae6fd',

                  borderRadius:
                    999,

                  padding:
                    '5px 9px',

                  fontSize: 11,

                  fontWeight:
                    950,
                }}
              >
                {getPhotoTypeIcon(
                  activePhoto.photoType
                )}{' '}
                {getPhotoTypeLabel(
                  activePhoto.photoType
                )}
              </span>


              {activeSideLabel && (
                <span
                  style={{
                    background:
                      '#ede9fe',

                    color:
                      '#5b21b6',

                    border:
                      '1px solid #ddd6fe',

                    borderRadius:
                      999,

                    padding:
                      '5px 9px',

                    fontSize: 11,

                    fontWeight:
                      950,
                  }}
                >
                  {activeSideLabel}
                </span>
              )}


              {activeCreativePosition && (
                <span
                  style={{
                    background:
                      '#fef3c7',

                    color:
                      '#92400e',

                    border:
                      '1px solid #fde68a',

                    borderRadius:
                      999,

                    padding:
                      '5px 9px',

                    fontSize: 11,

                    fontWeight:
                      950,
                  }}
                >
                  {
                    activeCreativePosition
                  }
                </span>
              )}


              {activeRotationLabel && (
                <span
                  style={{
                    background:
                      '#f1f5f9',

                    color:
                      '#475569',

                    border:
                      '1px solid #e2e8f0',

                    borderRadius:
                      999,

                    padding:
                      '5px 9px',

                    fontSize: 11,

                    fontWeight:
                      950,
                  }}
                >
                  {
                    activeRotationLabel
                  }
                </span>
              )}


              {activePhoto.isPrimary && (
                <span
                  style={{
                    background:
                      '#dcfce7',

                    color:
                      '#166534',

                    border:
                      '1px solid #bbf7d0',

                    borderRadius:
                      999,

                    padding:
                      '5px 9px',

                    fontSize: 11,

                    fontWeight:
                      950,
                  }}
                >
                  Primary
                </span>
              )}


              {activePhoto.isFallback && (
                <span
                  style={{
                    background:
                      '#fef3c7',

                    color:
                      '#92400e',

                    border:
                      '1px solid #fde68a',

                    borderRadius:
                      999,

                    padding:
                      '5px 9px',

                    fontSize: 11,

                    fontWeight:
                      950,
                  }}
                >
                  Legacy
                </span>
              )}
            </div>


            <button
              type="button"
              className={
                styles.secondaryBtn
              }
              onClick={() =>
                setFullscreen(
                  true
                )
              }
              style={{
                position:
                  'absolute',

                right: 12,

                top: 12,
              }}
            >
              Fullscreen
            </button>


            {displayPhotos.length >
              1 && (
              <>
                <button
                  type="button"
                  onClick={
                    goPrevious
                  }
                  className={
                    styles.secondaryBtn
                  }
                  style={{
                    position:
                      'absolute',

                    left: 10,

                    top: '50%',

                    transform:
                      'translateY(-50%)',
                  }}
                  aria-label="Previous photo"
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={
                    goNext
                  }
                  className={
                    styles.secondaryBtn
                  }
                  style={{
                    position:
                      'absolute',

                    right: 10,

                    top: '50%',

                    transform:
                      'translateY(-50%)',
                  }}
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            )}
          </>
        ) : (
          <div
            style={{
              textAlign:
                'center',

              color:
                '#64748b',

              fontWeight:
                850,
            }}
          >
            <div
              style={{
                fontSize: 28,
                marginBottom: 6,
              }}
            >
              📸
            </div>

            <div>
              {assetFilter ===
              'all'
                ? 'Drop photos here or upload from below.'
                : 'No photos in this asset category.'}
            </div>
          </div>
        )}
      </div>


      {activePhoto && (
        <div
          style={{
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',

              justifyContent:
                'space-between',

              gap: 10,

              alignItems:
                'flex-start',
            }}
          >
            <div
              style={{
                display: 'grid',
                gap: 3,
                minWidth: 0,
              }}
            >
              <strong
                style={{
                  color:
                    '#0f172a',
                }}
              >
                {getPhotoTitle(
                  activePhoto,
                  activeIndex
                )}
              </strong>


              <span
                style={{
                  color:
                    '#64748b',

                  fontSize: 12,

                  fontWeight:
                    800,
                }}
              >
                {getPhotoTypeIcon(
                  activePhoto.photoType
                )}{' '}
                {getPhotoTypeLabel(
                  activePhoto.photoType
                )}

                {activePhoto.description
                  ? ` • ${activePhoto.description}`
                  : ''}
              </span>


              {(activeSideLabel ||
                activePhoto.facingDirection ||
                activePhoto.creativeName ||
                activeCreativePosition) && (
                <span
                  style={{
                    color:
                      '#475569',

                    fontSize: 11,

                    fontWeight:
                      850,

                    lineHeight:
                      1.5,
                  }}
                >
                  {[
                    activeSideLabel,

                    activePhoto
                      .facingDirection,

                    activePhoto
                      .creativeName,

                    activeCreativePosition,
                  ]
                    .filter(
                      Boolean
                    )
                    .join(' • ')}
                </span>
              )}
            </div>


            {!activePhoto.isFallback &&
              canEdit && (
                <div
                  style={{
                    display:
                      'flex',

                    gap: 8,

                    flexWrap:
                      'wrap',

                    justifyContent:
                      'flex-end',
                  }}
                >
                  <button
                    type="button"
                    className={
                      styles.secondaryBtn
                    }
                    onClick={() =>
                      handleMovePhoto(
                        activePhoto,
                        -1
                      )
                    }
                    disabled={
                      isSaving ||
                      activeIndex <=
                        0
                    }
                  >
                    Move Up
                  </button>


                  <button
                    type="button"
                    className={
                      styles.secondaryBtn
                    }
                    onClick={() =>
                      handleMovePhoto(
                        activePhoto,
                        1
                      )
                    }
                    disabled={
                      isSaving ||
                      activeIndex >=
                        editablePhotos.length -
                          1
                    }
                  >
                    Move Down
                  </button>


                  <button
                    type="button"
                    className={
                      styles.secondaryBtn
                    }
                    onClick={() =>
                      handleSetPrimary(
                        activePhoto
                      )
                    }
                    disabled={
                      isSaving ||
                      activePhoto.isPrimary
                    }
                  >
                    Set Primary
                  </button>


                  <button
                    type="button"
                    className={
                      styles.dangerBtn
                    }
                    onClick={() =>
                      handleDeletePhoto(
                        activePhoto
                      )
                    }
                    disabled={
                      isSaving
                    }
                  >
                    Delete
                  </button>
                </div>
              )}
          </div>


          {!activePhoto.isFallback &&
            canEdit && (
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display:
                      'grid',

                    gap: 8,

                    border:
                      '1px solid #e2e8f0',

                    borderRadius:
                      14,

                    padding:
                      11,

                    background:
                      '#f8fafc',
                  }}
                >
                  <strong
                    style={{
                      color:
                        '#0f172a',

                      fontSize: 13,
                    }}
                  >
                    Photo Information
                  </strong>


                  <label
                    style={{
                      display:
                        'grid',

                      gap: 5,

                      fontSize: 12,

                      color:
                        '#334155',

                      fontWeight:
                        850,
                    }}
                  >
                    Photo Title

                    <input
                      key={`title-${activePhoto.id}`}
                      defaultValue={
                        activePhoto.title ||
                        ''
                      }
                      onBlur={(
                        event
                      ) =>
                        handleUpdatePhoto(
                          activePhoto,
                          {
                            title:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      style={{
                        border:
                          '1px solid #e2e8f0',

                        borderRadius:
                          10,

                        padding: 8,
                      }}
                    />
                  </label>


                  <label
                    style={{
                      display:
                        'grid',

                      gap: 5,

                      fontSize: 12,

                      color:
                        '#334155',

                      fontWeight:
                        850,
                    }}
                  >
                    Photo Type

                    <select
                      value={
                        activePhoto.photoType ||
                        (isOffice ? PHOTO_TYPES.EXTERIOR : PHOTO_TYPES.BILLBOARD)
                      }
                      onChange={(
                        event
                      ) =>
                        handleUpdatePhoto(
                          activePhoto,
                          {
                            photoType:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      style={{
                        border:
                          '1px solid #e2e8f0',

                        borderRadius:
                          10,

                        padding: 8,
                      }}
                    >
                      {activePhotoTypeOptions.filter(
                        (option) =>
                          option.value !==
                          'all'
                      ).map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.icon
                            }{' '}
                            {
                              option.label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label
                    style={{
                      display:
                        'grid',

                      gap: 5,

                      fontSize: 12,

                      color:
                        '#334155',

                      fontWeight:
                        850,
                    }}
                  >
                    Description

                    <textarea
                      key={`description-${activePhoto.id}`}
                      defaultValue={
                        activePhoto.description ||
                        ''
                      }
                      onBlur={(
                        event
                      ) =>
                        handleUpdatePhoto(
                          activePhoto,
                          {
                            description:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      rows={2}
                      style={{
                        border:
                          '1px solid #e2e8f0',

                        borderRadius:
                          10,

                        padding: 8,
                      }}
                    />
                  </label>
                </div>


                <div
                  style={{
                    display:
                      isOffice ? 'none' : 'grid',

                    gap: 10,

                    border:
                      '1px solid #bae6fd',

                    borderRadius:
                      14,

                    padding:
                      11,

                    background:
                      '#f8fbff',
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display:
                          'block',

                        color:
                          '#075985',

                        fontSize:
                          13,
                      }}
                    >
                      Billboard / Creative Details
                    </strong>

                    <small
                      style={{
                        display:
                          'block',

                        marginTop: 3,

                        color:
                          '#64748b',

                        fontWeight:
                          750,

                        lineHeight:
                          1.4,
                      }}
                    >
                      Use these fields to identify which side of the billboard and which creative/design this photo represents.
                    </small>
                  </div>


                  <div
                    style={{
                      display:
                        'grid',

                      gridTemplateColumns:
                        'repeat(2, minmax(0, 1fr))',

                      gap: 8,
                    }}
                  >
                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Billboard Side

                      <select
                        value={creativeDraft.billboardSide}
                        onChange={(event) =>
                          updateCreativeDraft(
                            'billboardSide',
                            event.target.value
                          )
                        }
                      >
                        {BILLBOARD_SIDE_OPTIONS.map(
                          (
                            option
                          ) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>


                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Facing Direction

                      <input
                        value={creativeDraft.facingDirection}
                        placeholder="Example: Northbound"
                        onChange={(event) =>
                          updateCreativeDraft(
                            'facingDirection',
                            event.target.value
                          )
                        }
                      />
                    </label>


                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Display Type

                      <select
                        value={creativeDraft.rotationType}
                        onChange={(event) =>
                          updateCreativeDraft(
                            'rotationType',
                            event.target.value
                          )
                        }
                      >
                        {ROTATION_TYPE_OPTIONS.map(
                          (
                            option
                          ) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>


                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Creative / Design Name

                      <input
                        value={creativeDraft.creativeName}
                        placeholder="Example: We Do Taxes"
                        onChange={(event) =>
                          updateCreativeDraft(
                            'creativeName',
                            event.target.value
                          )
                        }
                      />
                    </label>


                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Design Number

                      <input
                        type="number"
                        min="1"
                        value={creativeDraft.creativeSlot}
                        placeholder="1"
                        onChange={(event) =>
                          updateCreativeDraft(
                            'creativeSlot',
                            event.target.value
                          )
                        }
                      />
                    </label>


                    <label
                      style={{
                        display:
                          'grid',

                        gap: 5,

                        fontSize:
                          12,

                        color:
                          '#334155',

                        fontWeight:
                          850,

                        minWidth: 0,
                      }}
                    >
                      Total Designs on This Side

                      <input
                        type="number"
                        min="1"
                        value={creativeDraft.creativeTotal}
                        placeholder={
                          creativeDraft.rotationType === 'static'
                            ? '1'
                            : '2'
                        }
                        onChange={(event) =>
                          updateCreativeDraft(
                            'creativeTotal',
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>


                  <label
                    style={{
                      display:
                        'grid',

                      gap: 5,

                      fontSize: 12,

                      color:
                        '#334155',

                      fontWeight:
                        850,
                    }}
                  >
                    Display Notes

                    <textarea
                      value={creativeDraft.displayNotes}
                      placeholder="Example: Alternates every 8 seconds with Instant Placas design."
                      rows={3}
                      onChange={(event) =>
                        updateCreativeDraft(
                          'displayNotes',
                          event.target.value
                        )
                      }
                    />
                  </label>


                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleSaveCreativeDetails}
                      disabled={isSavingCreative}
                    >
                      {isSavingCreative
                        ? 'Saving...'
                        : 'Save Creative Details'}
                    </button>

                    {creativeSaved && (
                      <span
                        style={{
                          color: '#166534',
                          background: '#dcfce7',
                          border: '1px solid #bbf7d0',
                          padding: '6px 9px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        ✓ Saved
                      </span>
                    )}
                  </div>

                  {(creativeDraft.billboardSide ||
                    creativeDraft.facingDirection ||
                    creativeDraft.creativeName ||
                    creativeDraft.rotationType ||
                    creativeDraft.creativeSlot ||
                    creativeDraft.creativeTotal ||
                    creativeDraft.displayNotes) && (
                    <div
                      style={{
                        border: '1px solid #dbeafe',
                        borderRadius: 12,
                        padding: 9,
                        background: '#ffffff',
                        display: 'grid',
                        gap: 5,
                      }}
                    >
                      <strong
                        style={{
                          color: '#0f172a',
                          fontSize: 12,
                        }}
                      >
                        Display Summary
                      </strong>

                      <span
                        style={{
                          color: '#475569',
                          fontSize: 12,
                          fontWeight: 750,
                          lineHeight: 1.5,
                        }}
                      >
                        {[
                          draftSideLabel,
                          creativeDraft.facingDirection,
                          draftRotationLabel,
                          creativeDraft.creativeName,
                          draftCreativePosition,
                        ]
                          .filter(Boolean)
                          .join(' • ') ||
                          'No billboard details entered yet.'}
                      </span>

                      {creativeDraft.displayNotes && (
                        <span
                          style={{
                            color: '#64748b',
                            fontSize: 11,
                            fontWeight: 750,
                          }}
                        >
                          {creativeDraft.displayNotes}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      )}


      {displayPhotos.length >
        1 && (
        <div
          style={{
            display: 'flex',

            gap: 8,

            overflowX:
              'auto',

            paddingBottom: 4,
          }}
        >
          {displayPhotos.map(
            (
              photo,
              index
            ) => (
              <button
                key={
                  photo.id ||
                  photo.photoUrl
                }
                type="button"
                onClick={() =>
                  setActiveIndex(
                    index
                  )
                }
                style={{
                  border:
                    index ===
                    activeIndex
                      ? '2px solid #0ea5e9'
                      : '1px solid #e2e8f0',

                  borderRadius:
                    10,

                  padding: 3,

                  background:
                    '#fff',

                  cursor:
                    'pointer',

                  width: 74,

                  height: 56,

                  flex:
                    '0 0 auto',

                  position:
                    'relative',
                }}
                aria-label={`Show ${getPhotoTitle(
                  photo,
                  index
                )}`}
              >
                <img
                  src={
                    photo.photoUrl
                  }
                  alt=""
                  style={{
                    width:
                      '100%',

                    height:
                      '100%',

                    objectFit:
                      'cover',

                    borderRadius:
                      7,

                    display:
                      'block',
                  }}
                />


                {photo.isPrimary && (
                  <span
                    style={{
                      position:
                        'absolute',

                      right: 2,

                      top: 2,

                      width: 9,

                      height: 9,

                      borderRadius:
                        999,

                      background:
                        '#22c55e',

                      border:
                        '1px solid #ffffff',
                    }}
                  />
                )}


                {photo.billboardSide && (
                  <span
                    style={{
                      position:
                        'absolute',

                      left: 3,

                      bottom: 3,

                      minWidth:
                        18,

                      height: 18,

                      borderRadius:
                        999,

                      padding:
                        '0 5px',

                      display:
                        'grid',

                      placeItems:
                        'center',

                      background:
                        'rgba(15,23,42,0.84)',

                      color:
                        '#ffffff',

                      border:
                        '1px solid rgba(255,255,255,0.75)',

                      fontSize:
                        9,

                      fontWeight:
                        950,
                    }}
                  >
                    {
                      photo.billboardSide
                    }
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}


      {allDisplayPhotos.length >
        0 && (
        <div
          style={{
            display: 'grid',

            gridTemplateColumns:
              'repeat(4, minmax(0, 1fr))',

            gap: 7,
          }}
        >
          {activePhotoTypeOptions.filter(
            (option) =>
              option.value !==
                'all' &&
              assetCounts[
                option.value
              ]
          )
            .slice(0, 8)
            .map((option) => (
              <div
                key={
                  option.value
                }
                style={{
                  border:
                    '1px solid #e2e8f0',

                  borderRadius:
                    12,

                  padding: 8,

                  background:
                    '#f8fafc',

                  textAlign:
                    'center',

                  display:
                    'grid',

                  gap: 3,
                }}
              >
                <span
                  style={{
                    fontSize:
                      15,
                  }}
                >
                  {option.icon}
                </span>

                <strong
                  style={{
                    color:
                      '#0f172a',

                    fontSize:
                      13,
                  }}
                >
                  {assetCounts[
                    option.value
                  ]}
                </strong>

                <small
                  style={{
                    color:
                      '#64748b',

                    fontWeight:
                      850,

                    fontSize: 9,
                  }}
                >
                  {
                    option.label
                  }
                </small>
              </div>
            ))}
        </div>
      )}


      {canEdit && (
        <div
          style={{
            border:
              '1px dashed #93c5fd',

            borderRadius:
              14,

            padding: 12,

            background:
              '#f8fbff',

            display:
              'grid',

            gap: 8,
          }}
        >
          <strong
            style={{
              color:
                '#075985',

              fontSize: 13,
            }}
          >
            Upload Photos
          </strong>


          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(
              event
            ) =>
              uploadFiles(
                event.target.files
              )
            }
            disabled={
              isUploading ||
              !resolvedParentId
            }
          />


          <small
            style={{
              color:
                '#64748b',

              fontWeight:
                750,
            }}
          >
            {resolvedParentId
              ? (isOffice
                  ? 'Select multiple office photos or drag images into the preview area. Classify each as exterior, interior, storefront, signage, team/office, or other.'
                  : 'Select multiple photos or drag images into the preview area. After upload, select each photo and assign its billboard side and creative details.')
              : 'Save this location before uploading gallery photos.'}
          </small>


          {isUploading && (
            <strong
              style={{
                color:
                  '#0ea5e9',
              }}
            >
              Uploading photos...
            </strong>
          )}
        </div>
      )}


      {fullscreen &&
        activePhoto && (
          <div
            onClick={() =>
              setFullscreen(
                false
              )
            }
            style={{
              position:
                'fixed',

              inset: 0,

              zIndex: 2000,

              background:
                'rgba(15,23,42,0.86)',

              display:
                'grid',

              placeItems:
                'center',

              padding: 24,
            }}
          >
            <button
              type="button"
              className={
                styles.secondaryBtn
              }
              onClick={() =>
                setFullscreen(
                  false
                )
              }
              style={{
                position:
                  'absolute',

                right: 24,

                top: 24,

                zIndex: 2,
              }}
            >
              Close
            </button>


            {displayPhotos.length >
              1 && (
              <>
                <button
                  type="button"
                  className={
                    styles.secondaryBtn
                  }
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    goPrevious();
                  }}
                  style={{
                    position:
                      'absolute',

                    left: 24,

                    top: '50%',

                    transform:
                      'translateY(-50%)',

                    zIndex: 2,
                  }}
                >
                  ‹
                </button>


                <button
                  type="button"
                  className={
                    styles.secondaryBtn
                  }
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    goNext();
                  }}
                  style={{
                    position:
                      'absolute',

                    right: 24,

                    top: '50%',

                    transform:
                      'translateY(-50%)',

                    zIndex: 2,
                  }}
                >
                  ›
                </button>
              </>
            )}


            <div
              onClick={(
                event
              ) =>
                event.stopPropagation()
              }
              style={{
                display:
                  'grid',

                gap: 10,

                justifyItems:
                  'center',

                maxWidth:
                  '94vw',
              }}
            >
              <img
                src={
                  activePhoto.photoUrl
                }
                alt={getPhotoTitle(
                  activePhoto,
                  activeIndex
                )}
                style={{
                  maxWidth:
                    '94vw',

                  maxHeight:
                    '82vh',

                  objectFit:
                    'contain',

                  borderRadius:
                    14,

                  boxShadow:
                    '0 30px 90px rgba(0,0,0,0.45)',

                  background:
                    '#ffffff',
                }}
              />


              {(activeSideLabel ||
                activePhoto.creativeName ||
                activeCreativePosition) && (
                <div
                  style={{
                    display:
                      'flex',

                    gap: 7,

                    flexWrap:
                      'wrap',

                    justifyContent:
                      'center',
                  }}
                >
                  {activeSideLabel && (
                    <span
                      style={{
                        background:
                          '#ede9fe',

                        color:
                          '#5b21b6',

                        borderRadius:
                          999,

                        padding:
                          '6px 10px',

                        fontWeight:
                          950,

                        fontSize:
                          11,
                      }}
                    >
                      {
                        activeSideLabel
                      }
                    </span>
                  )}


                  {activePhoto.creativeName && (
                    <span
                      style={{
                        background:
                          '#ffffff',

                        color:
                          '#0f172a',

                        borderRadius:
                          999,

                        padding:
                          '6px 10px',

                        fontWeight:
                          950,

                        fontSize:
                          11,
                      }}
                    >
                      {
                        activePhoto.creativeName
                      }
                    </span>
                  )}


                  {activeCreativePosition && (
                    <span
                      style={{
                        background:
                          '#fef3c7',

                        color:
                          '#92400e',

                        borderRadius:
                          999,

                        padding:
                          '6px 10px',

                        fontWeight:
                          950,

                        fontSize:
                          11,
                      }}
                    >
                      {
                        activeCreativePosition
                      }
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </section>
  );
};


export default PhotoGallery;