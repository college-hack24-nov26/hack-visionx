import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { haversineKm } from "../lib/location";

// Donor-side live location sharing for one CONFIRMED claim (C5).
// Watches the donor's position and posts it to the backend, throttled
// to a 25 m move or a 20 second heartbeat, until stopped.
export default function LiveShareControl({ claim }) {
  const [sharing, setSharing] = useState(!!claim.liveSharing);
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState(null);
  const watchId = useRef(null);
  const lastRef = useRef(null); // { point: {lat, lng}, at: ms }

  async function send(point) {
    lastRef.current = { point, at: Date.now() };
    const { status } = await api(`/api/claims/${claim.id}/live-location`, {
      method: "POST",
      body: { lat: point.lat, lng: point.lng },
    });
    if (status === 200) setLastSent(new Date());
  }

  function start() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const last = lastRef.current;
        if (!last || haversineKm(last.point, point) >= 0.025 || Date.now() - last.at >= 20000) {
          send(point);
        }
      },
      () => setError("Location permission was denied or is unavailable."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchId.current = id;
    setSharing(true);
  }

  async function stop() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
    await api(`/api/claims/${claim.id}/stop`, { method: "POST" });
  }

  // If this claim was already sharing when the page loaded, resume watching.
  useEffect(() => {
    if (claim.liveSharing) start();
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="verify-box">
      {sharing ? (
        <>
          <span className="verify-ok">
            🟢 Sharing your live location{lastSent ? ` · updated ${lastSent.toLocaleTimeString()}` : ""}
          </span>
          <button type="button" className="btn btn-danger btn-small" onClick={stop}>
            Stop sharing
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-small" onClick={start}>
            Share live location
          </button>
          <span className="hint">Lets the claimer follow you on their pickup map.</span>
        </>
      )}
      {error && <span className="verify-err">{error}</span>}
    </div>
  );
}
