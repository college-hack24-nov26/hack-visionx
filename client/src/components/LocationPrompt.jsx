import { useState } from 'react';
import { useSavedLocation } from '../context/LocationContext';

// First-visit location prompt + the editor opened from the Nav chip.
// The saved location lives only in this browser (localStorage) and is
// never sent to our server.
export default function LocationPrompt() {
  const { saved, dismissed, promptOpen, setPromptOpen, dismiss, clearLocation, useDeviceLocation, setTextLocation } = useSavedLocation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  function saveText() {
    const loc = setTextLocation(text);
    if (!loc) setErr('Type your area name first.');
  }

  return (
    <div className="loc-prompt">
      <p className="loc-prompt-title">📍 <strong>See food near you</strong></p>
      <p className="hint">Set your area to see distances on listings and a pickup map when you claim. Your location stays on this device — it is never sent to our server.</p>
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
        <button type="button" className="btn btn-ghost" onClick={saveText}>Save area</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Not now</button>
      </div>
      {err && <p className="field-error">{err}</p>}
    </div>
  );
}
