import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, getAccessToken } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSavedLocation } from "../context/LocationContext";
import { devicePosition, reverseLabel } from "../lib/location";
import { CATEGORIES, DIETARY, SAFETY_IDS, SAFETY_LABELS } from "../lib/format";
import CameraCapture from "../components/CameraCapture";

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
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingListing, setLoadingListing] = useState(!!id);
  const [recogBusy, setRecogBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [point, setPoint] = useState(null);
  const [pointBusy, setPointBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [recogNote, setRecogNote] = useState("");
  const touched = useRef(new Set());
  const recogSeq = useRef(0);

  function applyLoadedListing(l) {
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
  }

  useEffect(() => {
    if (!id) return;
    api("/api/listings/mine").then(async ({ status, data }) => {
      if (status === 200) {
        const l = (data.listings || []).find((x) => x.id === id);
        if (l) {
          applyLoadedListing(l);
          setLoadingListing(false);
          return;
        }
        // Admins can open and edit any listing, not only their own.
        if (user && user.accountType === "ADMIN") {
          const r = await api(`/api/listings/${id}`);
          if (r.status === 200 && r.data.listing) {
            applyLoadedListing(r.data.listing);
            setLoadingListing(false);
            return;
          }
        }
        setError("This listing was not found in your listings.");
      }
      setLoadingListing(false);
    });
  }, [id]);

  function set(field, value) {
    touched.current.add(field);
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function onPickupText(v) {
    set("pickupLocation", v);
    // Editing the address by hand drops the captured point: the point must
    // always be a fresh capture of where the food is at posting time.
    if (point) setPoint(null);
  }

  async function useCurrentPoint() {
    setPointBusy(true); setError("");
    try {
      const pos = await devicePosition();
      setPoint({ lat: pos.lat, lng: pos.lng });
      setErrors((e) => ({ ...e, pickupPoint: undefined }));
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

  async function uploadPhoto(listingId, file) {
    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`${API_BASE}/api/listings/${listingId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Photo upload failed");
    return (data.listing || data).photoUrl || "";
  }

  async function saveDraft() {
    const body = payload();
    let lid = savedId;
    if (lid) {
      const { status, data } = await api(`/api/listings/${lid}`, { method: "PATCH", body });
      if (status !== 200) { setError(data.error || "Could not save draft"); return null; }
    } else {
      const { status, data } = await api("/api/listings", { method: "POST", body });
      if (status !== 201) { setError(data.error || "Could not save draft"); return null; }
      lid = (data.listing || data).id;
      setSavedId(lid);
    }
    // A photo chosen at the top of the form is attached as soon as the
    // listing exists - one photo does both recognition and the listing.
    if (pendingPhoto) {
      try {
        const url = await uploadPhoto(lid, pendingPhoto);
        if (url) setPhotoUrl(url);
        setPendingPhoto(null);
        setPhotoPreview("");
      } catch (err) {
        setError(err.message || "Photo upload failed");
        return null;
      }
    }
    return lid;
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
    // Posting requires the donor's CURRENT location, captured in this
    // session - a listing always starts from where the food is right now.
    if (!point) {
      setErrors((e) => ({ ...e, pickupPoint: "Tap 'Use current location' so the pickup point is where you are right now." }));
      setError("Your current location is required before publishing - see the pickup location section.");
      document.getElementById("pickup-point-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true); setError(""); setNotice(""); setErrors({});
    const lid = await saveDraft();
    if (!lid) { setBusy(false); return; }
    const { status, data } = await api(`/api/listings/${lid}/publish`, { method: "POST" });
    setBusy(false);
    if (status === 200) { navigate("/my-listings"); return; }
    if (status === 400 && data.errors) { setErrors(data.errors); setError("Some fields need attention before publishing - see below each field."); return; }
    setError(data.error || "Could not publish this listing");
  }

  // One intake for every photo source - file picker or camera capture.
  function acceptPhoto(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Photo must be 5 MB or smaller."); return; }
    setError("");
    if (id) {
      uploadPhoto(savedId, file)
        .then((url) => { setPhotoUrl(url); setNotice("Photo uploaded."); })
        .catch((err) => setError(err.message || "Photo upload failed"));
      return;
    }
    setPendingPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    handleRecognize(file);
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
      if (data.suggestion) { applySuggestion(data.suggestion); setRecogNote(""); }
      else {
        setSuggestion(null);
        setRecogNote("We couldn't recognize this photo confidently - it may not be a food photo. Please type the dish name below.");
      }
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

  function onTopPhoto(e) {
    acceptPhoto(e.target.files?.[0] || null);
    e.target.value = "";
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

        <div className="field">
          <label>{id ? "Photo" : "Photo - we fill the form from it"}</label>
          {(photoPreview || photoUrl) && (
            <img className="form-photo" src={photoPreview || API_BASE + photoUrl} alt="" />
          )}
          <input type="file" accept="image/*" onChange={onTopPhoto} />
          <div className="recog-row">
            <button type="button" className="btn btn-ghost" onClick={() => setCameraOpen(true)}>
              📷 Scan with camera
            </button>
          </div>
          {cameraOpen && (
            <CameraCapture
              onCapture={(f) => { acceptPhoto(f); setCameraOpen(false); }}
              onClose={() => setCameraOpen(false)}
            />
          )}
          {!id && (
            <>
              {recogBusy && <p className="recog-line">Recognizing...</p>}
              {suggestion && !recogBusy && (
                <p className="recog-line">
                  Looks like <strong>{suggestion.foodName}</strong> ({Math.round((suggestion.confidence || 0) * 100)}% sure - {sourceText(suggestion.source)})
                </p>
              )}
              {recogNote && !recogBusy && <p className="recog-note">{recogNote}</p>}
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
              <p className="hint">Recognition fills only the fields you have left empty - anything you typed stays yours. The same photo becomes the listing's photo when you save.</p>
            </>
          )}
        </div>

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

        <div className="field" id="pickup-point-section">
          <label>Pickup location</label>
          <input value={form.pickupLocation} onChange={(e) => onPickupText(e.target.value)} placeholder="Area / landmark" />
          {errors.pickupLocation && <p className="field-error">{errors.pickupLocation}</p>}
          <div className="recog-row">
            <button type="button" className="btn btn-ghost" disabled={pointBusy} onClick={useCurrentPoint}>
              {pointBusy ? "Locating..." : "Use current location"}
            </button>
            {point && <span className="verify-ok">Pickup point set: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>}
          </div>
          {point ? (
            <p className="hint">
              This point is your location right now, captured on this device - it powers the distance shown to claimers and their pickup map.{" "}
              <button type="button" className="chip" onClick={() => setPoint(null)}>Remove</button>
            </p>
          ) : (
            <p className="hint">Publishing requires your current location: tap the button where the food is, at the time of posting. Typing an address by hand is not enough - and editing the address afterwards clears the point, so tap again.</p>
          )}
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
          <label>Food safety & terms</label>
          <div className="agree-row">
            <input
              type="checkbox"
              checked={SAFETY_IDS.every((cid) => checks.includes(cid))}
              onChange={(e) => {
                setChecks(e.target.checked ? [...SAFETY_IDS] : []);
                setErrors((er) => ({ ...er, safetyChecklist: undefined }));
              }}
            />
            <span>I agree to the food-safety declarations and terms - the food I share is my responsibility.</span>
          </div>
          <div className="recog-row">
            <button type="button" className="btn btn-ghost" onClick={() => setTermsOpen(true)}>
              Read the declarations & terms
            </button>
          </div>
          {errors.safetyChecklist && <p className="field-error">{errors.safetyChecklist}</p>}
        </div>

        {termsOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3>Food safety declarations</h3>
              <p>By publishing, you declare all of the following:</p>
              <ul className="terms-list">
                {SAFETY_IDS.map((cid) => (
                  <li key={cid}>{SAFETY_LABELS[cid]}</li>
                ))}
              </ul>
              <p>
                <strong>Terms, in plain words:</strong> the food you share is your responsibility. The declarations above are your promise that it was prepared and stored safely. If a claimer falls ill - including food poisoning - after eating food you provided, the responsibility is yours. Please share only food you would serve your own family.
              </p>
              <div className="camera-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setChecks([...SAFETY_IDS]);
                    setErrors((er) => ({ ...er, safetyChecklist: undefined }));
                    setTermsOpen(false);
                  }}
                >
                  I agree
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setTermsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleSaveDraft}>Save Draft</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handlePublish}>Publish</button>
        </div>
      </div>
    </section>
  );
}
