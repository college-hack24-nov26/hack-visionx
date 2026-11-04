import { useCallback, useEffect, useState } from "react";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { portionsText } from "../lib/format";

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [queue, setQueue] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAll = useCallback(() => {
    Promise.all([
      api("/api/admin/users"),
      api("/api/admin/listings"),
      api("/api/admin/ngo-queue"),
      api("/api/admin/audit"),
    ]).then(([u, l, q, a]) => {
      if (u.status === 200) setUsers(u.data.users || []);
      else setError(u.data.error || "Could not load users");
      if (l.status === 200) setListings(l.data.listings || []);
      if (q.status === 200) setQueue(q.data.queue || q.data.users || []);
      if (a.status === 200) setAudit(a.data.entries || a.data.audit || a.data.logs || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (!user) return <p>Loading…</p>;
  if (user.accountType !== "ADMIN") {
    return (
      <section>
        <h1>Admin</h1>
        <div className="card"><div className="card-body">
          <p>Admin access only. You are signed in as {user.email} ({user.accountType}).</p>
        </div></div>
      </section>
    );
  }

  async function userAction(u, action) {
    if (action === "suspend") {
      const ok = window.confirm(`Suspend ${u.email}? They will not be able to post or claim.`);
      if (!ok) return;
    }
    setError(""); setNotice("");
    const { status, data } = await api(`/api/admin/users/${u.id}/${action}`, { method: "POST" });
    if (status === 200) { setNotice(`Done — ${u.email} ${action === "suspend" ? "suspended" : "unsuspended"}.`); loadAll(); }
    else setError(data.error || "Action failed");
  }

  async function listingAction(l, action) {
    if (action === "remove") {
      const ok = window.confirm(`Remove the listing "${l.foodName}"? It will disappear from browse.`);
      if (!ok) return;
    }
    setError(""); setNotice("");
    const { status, data } = await api(`/api/admin/listings/${l.id}/${action}`, { method: "POST" });
    if (status === 200) { setNotice(`Done — "${l.foodName}" ${action === "remove" ? "removed" : "restored"}.`); loadAll(); }
    else setError(data.error || "Action failed");
  }

  async function ngoAction(u, action) {
    setError(""); setNotice("");
    let res;
    if (action === "verify-ngo") {
      res = await api(`/api/admin/users/${u.id}/verify-ngo`, { method: "POST" });
    } else if (action === "reject-ngo") {
      const note = window.prompt("Reason for rejection? The NGO will see this note.", "");
      if (note === null) return;
      res = await api(`/api/admin/users/${u.id}/reject-ngo`, { method: "POST", body: { note } });
    } else {
      res = await api(`/api/admin/users/${u.id}/unverify`, { method: "POST" });
    }
    if (res.status === 200) {
      setNotice(`Done — ${u.orgName || u.email} ${action === "verify-ngo" ? "verified" : action === "reject-ngo" ? "rejected" : "unverified"}.`);
      loadAll();
    } else setError(res.data.error || "Action failed");
  }

  return (
    <section>
      <h1>Admin</h1>
      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-ok">{notice}</div>}
      {loading ? <p>Loading…</p> : (
        <>
          <h2>Users ({users.length})</h2>
          <div className="admin-list">
            {users.map((u) => (
              <div className="admin-row" key={u.id}>
                <div className="admin-row-main">
                  <strong>{u.name}</strong>
                  <span className="admin-meta">{u.email} · {u.mobile || "no phone"}</span>
                  <span className="admin-meta">
                    <span className="chip">{u.accountType}{u.accountType === "USER" ? ` · ${u.activeRole}` : ""}{u.accountType === "NGO" && u.orgName ? ` · ${u.orgName}` : ""}</span>{" "}
                    {u.isSuspended
                      ? <span className="chip chip-bad">Suspended</span>
                      : <span className="chip">Active</span>}{u.isSuspended && u.suspendedUntil ? <span className="admin-meta"> until {new Date(u.suspendedUntil).toLocaleString()}</span> : null}
                  </span>
                </div>
                {u.accountType !== "ADMIN" && (
                  u.isSuspended
                    ? <button type="button" className="btn btn-small" onClick={() => userAction(u, "unsuspend")}>Unsuspend</button>
                    : <button type="button" className="btn btn-danger btn-small" onClick={() => userAction(u, "suspend")}>Suspend</button>
                )}
              </div>
            ))}
          </div>

          <h2>NGO review queue ({queue.length})</h2>
          {queue.length === 0 ? <p className="card-meta">No NGOs waiting for review.</p> : (
            <div className="admin-list">
              {queue.map((u) => (
                <div className="admin-row" key={u.id}>
                  <div className="admin-row-main">
                    <strong>{u.orgName || u.name}</strong>
                    <span className="admin-meta">{u.email}{u.name && u.orgName ? ` · ${u.name}` : ""}</span>
                    <span className="admin-meta">
                      📄 {u.ngoDocName || "document"}
                      {u.ngoSubmittedAt ? ` · submitted ${new Date(u.ngoSubmittedAt).toLocaleString()}` : ""}
                    </span>
                  </div>
                  {u.ngoDocFile && (
                    <a className="btn btn-small" href={`${API_BASE}/uploads/docs/${u.ngoDocFile}`} target="_blank" rel="noreferrer">View document</a>
                  )}
                  <button type="button" className="btn btn-small" onClick={() => ngoAction(u, "verify-ngo")}>Verify</button>
                  <button type="button" className="btn btn-danger btn-small" onClick={() => ngoAction(u, "reject-ngo")}>Reject</button>
                </div>
              ))}
            </div>
          )}

          <h2>Listings ({listings.length})</h2>
          <div className="admin-list">
            {listings.map((l) => (
              <div className="admin-row" key={l.id}>
                <div className="admin-row-main">
                  <strong>{l.foodName}</strong>
                  <span className="admin-meta">by {l.provider?.name || l.provider?.email || "provider"} · {portionsText(l)}</span>
                  <span className="admin-meta">
                    <span className="chip">{l.status}</span>{" "}
                    <span className="admin-meta">pickup before {new Date(l.deadline).toLocaleString()}</span>
                  </span>
                </div>
                {l.status === "REMOVED"
                  ? <button type="button" className="btn btn-small" onClick={() => listingAction(l, "restore")}>Restore</button>
                  : <button type="button" className="btn btn-danger btn-small" onClick={() => listingAction(l, "remove")}>Remove</button>}
              </div>
            ))}
          </div>

          <h2>Audit log (latest {audit.length})</h2>
          {audit.length === 0 ? <p className="card-meta">No admin actions recorded yet.</p> : (
            <div className="admin-list">
              {audit.map((e) => (
                <div className="admin-row" key={e.id}>
                  <div className="admin-row-main">
                    <span className="admin-meta">{new Date(e.createdAt).toLocaleString()} · {e.actorEmail}</span>
                    <span className="admin-meta">
                      <span className="chip">{e.action}</span>{" "}
                      {e.targetType}{e.targetId ? ` · ${e.targetId}` : ""}{e.detail ? ` · ${e.detail}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

