import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseLabel } from '../lib/location';

const DEFAULT_POINT = { lat: 17.9583, lng: 74.4275 }; // Phaltan

// Map pin picker: tap the map or drag the pin to an exact spot.
// Returns real coordinates, so a manually pinned location behaves
// exactly like a GPS fix for distances and the 5 km claim radius.
export default function LocationPicker({ initial, onPick, onClose }) {
  const mapEl = useRef(null);
  const [point, setPoint] = useState(
    initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)
      ? { lat: initial.lat, lng: initial.lng }
      : DEFAULT_POINT,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const map = L.map(mapEl.current).setView([point.lat, point.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const icon = L.divIcon({
      html: '<div style="font-size:34px;line-height:1">📍</div>',
      className: 'pin-icon',
      iconSize: [34, 34],
      iconAnchor: [17, 32],
    });
    const marker = L.marker([point.lat, point.lng], { draggable: true, icon }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setPoint({ lat: p.lat, lng: p.lng });
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => { clearTimeout(t); map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    setBusy(true);
    const label = await reverseLabel(point.lat, point.lng);
    onPick({ label, lat: point.lat, lng: point.lng });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Pin your location</h2>
        <p className="hint">Tap the map or drag the pin to your exact spot.</p>
        <div ref={mapEl} className="locpick-map" />
        <p className="card-meta">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            {busy ? 'Saving…' : 'Use this spot'}
          </button>
        </div>
      </div>
    </div>
  );
}
