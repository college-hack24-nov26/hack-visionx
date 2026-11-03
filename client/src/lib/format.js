export const CATEGORIES = {
  COOKED_MEALS: "Cooked meals",
  RAW_PRODUCE: "Raw produce",
  BAKERY: "Bakery",
  DAIRY: "Dairy",
  PACKAGED_FOOD: "Packaged food",
  BEVERAGES: "Beverages",
  OTHER: "Other",
};

export const DIETARY = { VEG: "Veg", NON_VEG: "Non-veg", VEGAN: "Vegan" };

const PORTION_UNITS = {
  INDIVIDUAL_MEALS: "meals",
  BULK_SERVINGS: "servings",
  KILOGRAMS: "kg",
  LITRES: "litres",
  PACKETS: "packets",
};

export function portionsText(l) {
  const unit = l.bulkUnit || PORTION_UNITS[l.portionType] || "";
  return `${l.portionsRemaining} of ${l.portionCount} ${unit} left`;
}

export function timeLeft(deadline, now = Date.now()) {
  const ms = new Date(deadline).getTime() - now;
  if (Number.isNaN(ms)) return { label: "—", level: "low", ms: 0 };
  if (ms <= 0) return { label: "Expired", level: "expired", ms };
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label =
    h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  const level = ms <= 6 * 3600 * 1000 ? "high" : ms <= 24 * 3600 * 1000 ? "medium" : "low";
  return { label, level, ms };
}

export const SAFETY_LABELS = {
  HYGIENE_PREP: "Prepared and handled hygienically",
  DECLARED_STORAGE: "Storage conditions declared honestly",
  NOT_PREVIOUSLY_SERVED: "Not previously served to anyone",
  COOKED_TIME_ACCURATE: "Cooked / prepared time is accurate",
  NO_SPOILAGE_SIGNS: "No signs of spoilage",
  COVERED_PACKAGING: "Packed in covered, clean packaging",
  DEADLINE_FINAL: "Pickup deadline is final and realistic",
  DONOR_DECLARATION: "Donor takes responsibility for this food",
};

export const SAFETY_IDS = Object.keys(SAFETY_LABELS);
