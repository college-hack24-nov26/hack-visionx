import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { starsText } from "../components/ReviewForm";

export default function UserProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let on = true;
    api(`/api/reviews/user/${id}`).then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setData(data);
      else setError(data.error || "Could not load this profile");
    });
    return () => { on = false; };
  }, [id]);

  if (error) {
    return (
      <main>
        <section className="card">
          <div className="form-error">{error}</div>
          <p><Link to="/browse">← Back to browse</Link></p>
        </section>
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <section className="card"><p>Loading…</p></section>
      </main>
    );
  }

  const u = data.user;
  return (
    <main>
      <section className="card">
        <h1>{u.orgName || u.name}</h1>
        <p className="admin-meta">
          {u.accountType}
          {u.orgName ? ` · ${u.name}` : ""}
        </p>
        {data.count === 0 ? (
          <p>No reviews yet.</p>
        ) : (
          <>
            <p className="review-average">
              <span className="review-stars">{starsText(data.average)}</span>{" "}
              <strong>{data.average}</strong> · {data.count}{" "}
              {data.count === 1 ? "review" : "reviews"}
            </p>
            <div className="review-list">
              {data.reviews.map((r, i) => (
                <div key={i} className="review-item">
                  <p>
                    <span className="review-stars">{starsText(r.stars)}</span>{" "}
                    <strong>{r.reviewerName}</strong>{" "}
                    <span className="admin-meta">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </p>
                  {r.text && <p>{r.text}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
