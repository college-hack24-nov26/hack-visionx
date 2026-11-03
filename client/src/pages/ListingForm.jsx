import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, getAccessToken } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSavedLocation } from "../context/LocationContext";
import { devicePosition, reverseLabel } from "../lib/location";
import { CATEGORIES, DIETARY, SAFETY_IDS, SAFETY_LABELS } from "../lib/format";

const PORTION_TYPES = {
  INDIVIDUAL_MEALS: "Individual meals",
  BULK_SERVINGS: "Bulk servings",
  KILOGRAMS: "Kilograms",
  LITRES: "Litres",
  PACKETS: "Packets",
};

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function sourceText(src) {
  return src === "gap" ? "our trained model" : "recognition model";
}

const EMPTY = {
  foodName: "", details: "", category: "COOKED_MEALS", dietaryType: "VEG",
  portionType: "INDIVIDUAL_MEALS", portionCount: "10", bulkUnit: "",
  pickupLocation: "", contactPhone: "", showContact: false, deadline: "",
};

export default function ListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { saved: savedLoc } = useSavedLocation();
  const [form, setForm] = useState(() => ({ ...EMPTY, pickupLocation: savedLoc?.label || "" }));
  const [checks, setChecks] = useState([]);
  const [savedId, setSavedId] = useState(id || null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingListing, setLoadingListing] = useState(!!id);
  const [recogFile, setRecogFile] = useState(null);
  const [recogBusy, setRecogBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [point, setPoint] = useState(null);
  const [pointBusy, setPointBusy] = useState(false);
  const touched = useRef(new Set());
  const recogSeq = useRef(0);

  useEffect(() => {
    if (!id) return;
    api("/api/listings/mine").then(({ status, data }) => {
      if (status === 200) {
        const l = (data.listings || []).find((x) => x.id === id);
        if (l) {
          setForm({
            foodName: l.foodName || "", details: l.details || "",
            category: l.category || "COOKED_MEALS", dietaryType: l.dietaryType || "VEG",
            portionType: l.portionType || "INDIVIDUAL_MEALS",
            portionCount: String(l.portionCount ?? ""), bulkUnit: l.bulkUnit || "",
            pickupLocation: l.pickupLocation || "", contactPhone: l.contactPhone || "",
            showContact: !!l.showContact, deadline: toLocalInput(l.deadline),
          });
          setChecks(Array.isArray(l.safetyChecklist) ? l.safetyChecklist : []);
          setPhotoUrl(l.photoUrl || "");
          if (l.latitude != null && l.longitude != null) setPoint({ lat: l.latitude, lng: l.longitude });
        } else setError("This listing was not found in your listings.");
      }
      setLoadingListing(false);
    });
  }, [id]);

  function set(field, value) {
    touched.current.add(field);
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleCheck(cid) {
    setChecks((c) => (c.includes(cid) ? c.filter((x) => x !== cid) : [...c, cid]));
    setErrors((e) => ({ ...e, safetyChecklist: undefined }));
  }

  function onPickupText(v) {
    set("pickupLocation", v);
    if (point) setPoint(null);
  }

  async function useCurrentPoint() {
    setPointBusy(true); setError("");
    try {
      const pos = await devicePosition();
      setPoint({ lat: pos.lat, lng: pos.lng });
      const label = await reverseLabel(pos.lat, pos.lng);
      if (label) set("pickupLocation", label);
    } catch {
      setError("Could not get your location - check the browser permission and try again.");
    }
    setPointBusy(false);
  }

  function payload() {
    return {
      foodName: form.foodName, details: form.details, category: form.category,
      dietaryType: form.dietaryType, portionType: form.portionType,
      portionCount: Number(form.portionCount), bulkUnit: form.bulkUnit,
      pickupLocation: form.pickupLocation, contactPhone: form.contactPhone,
      showContact: form.showContact,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : "",
      safetyChecklist: checks,
      latitude: point ? point.lat : null,
      longitude: point ? point.lng : null,
    };
  }

  async function saveDraft() {
    const body = payload();
    if (savedId) {
      const { status, data } = await api(`/api/listings/${savedId}`, { method: "PATCH", body });
      if (status !== 200) { setError(data.error || "Could not save draft"); return null; }
      return savedId;
    }
    const { status, data } = await api("/api/listings", { method: "POST", body });
    if (status !== 201) { setError(data.error || "Could not save draft"); return null; }
    const newId = (data.listing || data).id;
    setSavedId(newId);
    return newId;
  }

  async function handleSaveDraft() {
    setBusy(true); setError(""); setNotice("");
    const lid = await saveDraft();
    setBusy(false);
    if (lid) {
      setNotice("Draft saved.");
      if (!id) navigate(`/listings/${lid}/edit`, { replace: true });
    }
  }

  async function handlePublish() {
    setBusy(true); setError(""); setNotice(""); setErrors({});
    const lid = await saveDraft();
    if (!lid) { setBusy(false); return; }
    const { status, data } = await api(`/api/listings/${lid}/publish`, { method: "POST" });
    setBusy(false);
    if (status === 200) { navigate("/my-listings"); return; }
    if (status === 400 && data.errors) { setErrors(data.errors); setError("Some fields need attention before publishing - see below each field."); return; }
    setError(data.error || "Could not publish this listing");
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !savedId) return;
    if (file.size > 5 * 1024 * 1024) { setError("Photo must be 5 MB or smaller."); return; }
    setError("");
    const fd = new FormData();
    fd.append("photo", file);
    try {
      const res = await fetch(`${API_BASE}/api/listings/${savedId}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Photo upload failed");
      setPhotoUrl((data.listing || data).photoUrl || "");
      setNotice("Photo uploaded.");
    } catch (err) {
      setError(err.message || "Photo upload failed");
    }
  }

  function applySuggestion(s) {
    if (s.foodName && !form.foodName) set("foodName", s.foodName);
    if (s.description && !form.details) set("details", s.description);
    if (s.category && !touched.current.has("category") && Object.prototype.hasOwnProperty.call(CATEGORIES, s.category)) set("category", s.category);
    if (s.dietaryType && !touched.current.has("dietaryType") && Object.prototype.hasOwnProperty.call(DIETARY, s.dietaryType)) set("dietaryType", s.dietaryType);
    setSuggestion(s);
  }

  function pickAlternative(a) {
    set("foodName", a.foodName);
    setSuggestion((prev) => ({ ...(prev || {}), foodName: a.foodName, confidence: a.confidence, source: a.source }));
  }

  async function handleRecognize(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Photo must be 5 MB or smaller."); return; }
    const mySeq = ++recogSeq.current;
    setRecogBusy(true); setError(""); setNotice("");
    const fd = new FormData();
    fd.append("photo", file);
    try {
      const res = await fetch(`${API_BASE}/api/listings/recognize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (recogSeq.current !== mySeq) return;
      if (!res.ok) throw new Error(data.error || "Recognition failed");
      if (data.suggestion) applySuggestion(data.suggestion);
      setAlternatives(Array.isArray(data.alternatives) ? data.alternatives : []);
    } catch (err) {
      if (recogSeq.current !== mySeq) return;
      const msg = err.message && err.message !== "Failed to fetch"
        ? err.message
        : "Recognition is unavailable right now - you can still type the details.";
      setError(msg);
      setSuggestion(null);
      setAlternatives([]);
    }
    if (recogSeq.current === mySeq) setRecogBusy(false);
  }

  if (authLoading || loadingListing) return <p>Loading...</p>;
  if (!user) return <p>Please <Link to="/login">log in</Link> to list food.</p>;
  if (user.activeRole !== "PROVIDER")
    return <div className="notice">You are in Claimer mode. Switch to <strong>Donor</strong> in the top bar to list food.</div>;

  const field = (name, label, input) => (
    <div className="field">
      <label>{label}</label>
      {input}
      {errors[name] && <p className="field-error">{errors[name]}</p>}
    </div>
  );
  const bulk = form.portionType === "KILOGRAMS" || form.portionType === "LITRES";

  return (
    <section className="auth-page">
      <div className="form-card">
        <h1>{id ? "Edit listing" : "New listing"}</h1>
        {error && <div className="form-error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {field("foodName", "Food name", <input value={form.foodName} onChange={(e) => set("foodName", e.target.value)} placeholder="e.g. Veg Biryani" />)}
        {field("details", "Details", <textarea rows={3} value={form.details} onChange={(e) => set("details", e.target.value)} placeholder="What is it, when was it made, any notes" />)}
        {field("category", "Category", (
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {field("dietaryType", "Dietary type", (
          <select value={form.dietaryType} onChange={(e) => set("dietaryType", e.target.value)}>
            {Object.entries(DIETARY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {field("portionType", "Portion type", (
          <select value={form.portionType} onChange={(e) => set("portionType", e.target.value)}>
            {Object.entries(PORTION_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {field("portionCount", "How many portions / quantity", <input type="number" min="1" value={form.portionCount} onChange={(e) => set("portionCount", e.target.value)} />)}
        {bulk && field("bulkUnit", "Unit (e.g. kg, litres, boxes)", <input value={form.bulkUnit} onChange={(e) => set("bulkUnit", e.target.value)} />)}
        {field("pickupLocation", "Pickup location", <input value={form.pickupLocation} onChange={(e) => onPickupText(e.target.value)} placeholder="Area / landmark" />)}

        <div className="field">
          <label>Pickup point (for distances and the pickup map)</label>
          {point ? (
            <p className="recog-line">
              Point set: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}{" "}
              <button type="button" className="chip" onClick={() => setPoint(null)}>Remove</button>
            </p>
          ) : (
            <p className="hint">No point set - claimers won't see a distance or a map for this listing.</p>
          )}
          <div className="recog-row">
            <button type="button" className="btn btn-ghost" disabled={pointBusy} onClick={useCurrentPoint}>
              {pointBusy ? "Locating..." : "Use current location"}
            </button>
          </div>
          <p className="hint">The point comes only from this device's current location, so it always matches where the food really is.</p>
          {errors.pickupPoint && <p className="field-error">{errors.pickupPoint}</p>}
        </div>

        {field("contactPhone", "Contact phone", <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="10-digit mobile" />)}
        <div className="field">
          <label className="check-row">
            <input type="checkbox" checked={form.showContact} onChange={(e) => set("showContact", e.target.checked)} />
            Show my phone number to signed-in claimers
          </label>
        </div>
        {field("deadline", "Pickup deadline", <input type="datetime-local" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />)}
        <p className="hint">Deadline can be at most 24 hours from now.</p>

        <div className="field">
          <label>Food safety declarations - all 8 are required to publish</label>
          <div className="check-list">
            {SAFETY_IDS.map((cid) => (
              <label key={cid} className="check-row">
                <input type="checkbox" checked={checks.includes(cid)} onChange={() => toggleCheck(cid)} />
                {SAFETY_LABELS[cid]}
              </label>
            ))}
          </div>
          {errors.safetyChecklist && <p className="field-error">{errors.safetyChecklist}</p>}
        </div>

        <div className="notice">
          <strong>Terms, in plain words:</strong> the food you share is your responsibility. The declarations above are your promise that it was prepared and stored safely. If a claimer falls ill - including food poisoning - after eating food you provided, the responsibility is yours. Please share only food you would serve your own family.
        </div>

        {!id && (
          <div className="field">
            <label>Recognize food from a photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setRecogFile(f);
                if (f) handleRecognize(f);
              }}
            />
            {recogBusy && <p className="recog-line">Recognizing...</p>}
            {suggestion && !recogBusy && (
              <p className="recog-line">
                Looks like <strong>{suggestion.foodName}</strong> ({Math.round((suggestion.confidence || 0) * 100)}% sure - {sourceText(suggestion.source)})
              </p>
            )}
            {alternatives.length > 0 && !recogBusy && (
              <div className="recog-alts">
                <span className="hint">Or maybe:</span>
                {alternatives.map((a) => (
                  <button key={a.foodName} type="button" className="chip recog-chip" onClick={() => pickAlternative(a)}>
                    {a.foodName} - {Math.round((a.confidence || 0) * 100)}%
                  </button>
                ))}
              </div>
            )}
            <p className="hint">Recognition fills only the fields you have left empty - anything you typed stays yours.</p>
          </div>
        )}

        <div className="field">
          <label>Photo</label>
          {photoUrl && <img className="form-photo" src={API_BASE + photoUrl} alt="" />}
          {savedId ? (
            <input type="file" accept="image/*" onChange={handlePhoto} />
          ) : (
            <p className="hint">Save the draft first, then you can add a photo (max 5 MB).</p>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleSaveDraft}>Save Draft</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handlePublish}>Publish</button>
        </div>
      </div>
    </section>
  );
}
