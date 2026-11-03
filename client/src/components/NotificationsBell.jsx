import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { timeAgo } from "../lib/format";

const TYPE_ICONS = {
  LISTING_PUBLISHED: "📢",
  CLAIM_PLACED: "🙋",
  CLAIMER_ON_THE_WAY: "🚶",
  CLAIM_CANCELLED: "↩️",
  LISTING_CANCELLED: "🚫",
  NEAR_DEADLINE: "⏰",
  CLAIM_COLLECTED: "✅",
  CLAIM_EXPIRED: "⌛",
};

export default function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api("/api/notifications").then(({ status, data }) => {
      if (status === 200) {
        setItems(data.notifications || []);
        setUnread(data.unreadCount || 0);
      }
    });
  }, []);

  // Fetch on mount, on every route change, and every 30 seconds
  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, load, location.pathname]);

  if (!user) return null;

  async function markAllRead() {
    await api("/api/notifications/read-all", { method: "POST" });
    load();
  }

  async function openItem(n) {
    if (!n.read) {
      await api(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.relatedListingId) navigate(`/browse/${n.relatedListingId}`);
  }

  async function dismiss(e, n) {
    e.stopPropagation();
    await api(`/api/notifications/${n.id}`, { method: "DELETE" });
    setItems((list) => list.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div className="bell-wrap">
      <button type="button" className="bell-btn" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="bell-overlay" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">
              <strong>Notifications</strong>
              {unread > 0 && (
                <button type="button" className="bell-markall" onClick={markAllRead}>Mark all read</button>
              )}
            </div>
            {items.length === 0 && <p className="bell-empty">No notifications yet</p>}
            <div className="bell-list">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`bell-item${n.read ? "" : " bell-unread"}`}
                  onClick={() => openItem(n)}
                >
                  <span className="bell-icon">{TYPE_ICONS[n.type] || "🔔"}</span>
                  <div className="bell-text">
                    <div className="bell-title">{!n.read && <span className="bell-dot" />}{n.title}</div>
                    {n.body && <div className="bell-body">{n.body}</div>}
                    <div className="bell-time">{timeAgo(n.createdAt)}</div>
                  </div>
                  <button type="button" className="bell-x" aria-label="Dismiss" onClick={(e) => dismiss(e, n)}>×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
