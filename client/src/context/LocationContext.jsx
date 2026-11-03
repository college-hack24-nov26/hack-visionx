import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  loadSavedLocation, saveSavedLocation, clearSavedLocation,
  promptDismissed, dismissPrompt, devicePosition, reverseLabel, hasCoords,
} from '../lib/location';

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const [saved, setSaved] = useState(() => loadSavedLocation());
  const [dismissed, setDismissed] = useState(() => promptDismissed());
  const [promptOpen, setPromptOpen] = useState(false);

  const setLocation = useCallback((loc) => {
    saveSavedLocation(loc);
    setSaved(loc);
  }, []);

  const clearLocation = useCallback(() => {
    clearSavedLocation();
    setSaved(null);
  }, []);

  const dismiss = useCallback(() => {
    dismissPrompt();
    setDismissed(true);
    setPromptOpen(false);
  }, []);

  const useDeviceLocation = useCallback(async () => {
    const pos = await devicePosition();
    const label = await reverseLabel(pos.lat, pos.lng);
    const loc = { label, lat: pos.lat, lng: pos.lng };
    setLocation(loc);
    setPromptOpen(false);
    return loc;
  }, [setLocation]);

  const setTextLocation = useCallback((label) => {
    const loc = { label: String(label || '').trim() };
    if (!loc.label) return null;
    setLocation(loc);
    setPromptOpen(false);
    return loc;
  }, [setLocation]);

  const value = useMemo(() => ({
    saved, hasCoords: hasCoords(saved),
    promptOpen, setPromptOpen, dismissed, dismiss,
    setLocation, clearLocation, useDeviceLocation, setTextLocation,
  }), [saved, promptOpen, dismissed, dismiss, setLocation, clearLocation, useDeviceLocation, setTextLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useSavedLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useSavedLocation must be used inside LocationProvider');
  return ctx;
}
