import { useState } from 'react';
import { useSavedLocation } from '../context/LocationContext';
import LocationPicker from './LocationPicker';

// First-visit location prompt + the editor opened from the Nav chip.
// The saved location lives only in this browser (localStorage) and is
// never sent to our server.
export default function LocationPrompt() {
  const { saved, dismissed, promptOpen, setPromptOpen, dismiss, clearLocation, useDeviceLocation, setTextLocation, setLocation } = useSavedLocation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const open = promptOpen || (!saved && !dismissed);
  if (!open) return null;

  function close() {
    // With a saved location this is just an editor - close it.
    // Without one, "Not now" is remembered so we don't nag.
    if (saved) setPromptOpen(false);
    else dismiss();
  }

  async function useDevice() {
    setBusy(true); setErr('');
    try {
      await useDeviceLocation();
    } catch {
      setErr('Could not get your location - check the browser permission, or type your area instead.');
    }
    setBusy(false);
  }

  async function saveText() {
    if (!text.trim()) { setErr('Type your area name first.'); return; }
    setBusy(true); setErr('');
    const loc = await setTextLocation(text);
    setBusy(false);
    if (!loc) setErr('We could not find that place. Check the spelling, or pin it on the map instead.');
  }

  return (
    <div className="loc-prompt">
      <p className="loc-prompt-title">📍 <strong>See food near you</strong></p>
      <p className="hint">Set your area to see distances on listings and a pickup map when you claim. Typed areas are looked up on the map, so they carry real coordinates. When you claim, your location is sent once to check the 5 km rule — it is never stored.</p>
      {saved && (
        <p className="recog-line">
          Current: <strong>{saved.label || 'Coordinates set'}</strong>{' '}
          <button type="button" className="chip" onClick={() => { clearLocation(); setPromptOpen(true); }}>Remove</button>
        </p>
      )}
      <div className="recog-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={useDevice}>
          {busy ? 'Locating…' : 'Use my location'}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type your area, e.g. Phaltan" />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={saveText}>{busy ? 'Finding…' : 'Save area'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setPickerOpen(true)}>🗺️ Pin on map</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Not now</button>
      </div>
      {err && <p className="field-error">{err}</p>}
      {pickerOpen && (
        <LocationPicker
          initial={saved}
          onPick={(loc) => { setLocation(loc); setPickerOpen(false); setPromptOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

