import { Link } from "react-router-dom";
import { API_BASE } from "../lib/api";
import { CATEGORIES, DIETARY, portionsText, timeLeft } from "../lib/format";
import { formatKm } from "../lib/location";
import { useLanguage } from "../i18n/LanguageContext";

// "3 meals" style text for any count, reusing portionsText's own unit words
function countText(listing, n) {
  const s = portionsText({ portionsRemaining: n, portionCount: n, bulkUnit: listing.bulkUnit, portionType: listing.portionType });
  return s.replace(` of ${n}`, "").replace(" left", "");
}

export default function ListingCard({ listing, now, myClaim, onCancelClaim, distanceKm }) {
  const { t: tr } = useLanguage();
  const t = timeLeft(listing.deadline, now);
  const full = listing.status === "FULLY_CLAIMED";
  const badgeText = full
    ? tr("cardFullyClaimed")
    : t.level === "high"
      ? tr("cardUrgHigh")
      : t.level === "medium"
        ? tr("cardUrgMedium")
        : t.level === "expired"
          ? tr("cardUrgExpired")
          : tr("cardUrgLow");
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
        {distanceKm != null && (
          <p className="card-meta"><span className="chip">📍 {formatKm(distanceKm)} {tr("cardAwayStraight")}</span></p>
        )}
        <p className="card-meta">
          {tr("cardBy")} {listing.provider?.orgName || listing.provider?.name || "Provider"} · ⏰ {t.label}
        </p>
        {listing.providerVerified && (
          <p className="card-meta"><span className="verified-chip">{tr("cardVerifiedNgo")}</span></p>
        )}
        {myClaim && (
          <div className="card-claim">
            <span>✅ {tr("cardYourClaim")} {countText(listing, myClaim.portions)}</span>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancelClaim(myClaim, listing);
              }}
            >
              {tr("cardCancel")}
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}
