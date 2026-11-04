import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSavedLocation } from "../context/LocationContext";
import { haversineKm, formatKm } from "../lib/location";
import { portionsText } from "../lib/format";

// "3 meals" style text for any count, reusing portionsText's own unit words
function countText(listing, n) {
  const s = portionsText({ portionsRemaining: n, portionCount: n, bulkUnit: listing.bulkUnit, portionType: listing.portionType });
  return s.replace(` of ${n}`, "").replace(" left", "");
}

export default function ClaimPanel({ listing, onChanged }) {
  const { user } = useAuth();
  const [mine, setMine] = useState(null);
  const [portions, setPortions] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [qr, setQr] = useState("");
  const { saved, hasCoords } = useSavedLocation();

  // Admins cannot claim - the claim form never applies to them.
  const claimerRole = !!user && user.accountType !== "ADMIN" && (user.accountType !== "USER" || user.activeRole === "CLAIMER");
  const open = (listing.status === "LIVE" || listing.status === "PARTIALLY_CLAIMED") && listing.portionsRemaining > 0;
  const distanceKm = hasCoords && listing.latitude != null && listing.longitude != null
    ? haversineKm(saved, { lat: listing.latitude, lng: listing.longitude })
    : null;
  const tooFar = distanceKm != null && distanceKm > 5;
  const needsLoc = listing.latitude != null && listing.longitude != null && !hasCoords;

  // Do I already hold a confirmed claim on this listing?
  useEffect(() => {
    if (!claimerRole) { setMine(null); return; }
    let on = true;
    api("/api/claims/mine").then(({ status, data }) => {
      if (!on || status !== 200) return;
      const found = (data.claims || []).find(
        (c) => c.status === "CONFIRMED" && (c.listingId === listing.id || c.listing?.id === listing.id)
      );
      setMine(found || null);
    });
    return () => { on = false; };
  }, [user, listing.id, claimerRole]);

  // Build the QR image as soon as a claim succeeds
  useEffect(() => {
    if (done?.pickupCode) {
      QRCode.toDataURL(done.pickupCode, { width: 220 }).then(setQr).catch(() => setQr(""));
    }
  }, [done]);

  async function doClaim() {
    setBusy(true);
    setError("");
    const { status, data } = await api("/api/claims", {
      method: "POST",
      body: JSON.stringify({
        listingId: listing.id, portions,
        ...(hasCoords ? { claimerLat: saved.lat, claimerLng: saved.lng } : {}),
      }),
    });
    setBusy(false);
    if (status === 201) {
      setDone({ claim: data.claim, pickupCode: data.pickupCode });
      if (onChanged) onChanged();
    } else {
      setError(data.errors?.portions || data.errors?.location || data.error || "Could not claim this listing");
    }
  }

  async function cancelMine() {
    const mins = Math.round((new Date(listing.deadline) - Date.now()) / 60000);
    const msg = mins < 30
      ? "Less than 30 minutes are left before the pickup deadline. If you cancel now, these portions will NOT go back for others to claim. Cancel anyway?"
      : "Cancel this claim? The portions will go back for others to claim.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError("");
    const { status, data } = await api(`/api/claims/${mine.id}/cancel`, { method: "POST" });
    setBusy(false);
    if (status === 200) {
      setMine(null);
      if (onChanged) onChanged();
    } else {
      setError(data.error || "Could not cancel this claim");
    }
  }

  if (!user) {
    return (
      <div className="notice">
        Want this food? <Link to="/login">Sign in</Link> to claim it with a pickup code.
      </div>
    );
  }

  if (user.accountType === "USER" && user.activeRole === "PROVIDER") {
    return <div className="notice">You are in Donor mode. Switch to Claimer in the top bar to claim food.</div>;
  }

  if (done) {
    return (
      <div className="claim-done">
        <h2>✅ Claim confirmed</h2>
        <p className="card-meta">You claimed {countText(listing, done.claim.portions)} · Pickup before {new Date(listing.deadline).toLocaleString()}</p>
        <p className="card-meta">Show this code to the donor at pickup:</p>
        <div className="pickup-code">{done.pickupCode}</div>
        {qr && <img className="pickup-qr" src={qr} alt="Pickup code QR" />}
        <p className="card-meta">You can see this code again any time in <Link to="/my-claims">My Claims</Link>.</p>
      </div>
    );
  }

  if (mine) {
    return (
      <div className="claim-mine">
        <h2>Your claim: {countText(listing, mine.portions)}</h2>
        <p className="card-meta">Pickup before {new Date(listing.deadline).toLocaleString()} · Manage it in <Link to="/my-claims">My Claims</Link>.</p>
        {error && <div className="form-error">{error}</div>}
        <button type="button" className="btn btn-danger" disabled={busy} onClick={cancelMine}>Cancel this claim</button>
      </div>
    );
  }

  if (!open) {
    return <div className="notice">This listing is no longer open for claims.</div>;
  }

  return (
    <div className="claim-panel">
      <h2>Claim this food</h2>
      <p className="card-meta">{portionsText(listing)} · how many do you need?</p>
      {distanceKm != null && <p className="card-meta">📍 {formatKm(distanceKm)} from your saved location</p>}
      {tooFar && <div className="form-error">This pickup point is {formatKm(distanceKm)} away — claims are limited to within 5 km.</div>}
      {needsLoc && <div className="notice">Set your location from the top bar to claim — pickups are limited to within 5 km of the pickup point.</div>}
      <div className="stepper">
        <button type="button" className="btn btn-ghost" onClick={() => setPortions((p) => Math.max(1, p - 1))} disabled={portions <= 1}>−</button>
        <span className="stepper-value">{portions}</span>
        <button type="button" className="btn btn-ghost" onClick={() => setPortions((p) => Math.min(listing.portionsRemaining, p + 1))} disabled={portions >= listing.portionsRemaining}>+</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || tooFar || needsLoc} onClick={doClaim}>
        {busy ? "Claiming…" : `Claim ${countText(listing, portions)}`}
      </button>
    </div>
  );
}


