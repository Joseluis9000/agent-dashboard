// src/pages/admin/marketing/hooks/useMarketingMap.js

import { useCallback, useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

import {
  GOOGLE_MAPS_API_KEY,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FIT_BOUNDS_PADDING,
  MAP_OPTIONS,
  MAP_SELECTED_ZOOM,
} from '../constants/mapConfig';

import {
  createInfoWindowHtml,
  getMapPosition,
  getValidMapLocations,
} from '../utils/mapHelpers';

import { getStatusMeta } from '../utils/marketingHelpers';

import {
  isOfficeLocation,
} from '../utils/locationTypeHelpers';


let googleMapsConfigured = false;


const configureGoogleMaps = () => {
  if (googleMapsConfigured) return;

  setOptions({
    key: GOOGLE_MAPS_API_KEY,
    v: 'weekly',
  });

  googleMapsConfigured = true;
};


const clearMarkers = (markersRef) => {
  markersRef.current.forEach((markerRecord) => {
    if (markerRecord?.listener?.remove) {
      markerRecord.listener.remove();
    }

    if (markerRecord?.marker?.map !== undefined) {
      markerRecord.marker.map = null;
    }

    if (
      typeof markerRecord?.marker?.setMap ===
      'function'
    ) {
      markerRecord.marker.setMap(null);
    }
  });

  markersRef.current = [];
};


const clearCircle = (circleRef) => {
  if (circleRef.current) {
    circleRef.current.setMap(null);
    circleRef.current = null;
  }
};


const getMarkerByLocationId = (
  markersRef,
  locationId
) => {
  return (
    markersRef.current.find(
      (markerRecord) =>
        markerRecord.locationId === locationId
    ) || null
  );
};


const getMarkerAnchor = (markerRecord) =>
  markerRecord?.marker || null;


/*
|--------------------------------------------------------------------------
| CUSTOM MAP ICONS
|--------------------------------------------------------------------------
|
| These files live inside:
|
| public/marketing-icons/
|
| Because they are inside React's public folder, they are accessed from
| the root URL instead of imported.
|
*/

const MARKER_ICONS = {
  office: '/marketing-icons/office.png',
  billboard: '/marketing-icons/billboard.png',
  dmv_video: '/marketing-icons/dmv.png',
};


const getMarkerIconUrl = (location) => {
  if (isOfficeLocation(location)) {
    return MARKER_ICONS.office;
  }

  if (location?.type === 'dmv_video') {
    return MARKER_ICONS.dmv_video;
  }

  if (location?.type === 'billboard') {
    return MARKER_ICONS.billboard;
  }

  return null;
};


/*
|--------------------------------------------------------------------------
| STATUS COLOR
|--------------------------------------------------------------------------
|
| Used only as a fallback if a future map item does not have a custom icon.
|
*/

const getMarkerStatusColor = (location) => {
  if (isOfficeLocation(location)) {
    return '#0ea5e9';
  }

  return (
    getStatusMeta(location?.status).color ||
    '#22c55e'
  );
};


/*
|--------------------------------------------------------------------------
| ADVANCED MARKER CONTENT
|--------------------------------------------------------------------------
|
| Custom PNG files are displayed directly with transparent backgrounds.
|
*/

const createCustomMarkerContent = ({
  location,
  isSelected,
  zoom = 10,
}) => {
  const iconUrl =
    getMarkerIconUrl(location);

  const statusColor =
    getMarkerStatusColor(location);


  /*
  |--------------------------------------------------------------------------
  | FALLBACK
  |--------------------------------------------------------------------------
  |
  | If another physical marketing type is added later but doesn't have a
  | custom PNG yet, show a normal colored marker instead of breaking.
  |
  */

  if (!iconUrl) {
    const fallback =
      document.createElement('div');

    fallback.textContent = 'M';

    fallback.style.width =
      isSelected ? '46px' : '38px';

    fallback.style.height =
      isSelected ? '46px' : '38px';

    fallback.style.borderRadius =
      '999px';

    fallback.style.background =
      statusColor;

    fallback.style.color =
      '#ffffff';

    fallback.style.border =
      '4px solid #ffffff';

    fallback.style.display =
      'grid';

    fallback.style.placeItems =
      'center';

    fallback.style.fontWeight =
      '950';

    fallback.style.boxShadow =
      '0 7px 18px rgba(15,23,42,0.28)';

    fallback.style.cursor =
      'pointer';

    return fallback;
  }


  /*
  |--------------------------------------------------------------------------
  | CUSTOM TRANSPARENT ICON MARKER
  |--------------------------------------------------------------------------
  */

  const zoomScale =
    getMarkerZoomScale(zoom);

  const baseSize =
    isSelected ? 108 : 94;

  const baseImageSize =
    isSelected ? 96 : 84;

  const size =
    Math.round(baseSize * zoomScale);

  const imageSize =
    Math.round(baseImageSize * zoomScale);


  const wrapper =
    document.createElement('div');


  wrapper.style.width =
    `${size}px`;

  wrapper.style.height =
    `${size}px`;

  wrapper.style.borderRadius =
    '0';

  wrapper.style.background =
    'transparent';

  wrapper.style.border =
    'none';

  wrapper.style.display =
    'grid';

  wrapper.style.placeItems =
    'center';

  wrapper.style.boxSizing =
    'border-box';

  wrapper.style.boxShadow =
    'none';

  wrapper.style.transform =
    isSelected
      ? 'scale(1.06)'
      : 'scale(1)';

  wrapper.style.transition =
    'transform 140ms ease';

  wrapper.style.cursor =
    'pointer';


  const image =
    document.createElement('img');


  image.src =
    iconUrl;

  image.alt =
    '';

  image.width =
    imageSize;

  image.height =
    imageSize;

  image.style.width =
    `${imageSize}px`;

  image.style.height =
    `${imageSize}px`;

  image.style.objectFit =
    'contain';

  image.style.filter =
    isSelected
      ? 'drop-shadow(0 5px 8px rgba(15,23,42,0.45))'
      : 'drop-shadow(0 3px 5px rgba(15,23,42,0.30))';

  image.style.pointerEvents =
    'none';

  image.draggable =
    false;


  wrapper.appendChild(image);


  return wrapper;
};


/*
|--------------------------------------------------------------------------
| LEGACY GOOGLE MARKER FALLBACK
|--------------------------------------------------------------------------
|
| If AdvancedMarkerElement isn't available, Google Maps can still display
| the same PNG files using a normal google.maps.Marker.
|
*/

const getMarkerZoomScale = (zoom = 10) => {
  // State / California view
  if (zoom <= 6) {
    return 0.45;
  }

  // Large regional view
  if (zoom <= 7) {
    return 0.55;
  }

  // County / regional view
  if (zoom <= 8) {
    return 0.7;
  }

  // Metro area
  if (zoom <= 9) {
    return 0.85;
  }

  // City and closer
  return 1;
};

const createLegacyMarker = ({
  google,
  map,
  location,
  isSelected,
  onLocationSelect,
}) => {
  const position =
    getMapPosition(location);

  const iconUrl =
    getMarkerIconUrl(location);


  const markerOptions = {
    position,

    map,

    title:
      location.name ||
      'Marketing Location',

    animation:
      isSelected
        ? google.maps.Animation.DROP
        : null,

    zIndex:
      isSelected ? 1000 : 1,
  };


  if (iconUrl) {
    const zoomScale =
      getMarkerZoomScale(map?.getZoom?.() || 10);

    const baseSize =
      isSelected ? 100 : 88;

    const size =
      Math.round(baseSize * zoomScale);


    markerOptions.icon = {
      url: iconUrl,

      scaledSize:
        new google.maps.Size(
          size,
          size
        ),

      anchor:
        new google.maps.Point(
          size / 2,
          size / 2
        ),
    };
  } else {
    markerOptions.icon = {
      path:
        google.maps.SymbolPath.CIRCLE,

      fillColor:
        getMarkerStatusColor(
          location
        ),

      fillOpacity: 1,

      strokeColor:
        '#ffffff',

      strokeWeight:
        3,

      scale:
        isSelected ? 11 : 8,
    };
  }


  const marker =
    new google.maps.Marker(
      markerOptions
    );


  const listener =
    marker.addListener(
      'click',
      () =>
        onLocationSelect(
          location
        )
    );


  return {
    marker,
    listener,
  };
};


/*
|--------------------------------------------------------------------------
| ADVANCED GOOGLE MARKER
|--------------------------------------------------------------------------
*/

const createAdvancedMarker =
  async ({
    google,
    markerLibrary,
    map,
    location,
    isSelected,
    onLocationSelect,
  }) => {
    const position =
      getMapPosition(location);


    const content =
      createCustomMarkerContent({
        location,
        isSelected,
        zoom: map?.getZoom?.() || 10,
      });


    if (
      !markerLibrary
        ?.AdvancedMarkerElement
    ) {
      return createLegacyMarker({
        google,
        map,
        location,
        isSelected,
        onLocationSelect,
      });
    }


    try {
      const marker =
  new markerLibrary.AdvancedMarkerElement(
    {
      map,

      position,

      title:
        location.name ||
        'Marketing Location',

      content,

      /*
      |--------------------------------------------------------------------------
      | ALWAYS SHOW ALL MARKERS
      |--------------------------------------------------------------------------
      |
      | Every office, billboard and DMV location should remain visible.
      | Google should not hide one marker because another marker is nearby
      | or because they overlap at a wider/state-level zoom.
      |
      */

      collisionBehavior:
        markerLibrary.CollisionBehavior
          ?.REQUIRED ||
        window.google?.maps
          ?.CollisionBehavior
          ?.REQUIRED,

      zIndex:
        isSelected
          ? 1000
          : 1,
    }
  );


      const listener =
        marker.addListener(
          'click',
          () =>
            onLocationSelect(
              location
            )
        );


      return {
        marker,
        listener,
      };
    } catch (error) {
      console.warn(
        'AdvancedMarkerElement failed. Falling back to google.maps.Marker.',
        error
      );


      return createLegacyMarker({
        google,
        map,
        location,
        isSelected,
        onLocationSelect,
      });
    }
  };


const metersFromMiles = (miles) =>
  Number(miles || 0) *
  1609.344;


/*
|--------------------------------------------------------------------------
| MAIN HOOK
|--------------------------------------------------------------------------
*/

const useMarketingMap = ({
  locations = [],
  selectedLocation = null,
  onLocationSelect,
  enabled = true,
  coverageRadiusMiles = null,
  showCoverageRadius = false,
}) => {
  const mapContainerRef =
    useRef(null);

  const mapRef =
    useRef(null);

  const googleRef =
    useRef(null);

  const markerLibraryRef =
    useRef(null);

  const infoWindowRef =
    useRef(null);

  const markersRef =
    useRef([]);

  const coverageCircleRef =
    useRef(null);

  const zoomListenerRef =
    useRef(null);

  const isUnmountedRef =
    useRef(false);


  const [
    isMapReady,
    setIsMapReady,
  ] = useState(false);


  const [
    mapError,
    setMapError,
  ] = useState('');


  /*
  |--------------------------------------------------------------------------
  | DESTROY MAP
  |--------------------------------------------------------------------------
  */

  const destroyMap =
    useCallback(() => {
      clearMarkers(
        markersRef
      );

      clearCircle(
        coverageCircleRef
      );

      if (zoomListenerRef.current?.remove) {
        zoomListenerRef.current.remove();
      }

      zoomListenerRef.current = null;


      if (
        infoWindowRef.current
      ) {
        infoWindowRef.current.close();

        infoWindowRef.current =
          null;
      }


      mapRef.current =
        null;

      googleRef.current =
        null;

      markerLibraryRef.current =
        null;


      setIsMapReady(
        false
      );
    }, []);


  /*
  |--------------------------------------------------------------------------
  | PAN TO LOCATION
  |--------------------------------------------------------------------------
  */

  const panToLocation =
    useCallback(
      (
        location,
        zoom = MAP_SELECTED_ZOOM
      ) => {
        const map =
          mapRef.current;

        const position =
          getMapPosition(
            location
          );


        if (
          !map ||
          !position
        ) {
          return;
        }


        map.panTo(
          position
        );


        if (
          zoom &&
          map.getZoom() <
            zoom
        ) {
          map.setZoom(
            zoom
          );
        }
      },
      []
    );


  /*
  |--------------------------------------------------------------------------
  | FIT MAP TO LOCATIONS
  |--------------------------------------------------------------------------
  */

  const fitLocations =
    useCallback(
      (
        nextLocations =
          locations
      ) => {
        const google =
          googleRef.current;

        const map =
          mapRef.current;


        const validLocations =
          getValidMapLocations(
            nextLocations
          );


        if (
          !google ||
          !map ||
          validLocations.length ===
            0
        ) {
          return;
        }


        if (
          validLocations.length ===
          1
        ) {
          const position =
            getMapPosition(
              validLocations[0]
            );


          map.setCenter(
            position
          );


          map.setZoom(
            MAP_SELECTED_ZOOM
          );


          return;
        }


        const bounds =
          new google.maps.LatLngBounds();


        validLocations.forEach(
          (location) =>
            bounds.extend(
              getMapPosition(
                location
              )
            )
        );


        map.fitBounds(
          bounds,
          MAP_FIT_BOUNDS_PADDING
        );
      },
      [locations]
    );


  /*
  |--------------------------------------------------------------------------
  | OPEN INFO WINDOW
  |--------------------------------------------------------------------------
  */

  const openInfoWindow =
    useCallback(
      (location) => {
        const google =
          googleRef.current;

        const map =
          mapRef.current;

        const infoWindow =
          infoWindowRef.current;


        const markerRecord =
          getMarkerByLocationId(
            markersRef,
            location?.id
          );


        const marker =
          getMarkerAnchor(
            markerRecord
          );


        if (
          !google ||
          !map ||
          !infoWindow ||
          !marker ||
          !location
        ) {
          return;
        }


        infoWindow.setContent(
          createInfoWindowHtml(
            location
          )
        );


        try {
          infoWindow.open({
            anchor: marker,
            map,
          });
        } catch (error) {
          infoWindow.setPosition(
            getMapPosition(
              location
            )
          );

          infoWindow.open(
            map
          );
        }
      },
      []
    );


  /*
  |--------------------------------------------------------------------------
  | INITIALIZE GOOGLE MAP
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      !enabled ||
      !mapContainerRef.current
    ) {
      return undefined;
    }


    isUnmountedRef.current =
      false;


    let cancelled =
      false;


    const initializeMap =
      async () => {
        try {
          setMapError(
            ''
          );


          if (
            !GOOGLE_MAPS_API_KEY
          ) {
            throw new Error(
              'Missing REACT_APP_GOOGLE_MAPS_API_KEY in your .env file.'
            );
          }


          configureGoogleMaps();


          const mapsLibrary =
            await importLibrary(
              'maps'
            );


          const markerLibrary =
            await importLibrary(
              'marker'
            ).catch(
              (error) => {
                console.warn(
                  'Google marker library failed to load. Falling back to legacy markers.',
                  error
                );

                return null;
              }
            );


          if (
            cancelled ||
            isUnmountedRef.current ||
            !mapContainerRef.current
          ) {
            return;
          }


          const map =
            new mapsLibrary.Map(
              mapContainerRef.current,
              {
                ...MAP_OPTIONS,

                center: {
                  ...MAP_DEFAULT_CENTER,
                },

                zoom:
                  MAP_DEFAULT_ZOOM,
              }
            );


          mapRef.current =
            map;

          googleRef.current =
            window.google;

          markerLibraryRef.current =
            markerLibrary;


          infoWindowRef.current =
            new window.google.maps.InfoWindow();


          setIsMapReady(
            true
          );
        } catch (error) {
          console.error(
            'Error initializing Google Map:',
            error
          );


          setMapError(
            error?.message ||
              'Could not load Google Map.'
          );


          destroyMap();
        }
      };


    initializeMap();


    return () => {
      cancelled =
        true;

      isUnmountedRef.current =
        true;

      destroyMap();
    };
  }, [
    destroyMap,
    enabled,
  ]);


  /*
  |--------------------------------------------------------------------------
  | DRAW / REFRESH MARKERS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const google =
      googleRef.current;

    const markerLibrary =
      markerLibraryRef.current;

    const map =
      mapRef.current;


    if (
      !enabled ||
      !isMapReady ||
      !google ||
      !map
    ) {
      return;
    }


    let cancelled =
      false;


    const updateMarkers =
      async () => {
        clearMarkers(
          markersRef
        );


        const validLocations =
          getValidMapLocations(
            locations
          );


        if (
          validLocations.length ===
            0
        ) {
          map.setCenter({
            ...MAP_DEFAULT_CENTER,
          });


          map.setZoom(
            MAP_DEFAULT_ZOOM
          );


          return;
        }


        const markerRecords =
          await Promise.all(
            validLocations.map(
              async (
                location
              ) => {
                const isSelected =
                  selectedLocation?.id ===
                  location.id;


                const {
                  marker,
                  listener,
                } =
                  await createAdvancedMarker(
                    {
                      google,

                      markerLibrary,

                      map,

                      location,

                      isSelected,

                      onLocationSelect:
                        (
                          clickedLocation
                        ) => {
                          if (
                            typeof onLocationSelect ===
                            'function'
                          ) {
                            onLocationSelect(
                              clickedLocation
                            );
                          }
                        },
                    }
                  );


                return {
                  locationId:
                    location.id,

                  location,

                  isSelected,

                  marker,

                  listener,
                };
              }
            )
          );


        if (
          cancelled
        ) {
          markerRecords.forEach(
            (
              record
            ) => {
              if (
                record?.listener
                  ?.remove
              ) {
                record.listener.remove();
              }


              if (
                record?.marker
                  ?.map !==
                undefined
              ) {
                record.marker.map =
                  null;
              }


              if (
                typeof record?.marker
                  ?.setMap ===
                'function'
              ) {
                record.marker.setMap(
                  null
                );
              }
            }
          );


          return;
        }


        markersRef.current =
          markerRecords;


        const resizeMarkersForZoom = () => {
          const zoom =
            map.getZoom?.() || MAP_DEFAULT_ZOOM;

          const zoomScale =
            getMarkerZoomScale(zoom);

          markersRef.current.forEach((record) => {
            const isSelectedRecord =
              selectedLocation?.id === record.locationId;

            const marker =
              record?.marker;

            const content =
              marker?.content;

            if (content) {
              const baseSize =
                isSelectedRecord ? 108 : 94;

              const baseImageSize =
                isSelectedRecord ? 96 : 84;

              const nextSize =
                Math.round(baseSize * zoomScale);

              const nextImageSize =
                Math.round(baseImageSize * zoomScale);

              content.style.width =
                `${nextSize}px`;

              content.style.height =
                `${nextSize}px`;

              const image =
                content.querySelector?.('img');

              if (image) {
                image.style.width =
                  `${nextImageSize}px`;

                image.style.height =
                  `${nextImageSize}px`;
              }

              return;
            }

            if (
              typeof marker?.setIcon === 'function' &&
              getMarkerIconUrl(record.location)
            ) {
              const baseSize =
                isSelectedRecord ? 100 : 88;

              const nextSize =
                Math.round(baseSize * zoomScale);

              marker.setIcon({
                url: getMarkerIconUrl(record.location),

                scaledSize:
                  new google.maps.Size(
                    nextSize,
                    nextSize
                  ),

                anchor:
                  new google.maps.Point(
                    nextSize / 2,
                    nextSize / 2
                  ),
              });
            }
          });
        };


        if (zoomListenerRef.current?.remove) {
          zoomListenerRef.current.remove();
        }

        resizeMarkersForZoom();

        zoomListenerRef.current =
          map.addListener(
            'zoom_changed',
            resizeMarkersForZoom
          );


        /*
|--------------------------------------------------------------------------
| KEEP ALL LOCATIONS VISIBLE
|--------------------------------------------------------------------------
|
| Do not automatically zoom into the selected location when markers load.
| Fit the map around every active office and marketing location so all
| markers remain visible together.
|
*/

fitLocations(validLocations);

/*
|--------------------------------------------------------------------------
| OPEN SELECTED INFO WINDOW WITHOUT CHANGING THE MAP ZOOM
|--------------------------------------------------------------------------
*/

const selectedPosition =
  getMapPosition(selectedLocation);

if (selectedPosition) {
  window.setTimeout(
    () => {
      openInfoWindow(selectedLocation);
    },
    120
  );
}

      };

    updateMarkers();


    return () => {
      cancelled =
        true;

      if (zoomListenerRef.current?.remove) {
        zoomListenerRef.current.remove();
      }

      zoomListenerRef.current = null;
    };
  }, [
    enabled,
    fitLocations,
    isMapReady,
    locations,
    onLocationSelect,
    openInfoWindow,
    panToLocation,
    selectedLocation,
  ]);


  /*
  |--------------------------------------------------------------------------
  | COVERAGE RADIUS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const google =
      googleRef.current;

    const map =
      mapRef.current;


    const selectedPosition =
      getMapPosition(
        selectedLocation
      );


    if (
      !enabled ||
      !isMapReady ||
      !google ||
      !map
    ) {
      return;
    }


    clearCircle(
      coverageCircleRef
    );


    if (
      !showCoverageRadius ||
      !selectedPosition ||
      !coverageRadiusMiles
    ) {
      return;
    }


    coverageCircleRef.current =
      new google.maps.Circle({
        strokeColor:
          '#0ea5e9',

        strokeOpacity:
          0.65,

        strokeWeight:
          2,

        fillColor:
          '#0ea5e9',

        fillOpacity:
          0.08,

        map,

        center:
          selectedPosition,

        radius:
          metersFromMiles(
            coverageRadiusMiles
          ),

        clickable:
          false,
      });
  }, [
    coverageRadiusMiles,
    enabled,
    isMapReady,
    selectedLocation,
    showCoverageRadius,
  ]);


  /*
  |--------------------------------------------------------------------------
  | EXPOSE MAP METHODS
  |--------------------------------------------------------------------------
  */

  return {
    mapContainerRef,

    map:
      mapRef.current,

    isMapReady,

    mapError,

    panToLocation,

    fitLocations,

    openInfoWindow,

    destroyMap,
  };
};


export default useMarketingMap;