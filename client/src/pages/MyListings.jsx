import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { portionsText, timeLeft } from "../lib/format";

const STATUS_LABELS = {
  DRAFT: "Draft",
  LIVE: "Live",
  PARTIALLY_CLAIMED: "Partly claimed",
  FULLY_CLAIMED: "Fully claimed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export default function MyListings() {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/listings/mine").then(({ status, data }) => {
      if (status === 200) setListings(data.listings || []);
      else setError(data.error || "Could not load your listings");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (user && user.activeRole === "PROVIDER") load();
    else setLoading(false);
  }, [user, load]);

  async function cancel(id) {
    if (!window.confirm("Cancel this listing? Claimers will no longer see it.")) return;
    const { status, data } = await api(`/api/listings/${id}/cancel`, { method: "POST" });
    if (status === 200) load();
    else setError(data.error || "Could not cancel this listing");
  }

  if (authLoading) return <p>Loading…</p>;
  if (!user) return <p>Please <Link to="/login">log in</Link> to see your listings.</p>;
  if (user.activeRole !== "PROVIDER")
    return <div className="notice">You are in Claimer mode. Switch to <strong>Donor</strong> in the top bar to manage your listings.</div>;

  return (
    <section>
      <div className="card-top">
        <h1>My listings</h1>
        <Link className="btn btn-primary" to="/listings/new">+ New listing</Link>
      </div>
      {loading && <p>Loading…</p>}
      {!loading && error && <div className="form-error">{error}</div>}
      {!loading && !error && listings.length === 0 && <p>You have not listed any food yet.</p>}
      <div className="mine-list">
        {listings.map((l) => (
          <div key={l.id} className="mine-row">
            {l.photoUrl ? (
              <img className="mine-thumb" src={API_BASE + l.photoUrl} alt="" />
            ) : (
              <div className="mine-thumb card-photo-empty">🍲</div>
            )}
            <div className="mine-main">
              <div className="card-top">
                <h3>{l.foodName}</h3>
                <span className={`status-chip st-${l.status}`}>{STATUS_LABELS[l.status] || l.status}</span>
              </div>
              <p className="card-meta">{portionsText(l)} · ⏰ {timeLeft(l.deadline).label}</p>
              <p className="card-meta">📍 {l.pickupLocation}</p>
            </div>
            <div className="mine-actions">
              {(l.status === "DRAFT" || l.status === "LIVE" || l.status === "PARTIALLY_CLAIMED") && (
                <Link className="btn btn-ghost" to={`/listings/${l.id}/edit`}>Edit</Link>
              )}
              {(l.status === "DRAFT" || l.status === "LIVE" || l.status === "PARTIALLY_CLAIMED") && (
                <button className="btn btn-ghost" type="button" onClick={() => cancel(l.id)}>Cancel</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
