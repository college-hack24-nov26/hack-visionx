import { useState } from "react";
import { api } from "../lib/api";

export function starsText(n) {
  const v = Math.max(0, Math.min(5, Math.round(n || 0)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

export default function ReviewForm({ claimId, label }) {
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!stars) { setError("Choose a star rating first."); return; }
    setBusy(true); setError("");
    const { status, data } = await api("/api/reviews", {
      method: "POST",
      body: { claimId, stars, text: text.trim() },
    });
    if (status === 201) setDone(true);
    else setError((data && data.error) || "Could not post the review");
    setBusy(false);
  }

  if (done) return <p className="ok">Thanks — review posted.</p>;

  return (
    <div className="review-form">
      <p className="card-meta"><strong>{label}</strong></p>
      <div className="review-star-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= stars ? "review-star on" : "review-star"}
            onClick={() => setStars(n)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            {n <= stars ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        className="control-input"
        rows={2}
        maxLength={500}
        placeholder="Say a line about the pickup (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <div className="form-error">{error}</div>}
      <p>
        <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={submit}>
          {busy ? "Posting…" : "Submit review"}
        </button>
      </p>
    </div>
  );
}
