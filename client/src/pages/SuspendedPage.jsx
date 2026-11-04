import { useEffect, useState } from 'react';

function formatRemaining(ms) {
  if (ms <= 0) return '0 days 00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${d} day${d === 1 ? '' : 's'} ${h}:${m}:${ss}`;
}

// The ONLY page a suspended user can see. The countdown is live -
// it re-renders every second until the suspension ends.
export default function SuspendedPage({ until, reason, onDone }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const end = until ? new Date(until).getTime() : null;
  const left = end ? end - now : null;
  const over = left != null && left <= 0;

  return (
    <main className="suspended-page">
      <div className="suspended-card">
        <div className="suspended-icon">⛔</div>
        <h1>You are suspended</h1>
        {reason && <p>{reason}</p>}
        {end && !over && (
          <>
            <p className="card-meta">Your suspension ends on {new Date(end).toLocaleString()}.</p>
            <div className="suspended-count">{formatRemaining(left)}</div>
            <p className="card-meta">remaining — this page updates every second. An admin can lift your suspension earlier.</p>
          </>
        )}
        {over && (
          <>
            <p>Your suspension time is over.</p>
            <button type="button" className="btn btn-primary" onClick={onDone}>Continue to the app</button>
          </>
        )}
        {!end && <p className="card-meta">An admin can lift your suspension.</p>}
      </div>
    </main>
  );
}
