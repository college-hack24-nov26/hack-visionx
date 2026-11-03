import { Link } from "react-router-dom";
import { API_BASE } from "../lib/api";
import { CATEGORIES, DIETARY, portionsText, timeLeft } from "../lib/format";

export default function ListingCard({ listing, now }) {
  const t = timeLeft(listing.deadline, now);
  const full = listing.status === "FULLY_CLAIMED";
  const badgeText = full
    ? "Fully claimed"
    : t.level === "high"
      ? "High urgency"
      : t.level === "medium"
        ? "Medium"
        : t.level === "expired"
          ? "Expired"
          : "Low";
  return (
    <Link to={`/browse/${listing.id}`} className={`card${full ? " card-full" : ""}`}>
      {listing.photoUrl ? (
        <img className="card-photo" src={API_BASE + listing.photoUrl} alt={listing.foodName} />
      ) : (
        <div className="card-photo card-photo-empty">🍲</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3>{listing.foodName}</h3>
          <span className={`urg urg-${full ? "expired" : t.level}`}>{badgeText}</span>
        </div>
        <p className="card-meta">
          {CATEGORIES[listing.category] || listing.category} · {DIETARY[listing.dietaryType] || listing.dietaryType}
        </p>
        <p className="card-meta">{portionsText(listing)}</p>
        <p className="card-meta">📍 {listing.pickupLocation}</p>
        <p className="card-meta">
          By {listing.provider?.orgName || listing.provider?.name || "Provider"} · ⏰ {t.label}
        </p>
      </div>
    </Link>
  );
}
