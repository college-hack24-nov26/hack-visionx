// Saved location + distance helpers (FR-LOC1). The saved location
// lives ONLY in this browser (localStorage) - it is never sent to
// our server. Coordinates are used on-device for distance, radius
// and routing features.
const KEY = 'fws_saved_location';
const DISMISS_KEY = 'fws_loc_prompt_dismissed';

export function loadSavedLocation() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSavedLocation(loc) {
  try { localStorage.setItem(KEY, JSON.stringify(loc)); } catch { /* private mode */ }
}

export function clearSavedLocation() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function promptDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function dismissPrompt() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}

export function hasCoords(loc) {
  return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
}

// Great-circle distance in kilometres between two {lat, lng} points.
export function haversineKm(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatKm(km) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// Free, key-less reverse geocoding: coordinates -> a place label.
export async function reverseLabel(lat, lng) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (!r.ok) throw new Error('geocode failed');
    const d = await r.json();
    return d.city || d.locality || d.principalSubdivision || 'Current location';
  } catch {
    return 'Current location';
  }
}

// One device-location fix as a promise.
export function devicePosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
