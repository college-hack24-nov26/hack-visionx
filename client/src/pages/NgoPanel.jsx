import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, API_BASE, getAccessToken } from '../lib/api';

export default function NgoPanel() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [entries, setEntries] = useState(null);
  const [totals, setTotals] = useState(null);
  const [rPortions, setRPortions] = useState('');
  const [rPeople, setRPeople] = useState('');
  const [rNote, setRNote] = useState('');
  const [rClaimId, setRClaimId] = useState('');
  const [rKind, setRKind] = useState('Other');
  const [rBusy, setRBusy] = useState(false);
  const [rError, setRError] = useState('');
  const [rNotice, setRNotice] = useState('');

  const isNgo = Boolean(user) && user.accountType === 'NGO';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const { status: code, data } = await api('/api/ngo/status');
    if (code === 200) setStatus(data);
    else setError((data && data.error) || 'Could not load your verification status.');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isNgo) loadStatus();
  }, [isNgo, loadStatus]);

  const loadRedistributions = useCallback(async () => {
    const { status: code, data } = await api('/api/ngo/redistributions');
    if (code === 200) {
      setEntries(data.entries || []);
      setTotals(data.totals || {
        totalPortions: data.totalPortions || 0,
        totalPeopleServed: data.totalPeopleServed || 0,
      });
    }
  }, []);

  useEffect(() => {
    if (isNgo && status && status.status === 'VERIFIED') loadRedistributions();
  }, [isNgo, status, loadRedistributions]);

  async function handleUpload() {
    if (!file) { setError('Choose a document file first.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Document must be 5 MB or smaller.'); return; }
    setBusy(true); setError(''); setNotice('');
    const fd = new FormData();
    fd.append('document', file);
    try {
      const res = await fetch(`${API_BASE}/api/ngo/document`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setNotice('Document uploaded. Your NGO is now waiting for review.');
      setFile(null);
      loadStatus();
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
    setBusy(false);
  }

  async function handleLog() {
    const portions = Number(rPortions);
    const peopleServed = Number(rPeople);
    if (!Number.isInteger(portions) || portions <= 0) { setRError('Portions must be a positive whole number.'); return; }
    if (!Number.isInteger(peopleServed) || peopleServed <= 0) { setRError('People served must be a positive whole number.'); return; }
    setRBusy(true); setRError(''); setRNotice('');
    const body = { portions, peopleServed, destinationKind: rKind };
    if (rNote.trim()) body.note = rNote.trim();
    if (rClaimId.trim()) body.claimId = rClaimId.trim();
    const { status: code, data } = await api('/api/ngo/redistributions', { method: 'POST', body });
    if (code === 200 || code === 201) {
      setRNotice('Redistribution logged. Thank you!');
      setRPortions(''); setRPeople(''); setRNote(''); setRClaimId(''); setRKind('Other');
      loadRedistributions();
    } else {
      setRError((data && data.error) || 'Could not log the redistribution.');
    }
    setRBusy(false);
  }

  if (authLoading) {
    return (
      <main>
        <section className="card"><p>Loading…</p></section>
      </main>
    );
  }

  if (!user) {
    return (
      <main>
        <section className="card">
          <h1>NGO Panel</h1>
          <p>Please <Link to="/login">log in</Link> with your NGO account.</p>
        </section>
      </main>
    );
  }

  if (!isNgo) {
    return (
      <main>
        <section className="card">
          <h1>NGO Panel</h1>
          <p>This page is only for NGO accounts.</p>
        </section>
      </main>
    );
  }

  const s = (status && status.status) || 'NONE';

  return (
    <main>
      <section className="card">
        <h1>NGO Panel</h1>
        {user.orgName && <p><strong>{user.orgName}</strong></p>}
        {error && <p className="bad">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        {loading && <p>Loading…</p>}

        {!loading && s === 'VERIFIED' && (
          <div>
            <p><span className="verified-chip">✓ Verified NGO</span></p>
            <p>Your organisation is verified. Donors and claimers can see the Verified NGO badge next to your name.</p>
          </div>
        )}

        {!loading && s === 'PENDING' && (
          <div>
            <h2>Verification pending</h2>
            <p>Your document is under review. An admin will check it soon — you can keep claiming food while you wait.</p>
            {status.docName && <p className="admin-meta">Document: {status.docName}</p>}
            {status.submittedAt && <p className="admin-meta">Submitted: {new Date(status.submittedAt).toLocaleString()}</p>}
          </div>
        )}

        {!loading && (s === 'NONE' || s === 'REJECTED') && (
          <div>
            <h2>{s === 'REJECTED' ? 'Verification was not approved' : 'Get verified'}</h2>
            {s === 'REJECTED' && status.reviewNote && (
              <p className="bad">Reason from the admin: {status.reviewNote}</p>
            )}
            <p>Upload your organisation's registration certificate (PDF, JPEG or PNG, up to 5 MB). An admin checks it, and verified NGOs get a badge that donors can trust.</p>
            <div className="ngo-upload-row">
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button type="button" className="btn btn-primary" disabled={busy || !file} onClick={handleUpload}>
                {busy ? 'Uploading…' : 'Upload document'}
              </button>
            </div>
          </div>
        )}

        {!loading && s === 'VERIFIED' && (
          <div>
            <h2>Redistribution log</h2>
            <p>Log food your NGO has given out after collecting it, so the impact shows.</p>
            {totals && (
              <p><strong>{totals.totalPortions} portions redistributed · {totals.totalPeopleServed} people served</strong></p>
            )}
            {rError && <p className="bad">{rError}</p>}
            {rNotice && <p className="ok">{rNotice}</p>}
            <label>
              Portions redistributed
              <input type="number" min="1" step="1" value={rPortions} onChange={(e) => setRPortions(e.target.value)} />
            </label>
            <label>
              People served
              <input type="number" min="1" step="1" value={rPeople} onChange={(e) => setRPeople(e.target.value)} />
            </label>
            <label>
              Destination kind
              <select value={rKind} onChange={(e) => setRKind(e.target.value)}>
                <option value="Shelter">Shelter</option>
                <option value="Old-age home">Old-age home</option>
                <option value="Orphanage">Orphanage</option>
                <option value="Street distribution">Street distribution</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>
              Note (optional)
              <input type="text" value={rNote} onChange={(e) => setRNote(e.target.value)} placeholder="e.g. Given out at the community hall" />
            </label>
            <label>
              Claim ID (optional)
              <input type="text" value={rClaimId} onChange={(e) => setRClaimId(e.target.value)} />
            </label>
            <p>
              <button type="button" className="btn btn-primary" disabled={rBusy} onClick={handleLog}>
                {rBusy ? 'Logging…' : 'Log redistribution'}
              </button>
            </p>
            {entries && entries.length > 0 && (
              <div className="admin-list">
                {entries.map((e) => (
                  <div className="admin-row" key={e.id}>
                    <div className="admin-row-main">
                      <strong>{e.portions} portions · {e.peopleServed} people served{e.destinationKind ? ` · ${e.destinationKind}` : ''}</strong>
                      <span className="admin-meta">{new Date(e.createdAt).toLocaleString()}</span>
                      {e.note && <span className="admin-meta">{e.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {entries && entries.length === 0 && <p className="admin-meta">No redistribution logged yet.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
