import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api, API_BASE, getAccessToken } from '../lib/api';
import { starsText } from '../components/ReviewForm';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'मराठी' },
  { code: 'hi', label: 'हिंदी' },
];

export default function Profile() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { lang, setLang } = useLanguage();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [myReviews, setMyReviews] = useState(null);

  useEffect(() => {
    if (user && !seeded) {
      setName(user.name || '');
      setMobile(user.mobile || '');
      setSeeded(true);
    }
  }, [user, seeded]);

  const loadInvite = useCallback(async () => {
    const { status, data } = await api('/api/invites/mine');
    if (status === 200 && data && data.code) setInvite(data);
  }, []);

  useEffect(() => {
    if (user) loadInvite();
  }, [user, loadInvite]);
  useEffect(() => {
    if (!user) return;
    let on = true;
    api(`/api/reviews/user/${user.id}`).then(({ status, data }) => {
      if (on && status === 200) setMyReviews(data);
    });
    return () => { on = false; };
  }, [user]);

  async function saveProfile() {
    setBusy(true); setError(''); setNotice('');
    const { status, data } = await api('/api/auth/profile', {
      method: 'PATCH',
      body: { name: name.trim(), mobile: mobile.trim() },
    });
    if (status === 200) {
      await refreshUser();
      setNotice('Profile saved.');
    } else if (data && data.errors) {
      setError(Object.values(data.errors).filter(Boolean).join(' '));
    } else {
      setError((data && data.error) || 'Could not save your profile.');
    }
    setBusy(false);
  }

  async function changeLanguage(code) {
    setLang(code);
    setError(''); setNotice('');
    const { status, data } = await api('/api/auth/profile', {
      method: 'PATCH',
      body: { preferredLanguage: code },
    });
    if (status === 200) {
      await refreshUser();
      setNotice('Language saved.');
    } else {
      setError((data && data.error) || 'Could not save the language.');
    }
  }

  async function uploadPhoto() {
    if (!photoFile) { setError('Choose a photo first.'); return; }
    if (photoFile.size > 5 * 1024 * 1024) { setError('Photo must be 5 MB or smaller.'); return; }
    setPhotoBusy(true); setError(''); setNotice('');
    const fd = new FormData();
    fd.append('photo', photoFile);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Photo upload failed');
      await refreshUser();
      setPhotoFile(null);
      setNotice('Photo updated.');
    } catch (err) {
      setError(err.message || 'Photo upload failed');
    }
    setPhotoBusy(false);
  }

  async function copyInvite() {
    if (!invite) return;
    const link = `${window.location.origin}/?invite=${invite.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed - copy the link from the box instead.');
    }
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
          <h1>Profile</h1>
          <p>Please <Link to="/login">log in</Link> to see your profile.</p>
        </section>
      </main>
    );
  }

  const initial = (user.name || '?').trim().charAt(0).toUpperCase();
  const inviteLink = invite ? `${window.location.origin}/?invite=${invite.code}` : '';

  return (
    <main>
      <section className="card">
        <h1>Profile</h1>
        {error && <p className="bad">{error}</p>}
        {notice && <p className="ok">{notice}</p>}

        <div>
          {user.profilePhotoUrl ? (
            <img className="profile-avatar" src={API_BASE + user.profilePhotoUrl} alt="Your profile photo" />
          ) : (
            <span className="profile-avatar profile-avatar-initial">{initial}</span>
          )}
          <p><strong>{user.name}</strong></p>
          <p className="admin-meta">{user.email}</p>
          <p className="admin-meta">
            {user.accountType}
            {user.accountType === 'USER' ? ` · ${user.activeRole}` : ''}
            {user.accountType === 'NGO' && user.orgName ? ` · ${user.orgName}` : ''}
          </p>
        </div>

        {myReviews && (
          <>
            <h2>Reviews about you</h2>
            {myReviews.count === 0 ? (
              <p>No reviews yet — they appear here after a completed pickup.</p>
            ) : (
              <>
                <p><span className="review-stars">{starsText(Math.round(myReviews.average))}</span> <strong>{myReviews.average}</strong> · {myReviews.count} {myReviews.count === 1 ? "review" : "reviews"}</p>
                {myReviews.reviews.map((r, i) => (
                  <div key={i} className="review-item">
                    <p><span className="review-stars">{starsText(r.stars)}</span> <strong>{r.reviewerName}</strong></p>
                    {r.text && <p>{r.text}</p>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        <h2>Profile photo</h2>
        <div className="ngo-upload-row">
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          <button type="button" className="btn btn-primary" disabled={photoBusy || !photoFile} onClick={uploadPhoto}>
            {photoBusy ? 'Uploading…' : 'Upload photo'}
          </button>
        </div>

        <h2>Your details</h2>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Mobile
          <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </label>
        <p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={saveProfile}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </p>

        <h2>Language</h2>
        <label>
          Preferred language
          <select value={user.preferredLanguage || lang} onChange={(e) => changeLanguage(e.target.value)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>

        {invite && (
          <>
            <h2>Invite</h2>
            <p>Share your invite link - friends who register through it are counted here.</p>
            <div className="invite-link-box">
              <input type="text" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" onClick={copyInvite}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
            <p className="admin-meta">{invite.invitedCount} {invite.invitedCount === 1 ? 'person' : 'people'} joined through your link</p>
          </>
        )}
      </section>
    </main>
  );
}
