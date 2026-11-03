import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import { CATEGORIES, DIETARY, SAFETY_LABELS, portionsText, timeLeft } from "../lib/format";
import ClaimPanel from "../components/ClaimPanel";

export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let on = true;
    api(`/api/browse/${id}`).then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setListing(data.listing || data);
      else if (status === 404) setError("This listing is not available — it may have expired or been removed.");
      else setError(data.error || "Could not load this listing");
      setLoading(false);
    });
    return () => { on = false; };
  }, [id, reloadKey]);

  if (loading) return <p>Loading…</p>;
  if (error) return (
    <section>
      <div className="form-error">{error}</div>
      <p><Link to="/browse">← Back to browse</Link></p>
    </section>
  );
  if (!listing) return null;

  const t = timeLeft(listing.deadline);
  const full = listing.status === "FULLY_CLAIMED";
  return (
    <section className="detail-page">
      <p><Link to="/browse">← Back to browse</Link></p>
      {listing.photoUrl ? (
        <img className="detail-photo" src={API_BASE + listing.photoUrl} alt={listing.foodName} />
      ) : (
        <div className="detail-photo card-photo-empty">🍲</div>
      )}
      <div className="detail-card">
        <div className="card-top">
          <h1>{listing.foodName}</h1>
          <span className={`urg urg-${full ? "expired" : t.level}`}>
            {full ? "Fully claimed" : t.level === "high" ? "High urgency" : t.level === "medium" ? "Medium" : t.level === "expired" ? "Expired" : "Low"}
          </span>
        </div>
        {listing.details && <p>{listing.details}</p>}
        <p className="card-meta">{CATEGORIES[listing.category] || listing.category}{listing.categoryNote ? ` — ${listing.categoryNote}` : ""} · {DIETARY[listing.dietaryType] || listing.dietaryType}</p>
        <p className="card-meta">{portionsText(listing)}</p>
        <p className="card-meta">📍 Pickup: {listing.pickupLocation}</p>
        <p className="card-meta">⏰ Pickup before: {new Date(listing.deadline).toLocaleString()} ({t.label})</p>
        <p className="card-meta">By {listing.provider?.orgName || listing.provider?.name || "Provider"}</p>
        {listing.providerVerified && (
          <p className="card-meta"><span className="verified-chip">✓ Verified NGO</span></p>
        )}
        {listing.contactPhone && (
          <p className="card-meta">📞 Donor contact: {listing.contactPhone}</p>
        )}

        {Array.isArray(listing.safetyChecklist) && listing.safetyChecklist.length > 0 && (
          <>
            <h2>Donor safety declarations</h2>
            <ul className="safety-list">
              {listing.safetyChecklist.map((cid) => (
                <li key={cid}><span className="tick">✓</span> {SAFETY_LABELS[cid] || cid}</li>
              ))}
            </ul>
          </>
        )}

        <ClaimPanel listing={listing} onChanged={() => setReloadKey((k) => k + 1)} />
      </div>
    </section>
  );
}
