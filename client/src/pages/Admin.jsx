import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const isAdmin = Boolean(user) && user.accountType === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [u, l] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/listings'),
    ]);
    if (u.status !== 200) {
      setError((u.data && u.data.error) || 'Could not load users.');
    } else {
      setUsers(u.data.users || []);
    }
    if (l.status !== 200) {
      setError((l.data && l.data.error) || 'Could not load listings.');
    } else {
      setListings(l.data.listings || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin, loadAll]);

  async function userAction(u, action) {
    if (action === 'suspend') {
      const ok = window.confirm(`Suspend ${u.name}? They will not be able to post or claim.`);
      if (!ok) return;
    }
    setBusyId(u.id);
    setError('');
    setNotice('');
    const res = await api(`/api/admin/users/${u.id}/${action}`, { method: 'POST' });
    setBusyId('');
    if (res.status !== 200) {
      setError((res.data && res.data.error) || 'Action failed.');
      return;
    }
    setNotice(action === 'suspend' ? `${u.name} suspended.` : `${u.name} unsuspended.`);
    loadAll();
  }

  async function listingAction(l, action) {
    if (action === 'remove') {
      const ok = window.confirm(`Remove "${l.foodName}" from browse?`);
      if (!ok) return;
    }
    setBusyId(l.id);
    setError('');
    setNotice('');
    const res = await api(`/api/admin/listings/${l.id}/${action}`, { method: 'POST' });
    setBusyId('');
    if (res.status !== 200) {
      setError((res.data && res.data.error) || 'Action failed.');
      return;
    }
    setNotice(action === 'remove' ? `"${l.foodName}" removed.` : `"${l.foodName}" restored.`);
    loadAll();
  }

  if (authLoading) {
    return (
      <main>
        <section className="card"><p>Loading…</p></section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main>
        <section className="card">
          <h1>Admin access only</h1>
          <p>This page is only available to the admin account.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card">
        <h1>Admin</h1>
        {error && <p className="bad">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        {loading && <p>Loading…</p>}

        <h2>Users ({users.length})</h2>
        {!loading && users.length === 0 && <p>No users yet.</p>}
        <div className="admin-list">
          {users.map((u) => (
            <div key={u.id} className="admin-row">
              <div className="admin-row-main">
                <strong>{u.name}</strong>
                <span className="chip">{u.accountType}{u.accountType === 'USER' ? ` · ${u.activeRole}` : ''}</span>
                {u.isSuspended
                  ? <span className="chip chip-bad">Suspended</span>
                  : <span className="chip">Active</span>}
              </div>
              <p className="admin-meta">
                {u.email} · {u.mobile || 'no mobile'}
                {u.accountType === 'NGO' && u.orgName ? ` · ${u.orgName}` : ''}
              </p>
              {u.accountType !== 'ADMIN' && (
                u.isSuspended ? (
                  <button type="button" className="btn btn-ghost" disabled={busyId === u.id} onClick={() => userAction(u, 'unsuspend')}>
                    Unsuspend
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" disabled={busyId === u.id} onClick={() => userAction(u, 'suspend')}>
                    Suspend
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        <h2>Listings ({listings.length})</h2>
        {!loading && listings.length === 0 && <p>No listings yet.</p>}
        <div className="admin-list">
          {listings.map((l) => (
            <div key={l.id} className="admin-row">
              <div className="admin-row-main">
                <strong>{l.foodName}</strong>
                <span className="chip">{l.status}</span>
              </div>
              <p className="admin-meta">
                Donor: {l.provider ? l.provider.name : '—'} · {l.portionsRemaining}/{l.portionCount} portions left · Deadline: {new Date(l.deadline).toLocaleString()}
              </p>
              {l.status === 'REMOVED' ? (
                <button type="button" className="btn btn-ghost" disabled={busyId === l.id} onClick={() => listingAction(l, 'restore')}>
                  Restore
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" disabled={busyId === l.id} onClick={() => listingAction(l, 'remove')}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
