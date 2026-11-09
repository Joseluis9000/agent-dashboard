import {stampPhotoCanvas,canvasJpeg} from './photoImageStamp';
export const CORNER_VIEWS = [
  { key: 'front_right', en: 'Front right', es: 'Delantera derecha', crop: [5, 326, 310, 195], instructionEn: 'Show the front and right side together.', instructionEs: 'Muestra la parte delantera y el lado derecho juntos.' },
  { key: 'front_left', en: 'Front left', es: 'Delantera izquierda', crop: [318, 326, 310, 195], instructionEn: 'Show the front and left side together.', instructionEs: 'Muestra la parte delantera y el lado izquierdo juntos.' },
  { key: 'rear_right', en: 'Back right', es: 'Trasera derecha', crop: [5, 575, 310, 195], instructionEn: 'Show the rear and right side together.', instructionEs: 'Muestra la parte trasera y el lado derecho juntos.' },
  { key: 'rear_left', en: 'Back left', es: 'Trasera izquierda', crop: [318, 575, 310, 195], instructionEn: 'Show the rear and left side together.', instructionEs: 'Muestra la parte trasera y el lado izquierdo juntos.' },
];

export const PHOTO_TYPES = [
  ...CORNER_VIEWS.map(({ key, en }) => [key, en]),
  ['front', 'Front'], ['rear', 'Rear'], ['driver', 'Driver side'],
  ['passenger', 'Passenger side'], ['vin', 'VIN'], ['odometer', 'Odometer'],
  ['damage', 'Damage'], ['other', 'Other'],
];
export const photoLabel = (type) => PHOTO_TYPES.find(([key]) => key === type)?.[1] || type;
export const formatTime = (value) => value ? new Date(value).toLocaleString() : 'Not recorded';

export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable on this device.'));
    navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => resolve({
      latitude: coords.latitude, longitude: coords.longitude, accuracy_m: coords.accuracy,
      location_at: new Date(timestamp).toISOString(),
    }), (error) => reject(new Error(error.code === 1
      ? 'Location permission was denied. Allow it in browser settings or continue without location.'
      : 'Could not get location. Try outside with a clear view of the sky.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

// Normalize to browser-readable JPEG and cap dimensions to control mobile uploads.
export async function prepareImage(file,stamp) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This image cannot be opened. Use JPEG/PNG or take a photo with the camera.'));
      img.src = url;
    });
    const ratio = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasJpeg(stamp ? stampPhotoCanvas(canvas,stamp) : canvas);
  } finally { URL.revokeObjectURL(url); }
}

export function photoVehicle(details){return [details.vehicle_year,details.vehicle_make,details.vehicle_model].filter(Boolean).join(' ');}
export function newPhotoDetails(saved={},initialOffice=''){
  return {form_version:2,office:saved.office || initialOffice,customer_name:saved.customer_name || '',
    agency_matrix_customer_id:saved.form_version===2 ? saved.agency_matrix_customer_id || '' : '',
    policy_number:saved.form_version===2 ? saved.policy_number || '' : '',
    vehicle_year:saved.vehicle_year || '',vehicle_make:saved.vehicle_make || '',vehicle_model:saved.vehicle_model || ''};
}
