import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { portionsText } from "../lib/format";

const STATUS_LABELS = {
  CONFIRMED: "Confirmed",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
  CANCELLED_LATE: "Cancelled (late)",
  CANCELLED_BY_PROVIDER: "Cancelled by donor",
  EXPIRED: "Expired",
};

// "3 meals" style text for any count, reusing portionsText's own unit words
function countText(listing, n) {
  const s = portionsText({ portionsRemaining: n, portionCount: n, bulkUnit: listing.bulkUnit, portionType: listing.portionType });
  return s.replace(` of ${n}`, "").replace(" left", "");
}

export default function MyClaims() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [codes, setCodes] = useState({});
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState({});

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let on = true;
    api("/api/claims/mine").then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setClaims(data.claims || []);
      else setError(data.error || "Could not load your claims");
      setLoading(false);
    });
    return () => { on = false; };
  }, [user, reloadKey]);

  if (!user) {
    return (
      <section>
        <h1>My Claims</h1>
        <div className="notice">Please <Link to="/login">sign in</Link> to see your claims.</div>
      </section>
    );
  }
  if (loading) return <p>Loading…</p>;
  if (error) return <div className="form-error">{error}</div>;

  async function showCode(claim) {
    setBusyId(claim.id);
    setActionError((m) => ({ ...m, [claim.id]: "" }));
    const { status, data } = await api(`/api/claims/${claim.id}/code`);
    if (status === 200) {
      const qr = await QRCode.toDataURL(data.code, { width: 220 }).catch(() => "");
      setCodes((m) => ({ ...m, [claim.id]: { code: data.code, qr } }));
    } else {
      setActionError((m) => ({ ...m, [claim.id]: data.error || "Could not load the pickup code" }));
    }
    setBusyId("");
  }

  async function onTheWay(claim) {
    setBusyId(claim.id);
    setActionError((m) => ({ ...m, [claim.id]: "" }));
    const { status, data } = await api(`/api/claims/${claim.id}/on-the-way`, { method: "POST" });
    if (status === 200) setReloadKey((k) => k + 1);
    else setActionError((m) => ({ ...m, [claim.id]: data.error || "Could not send the on-the-way signal" }));
    setBusyId("");
  }

  async function cancel(claim) {
    const mins = Math.round((new Date(claim.listing.deadline) - Date.now()) / 60000);
    const msg = mins < 30
      ? "Less than 30 minutes are left before the pickup deadline. If you cancel now, these portions will NOT go back for others to claim. Cancel anyway?"
      : "Cancel this claim? The portions will go back for others to claim.";
    if (!window.confirm(msg)) return;
    setBusyId(claim.id);
    setActionError((m) => ({ ...m, [claim.id]: "" }));
    const { status, data } = await api(`/api/claims/${claim.id}/cancel`, { method: "POST" });
    if (status === 200) setReloadKey((k) => k + 1);
    else setActionError((m) => ({ ...m, [claim.id]: data.error || "Could not cancel this claim" }));
    setBusyId("");
  }

  return (
    <section>
      <h1>My Claims</h1>
      {claims.length === 0 && (
        <p>No claims yet. Find something tasty on the <Link to="/browse">browse page</Link>.</p>
      )}
      <div className="claims-list">
        {claims.map((claim) => {
          const l = claim.listing || {};
          const shown = codes[claim.id];
          return (
            <article key={claim.id} className="claim-card">
              {l.photoUrl ? (
                <img className="claim-photo" src={API_BASE + l.photoUrl} alt={l.foodName} />
              ) : (
                <div className="claim-photo card-photo-empty">🍲</div>
              )}
              <div className="claim-body">
                <div className="card-top">
                  <h3>{l.foodName}</h3>
                  <span className="chip">{STATUS_LABELS[claim.status] || claim.status}</span>
                </div>
                <p className="card-meta">Your claim: {countText(l, claim.portions)}</p>
                <p className="card-meta">📍 Pickup: {l.pickupLocation}</p>
                <p className="card-meta">⏰ Pickup before: {new Date(l.deadline).toLocaleString()}</p>
                <p className="card-meta">By {l.provider?.orgName || l.provider?.name || "Provider"}</p>
                {claim.status === "COLLECTED" && claim.collectedAt && (
                  <p className="card-meta">✅ Collected {new Date(claim.collectedAt).toLocaleString()}</p>
                )}
                {claim.status === "CONFIRMED" && claim.onWayAt && (
                  <p className="card-meta">🚶 On the way · {new Date(claim.onWayAt).toLocaleTimeString()}</p>
                )}
                {actionError[claim.id] && <div className="form-error">{actionError[claim.id]}</div>}
                {claim.status === "CONFIRMED" && (
                  <>
                    {shown ? (
                      <div className="claim-code-box">
                        <div className="pickup-code">{shown.code}</div>
                        {shown.qr && <img className="pickup-qr" src={shown.qr} alt="Pickup code QR" />}
                      </div>
                    ) : (
                      <div className="claim-actions">
                        <button type="button" className="btn btn-primary" disabled={busyId === claim.id} onClick={() => showCode(claim)}>
                          Show pickup code
                        </button>
                        {!claim.onWayAt && (
                          <button type="button" className="btn btn-ghost" disabled={busyId === claim.id} onClick={() => onTheWay(claim)}>
                            On the way
                          </button>
                        )}
                        <button type="button" className="btn btn-danger" disabled={busyId === claim.id} onClick={() => cancel(claim)}>
                          Cancel claim
                        </button>
                      </div>
                    )}
                    {shown && !claim.onWayAt && (
                      <div className="claim-actions">
                        <button type="button" className="btn btn-ghost" disabled={busyId === claim.id} onClick={() => onTheWay(claim)}>
                          On the way
                        </button>
                        <button type="button" className="btn btn-danger" disabled={busyId === claim.id} onClick={() => cancel(claim)}>
                          Cancel claim
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
