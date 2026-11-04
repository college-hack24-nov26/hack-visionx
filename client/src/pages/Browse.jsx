import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSavedLocation } from "../context/LocationContext";
import { useLanguage } from "../i18n/LanguageContext";
import { haversineKm } from "../lib/location";
import ListingCard from "../components/ListingCard";
import { CATEGORIES } from "../lib/format";

const VEG_SET = new Set(["VEG", "VEGAN"]);

export default function Browse() {
  const { user } = useAuth();
  const { saved, hasCoords: savedHasCoords, setPromptOpen } = useSavedLocation();
  const { t } = useLanguage();
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

  // Admins moderate - they are never treated as claimers, so no radius
  // filter and no claim UI applies to them; they see every listing.
  const claimerRole = !!user && user.accountType !== "ADMIN" && (user.accountType !== "USER" || user.activeRole === "CLAIMER");

  useEffect(() => {
    let on = true;
    api("/api/browse").then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setListings(data.listings || []);
      else setError(data.error || t("browseLoadFailed"));
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
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
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
      ? t("browseCancelLate")
      : t("browseCancelConfirm");
    if (!window.confirm(msg)) return;
    const { status, data } = await api(`/api/claims/${claim.id}/cancel`, { method: "POST" });
    if (status === 200) setReloadKey((k) => k + 1);
    else alert(data.error || t("browseCancelFailed"));
  }

  // FR-B4: signed-in claimers and NGOs with saved coordinates always get
  // the hard 5 km radius - no "show everything" bypass.
  const hardRadius = claimerRole && savedHasCoords;
  // A claimer or NGO with NO coordinates sees nothing at all: without a
  // location the 5 km rule cannot be applied, so Browse stays empty
  // until they set one (a typed area must geocode - a bare label is
  // not enough, and old label-only saves land here too).
  const mustLocate = claimerRole && !savedHasCoords;

  // Distance from the saved location, computed on this device only.
  const withDist = useMemo(() => listings.map((l) => ({
    ...l,
    distanceKm: savedHasCoords && l.latitude != null && l.longitude != null
      ? haversineKm(saved, { lat: l.latitude, lng: l.longitude })
      : null,
  })), [listings, saved, savedHasCoords]);

  const { shown, hiddenByRadius } = useMemo(() => {
    let hidden = 0;
    if (mustLocate) return { shown: [], hiddenByRadius: 0 };
    const radiusKm = hardRadius ? 5 : (savedHasCoords && radius !== "ANY" ? Number(radius) : null);
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
  }, [withDist, q, cat, diet, sort, radius, savedHasCoords, hardRadius, mustLocate]);

  return (
    <section className="browse-page">
      <h1>{t("browseTitle")}</h1>
      <div className="controls">
        <input className="control-input" type="search" placeholder={t("browseSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="control-input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">{t("browseAllCategories")}</option>
          {Object.entries(CATEGORIES).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select className="control-input" value={diet} onChange={(e) => setDiet(e.target.value)}>
          <option value="ALL">{t("browseVegNonVeg")}</option>
          <option value="VEG">{t("browseVeg")}</option>
          <option value="VEGAN">{t("browseVegan")}</option>
          <option value="NON_VEG">{t("browseNonVeg")}</option>
        </select>
        <select className="control-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="TIME_ASC">{t("browseSortTimeAsc")}</option>
          <option value="TIME_DESC">{t("browseSortTimeDesc")}</option>
          <option value="VEG_FIRST">{t("browseSortVegFirst")}</option>
          <option value="NONVEG_FIRST">{t("browseSortNonvegFirst")}</option>
          {savedHasCoords && <option value="DIST_ASC">{t("browseSortDistAsc")}</option>}
          {savedHasCoords && <option value="DIST_DESC">{t("browseSortDistDesc")}</option>}
        </select>
        {savedHasCoords && !hardRadius && (
          <select className="control-input" value={radius} onChange={(e) => setRadius(e.target.value)}>
            <option value="ANY">{t("browseAnyDistance")}</option>
            <option value="2">{t("browseWithin2Km")}</option>
            <option value="5">{t("browseWithin5Km")}</option>
            <option value="10">{t("browseWithin10Km")}</option>
          </select>
        )}
      </div>

      {mustLocate && (
        <div className="notice">
          <p><strong>Set your location to see food near you.</strong></p>
          <p>Claims are limited to within 5 km of the pickup point, so Browse only shows listings once your location is set — with real coordinates, not just a name.</p>
          <button type="button" className="btn btn-primary" onClick={() => setPromptOpen(true)}>Set my location</button>
        </div>
      )}
      {saved && !savedHasCoords && !claimerRole && (
        <p className="hint">{t("browseAreaHint")}</p>
      )}
      {hardRadius && (
        <p className="hint">{t("browseHardRadius")}{hiddenByRadius > 0 && <> - {hiddenByRadius} {t(hiddenByRadius === 1 ? "browseHiddenOne" : "browseHiddenMany")}</>}</p>
      )}
      {!hardRadius && savedHasCoords && radius !== "ANY" && hiddenByRadius > 0 && (
        <p className="hint">{hiddenByRadius} {t(hiddenByRadius === 1 ? "browseHiddenOne" : "browseHiddenMany")}</p>
      )}

      {loading && <p>{t("browseLoading")}</p>}
      {!loading && error && <div className="form-error">{error}</div>}
      {!loading && !error && listings.length === 0 && <p>{t("browseEmpty")}</p>}
      {!loading && !error && listings.length > 0 && shown.length === 0 && !mustLocate && <p>{t("browseNoMatch")}</p>}
      <div className="cards-grid">
        {shown.map((l) => (
          <ListingCard key={l.id} listing={l} now={now} myClaim={claimByListing[l.id]} onCancelClaim={cancelClaim} distanceKm={l.distanceKm} />
        ))}
      </div>
    </section>
  );
}


