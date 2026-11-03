import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSavedLocation } from "../context/LocationContext";
import { haversineKm } from "../lib/location";
import ListingCard from "../components/ListingCard";
import { CATEGORIES } from "../lib/format";

const VEG_SET = new Set(["VEG", "VEGAN"]);

export default function Browse() {
  const { user } = useAuth();
  const { saved, hasCoords: savedHasCoords } = useSavedLocation();
  const [listings, setListings] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [diet, setDiet] = useState("ALL");
  const [sort, setSort] = useState("TIME_ASC");
  const [radius, setRadius] = useState("ANY");
  const [now, setNow] = useState(Date.now());

  const claimerRole = !!user && (user.accountType !== "USER" || user.activeRole === "CLAIMER");

  useEffect(() => {
    let on = true;
    api("/api/browse").then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setListings(data.listings || []);
      else setError(data.error || "Could not load listings");
      setLoading(false);
    });
    return () => { on = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!claimerRole) { setMyClaims([]); return; }
    let on = true;
    api("/api/claims/mine").then(({ status, data }) => {
      if (!on || status !== 200) return;
      setMyClaims(data.claims || []);
    });
    return () => { on = false; };
  }, [user, claimerRole, reloadKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const claimByListing = useMemo(() => {
    const map = {};
    for (const c of myClaims) {
      if (c.status !== "CONFIRMED") continue;
      const lid = c.listingId || c.listing?.id;
      if (lid) map[lid] = c;
    }
    return map;
  }, [myClaims]);

  async function cancelClaim(claim, listing) {
    const mins = Math.round((new Date(listing.deadline) - Date.now()) / 60000);
    const msg = mins < 30
      ? "Less than 30 minutes are left before the pickup deadline. If you cancel now, these portions will NOT go back for others to claim. Cancel anyway?"
      : "Cancel this claim? The portions will go back for others to claim.";
    if (!window.confirm(msg)) return;
    const { status, data } = await api(`/api/claims/${claim.id}/cancel`, { method: "POST" });
    if (status === 200) setReloadKey((k) => k + 1);
    else alert(data.error || "Could not cancel this claim");
  }

  // Distance from the saved location, computed on this device only.
  const withDist = useMemo(() => listings.map((l) => ({
    ...l,
    distanceKm: savedHasCoords && l.latitude != null && l.longitude != null
      ? haversineKm(saved.lat, saved.lng, l.latitude, l.longitude)
      : null,
  })), [listings, saved, savedHasCoords]);

  const { shown, hiddenByRadius } = useMemo(() => {
    let hidden = 0;
    const radiusKm = savedHasCoords && radius !== "ANY" ? Number(radius) : null;
    const out = withDist.filter((l) => {
      const hay = `${l.foodName} ${l.details || ""}`.toLowerCase();
      if (q && !hay.includes(q.trim().toLowerCase())) return false;
      if (cat !== "ALL" && l.category !== cat) return false;
      if (diet !== "ALL" && l.dietaryType !== diet) return false;
      if (radiusKm != null && (l.distanceKm == null || l.distanceKm > radiusKm)) { hidden += 1; return false; }
      return true;
    });
    const byTime = (a, b) => new Date(a.deadline) - new Date(b.deadline);
    if (sort === "TIME_ASC") out.sort(byTime);
    else if (sort === "TIME_DESC") out.sort((a, b) => -byTime(a, b));
    else if (sort === "VEG_FIRST")
      out.sort((a, b) => (VEG_SET.has(b.dietaryType) ? 1 : 0) - (VEG_SET.has(a.dietaryType) ? 1 : 0) || byTime(a, b));
    else if (sort === "NONVEG_FIRST")
      out.sort((a, b) => (a.dietaryType === "NON_VEG" ? 0 : 1) - (b.dietaryType === "NON_VEG" ? 0 : 1) || byTime(a, b));
    else if (sort === "DIST_ASC")
      out.sort((a, b) => (a.distanceKm == null ? Infinity : a.distanceKm) - (b.distanceKm == null ? Infinity : b.distanceKm) || byTime(a, b));
    else if (sort === "DIST_DESC")
      out.sort((a, b) => (b.distanceKm == null ? -Infinity : b.distanceKm) - (a.distanceKm == null ? -Infinity : a.distanceKm) || byTime(a, b));
    return { shown: out, hiddenByRadius: hidden };
  }, [withDist, q, cat, diet, sort, radius, savedHasCoords]);

  return (
    <section className="browse-page">
      <h1>Browse surplus food</h1>
      <div className="controls">
        <input className="control-input" type="search" placeholder="Search food…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="control-input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {Object.entries(CATEGORIES).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select className="control-input" value={diet} onChange={(e) => setDiet(e.target.value)}>
          <option value="ALL">Veg & non-veg</option>
          <option value="VEG">Veg</option>
          <option value="VEGAN">Vegan</option>
          <option value="NON_VEG">Non-veg</option>
        </select>
        <select className="control-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="TIME_ASC">Time left: low to high</option>
          <option value="TIME_DESC">Time left: high to low</option>
          <option value="VEG_FIRST">Vegetarian first</option>
          <option value="NONVEG_FIRST">Non-vegetarian first</option>
          {savedHasCoords && <option value="DIST_ASC">Distance: nearest first</option>}
          {savedHasCoords && <option value="DIST_DESC">Distance: farthest first</option>}
        </select>
        {savedHasCoords && (
          <select className="control-input" value={radius} onChange={(e) => setRadius(e.target.value)}>
            <option value="ANY">Any distance</option>
            <option value="2">Within 2 km</option>
            <option value="5">Within 5 km</option>
            <option value="10">Within 10 km</option>
          </select>
        )}
      </div>

      {saved && !savedHasCoords && (
        <p className="hint">Your saved location is an area name without coordinates, so distances are off. Open the 📍 menu in the top bar and use "Use my location" to switch them on.</p>
      )}
      {savedHasCoords && radius !== "ANY" && hiddenByRadius > 0 && (
        <p className="hint">{hiddenByRadius} listing{hiddenByRadius === 1 ? "" : "s"} hidden by the distance filter — listings without a pickup point can't be distance-checked.</p>
      )}

      {loading && <p>Loading listings…</p>}
      {!loading && error && <div className="form-error">{error}</div>}
      {!loading && !error && listings.length === 0 && <p>No food listed yet — check back soon.</p>}
      {!loading && !error && listings.length > 0 && shown.length === 0 && <p>No listings match your search or filters.</p>}
      <div className="cards-grid">
        {shown.map((l) => (
          <ListingCard key={l.id} listing={l} now={now} myClaim={claimByListing[l.id]} onCancelClaim={cancelClaim} distanceKm={l.distanceKm} />
        ))}
      </div>
    </section>
  );
}
