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
      </section>
    </main>
  );
}
