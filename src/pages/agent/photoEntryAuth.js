const KEY = 'gp_vehicle_photo_login';
const MAX_AGE = 30 * 60 * 1000;
export const PHOTO_ENTRY_ROLES = ['agent','regional','territory_manager','underwriter','uw_manager','supervisor','admin'];
export function rememberPhotoEntry() {
  try { sessionStorage.setItem(KEY,String(Date.now())); } catch { /* Normal login still works. */ }
}
export function wantsPhotoEntry() {
  try {
    const time = Number(sessionStorage.getItem(KEY));
    return time > 0 && Date.now() >= time && Date.now() - time < MAX_AGE;
  } catch { return false; }
}
export function clearPhotoEntry() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}
export function getPhotoOffice(profile) {
  for (const value of [profile?.office,profile?.office_code,profile?.assigned_office]) {
    if (typeof value === 'string' && /^CA\d{3}$/i.test(value.trim())) return value.trim().toUpperCase();
  }
  return '';
}

export function isPhotoRecoveryVisit() {
  try {
    const url=new URL(window.location.href);
    return url.pathname==='/reset-password' || url.searchParams.has('code') || url.searchParams.get('type')==='recovery' || new URLSearchParams(url.hash.slice(1)).get('type')==='recovery';
  }catch{return false;}
}
