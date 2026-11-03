import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';

// Reads ?invite=<userId> from the URL once on load and remembers it for the
// Register page (sessionStorage key 'fws_invite'). If the code belongs to a
// real user, greets the visitor with the inviter's name. Renders nothing
// when there is no valid invite.
export default function InviteBanner() {
  const [inviterName, setInviterName] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let code = '';
    try {
      code = new URLSearchParams(window.location.search).get('invite') || '';
    } catch { code = ''; }
    if (code) {
      try { sessionStorage.setItem('fws_invite', code); } catch { /* storage unavailable */ }
    } else {
      try { code = sessionStorage.getItem('fws_invite') || ''; } catch { code = ''; }
    }
    if (!code) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/invites/${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data && data.inviterName) setInviterName(data.inviterName); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!inviterName || dismissed) return null;
  return (
    <div className="invite-banner">
      <span>You've been invited by {inviterName}</span>
      <button type="button" className="invite-banner-close" aria-label="Dismiss" onClick={() => setDismissed(true)}>×</button>
    </div>
  );
}
