import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { portionsText, timeLeft } from "../lib/format";
import LiveShareControl from "../components/LiveShareControl";
import ReviewForm from "../components/ReviewForm";

const STATUS_LABELS = {
  DRAFT: "Draft",
  LIVE: "Live",
  PARTIALLY_CLAIMED: "Partly claimed",
  FULLY_CLAIMED: "Fully claimed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const CLAIM_STATUS_LABELS = {
  CONFIRMED: "Confirmed",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
  CANCELLED_LATE: "Cancelled (late)",
  CANCELLED_BY_PROVIDER: "Cancelled by donor",
  EXPIRED: "Expired",
};

function countText(listing, n) {
  const s = portionsText({ portionsRemaining: n, portionCount: n, bulkUnit: listing.bulkUnit, portionType: listing.portionType });
  return s.replace(` of ${n}`, "").replace(" left", "");
}

function claimerLabel(claimer) {
  if (!claimer) return "Claimer";
  if (claimer.orgName) return `${claimer.orgName} (NGO)`;
  return claimer.name || "Claimer";
}

export default function MyListings() {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState([]);
  const [received, setReceived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState({});
  const [verifyMsg, setVerifyMsg] = useState({});
  const [busyId, setBusyId] = useState("");
  const [reviewedIds, setReviewedIds] = useState([]);

  const load = useCallback(() => {
    api("/api/listings/mine").then(({ status, data }) => {
      if (status === 200) setListings(data.listings || []);
      else setError(data.error || "Could not load your listings");
      setLoading(false);
    });
  }, []);

  const loadReceived = useCallback(() => {
    api("/api/claims/received").then(({ status, data }) => {
      if (status === 200) setReceived(data.claims || []);
    });
  }, []);

  useEffect(() => {
    if (user && user.activeRole === "PROVIDER") { load(); loadReceived(); }
    else setLoading(false);
  }, [user, load, loadReceived]);

  useEffect(() => {
    if (user && user.activeRole === "PROVIDER") {
      api("/api/reviews/mine").then(({ status, data }) => {
        if (status === 200) setReviewedIds((data.reviews || []).map((r) => r.claimId));
      });
    }
  }, [user]);

  const claimsByListing = useMemo(() => {
    const map = {};
    for (const c of received) {
      const lid = c.listingId || c.listing?.id;
      if (!lid) continue;
      if (!map[lid]) map[lid] = [];
      map[lid].push(c);
    }
    return map;
  }, [received]);

  async function cancel(id) {
    if (!window.confirm("Cancel this listing? Claimers will no longer see it.")) return;
    const { status, data } = await api(`/api/listings/${id}/cancel`, { method: "POST" });
    if (status === 200) { load(); loadReceived(); }
    else setError(data.error || "Could not cancel this listing");
  }

  async function verify(claim) {
    const code = (codes[claim.id] || "").trim().toUpperCase();
    if (!code) {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: false, text: "Type the claimer's pickup code first." } }));
      return;
    }
    setBusyId(claim.id);
    const { status, data } = await api(`/api/claims/${claim.id}/verify`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    setBusyId("");
    if (status === 200 && data.alreadyCollected) {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: true, text: "Already collected earlier." } }));
      loadReceived();
    } else if (status === 200) {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: true, text: "Collected - pickup complete." } }));
      loadReceived();
    } else if (status === 401) {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: false, text: "Incorrect pickup code - check the code and try again." } }));
    } else if (status === 423) {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: false, text: "Verification is locked after too many wrong tries. Wait 10 minutes." } }));
    } else {
      setVerifyMsg((m) => ({ ...m, [claim.id]: { ok: false, text: data.error || "Could not verify this code" } }));
    }
  }

  if (authLoading) return <p>Loading...</p>;
  if (!user) return <p>Please <Link to="/login">log in</Link> to see your listings.</p>;
  if (user.activeRole !== "PROVIDER")
    return <div className="notice">You are in Claimer mode. Switch to <strong>Donor</strong> in the top bar to manage your listings.</div>;

  return (
    <section>
      <div className="card-top">
        <h1>My listings</h1>
        <Link className="btn btn-primary" to="/listings/new">+ New listing</Link>
      </div>
      {loading && <p>Loading...</p>}
      {!loading && error && <div className="form-error">{error}</div>}
      {!loading && !error && listings.length === 0 && <p>You have not listed any food yet.</p>}
      <div className="mine-list">
        {listings.map((l) => (
          <div key={l.id} className="mine-wrap">
            <div className="mine-row">
              {l.photoUrl ? (
                <img className="mine-thumb" src={API_BASE + l.photoUrl} alt="" />
              ) : (
                <div className="mine-thumb card-photo-empty">FOOD</div>
              )}
              <div className="mine-main">
                <div className="card-top">
                  <h3>{l.foodName}</h3>
                  <span className={`status-chip st-${l.status}`}>{STATUS_LABELS[l.status] || l.status}</span>
                </div>
                <p className="card-meta">{portionsText(l)} - {timeLeft(l.deadline).label}</p>
                <p className="card-meta">{l.pickupLocation}</p>
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
            {(claimsByListing[l.id] || []).length > 0 && (
              <div className="received-box">
                <strong>Claims received</strong>
                {claimsByListing[l.id].map((claim) => (
                  <div key={claim.id} className="received-row">
                    <span>{claimerLabel(claim.claimer)} - {countText(l, claim.portions)}</span>
                    <span className="chip">{CLAIM_STATUS_LABELS[claim.status] || claim.status}</span>
                    {claim.status === "CONFIRMED" && claim.onWayAt && <span>On the way</span>}
                    {claim.status === "COLLECTED" && claim.collectedAt && (
                      <span>Collected {new Date(claim.collectedAt).toLocaleTimeString()}</span>
                    )}
                    {claim.status === "CONFIRMED" && (
                      <span className="verify-box">
                        <input
                          className="verify-input"
                          type="text"
                          placeholder="Pickup code"
                          maxLength={8}
                          value={codes[claim.id] || ""}
                          onChange={(e) => setCodes((m) => ({ ...m, [claim.id]: e.target.value.toUpperCase() }))}
                        />
                        <button type="button" className="btn btn-primary btn-small" disabled={busyId === claim.id} onClick={() => verify(claim)}>
                          Verify pickup
                        </button>
                      </span>
                    )}
                    {verifyMsg[claim.id] && (
                      <span className={verifyMsg[claim.id].ok ? "verify-ok" : "verify-err"}>{verifyMsg[claim.id].text}</span>
                    )}
                    {claim.status === "CONFIRMED" && (
                      <div style={{ flexBasis: "100%" }}>
                        <LiveShareControl claim={claim} />
                      </div>
                    )}
                    {claim.status === "COLLECTED" && !reviewedIds.includes(claim.id) && (
                      <div style={{ flexBasis: "100%" }}>
                        <ReviewForm claimId={claim.id} label="Rate this claimer" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
