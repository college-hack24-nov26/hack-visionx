import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import ListingCard from "../components/ListingCard";
import { CATEGORIES } from "../lib/format";

const VEG_SET = new Set(["VEG", "VEGAN"]);

export default function Browse() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [diet, setDiet] = useState("ALL");
  const [sort, setSort] = useState("TIME_ASC");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let on = true;
    api("/api/browse").then(({ status, data }) => {
      if (!on) return;
      if (status === 200) setListings(data.listings || []);
      else setError(data.error || "Could not load listings");
      setLoading(false);
    });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(() => {
    const out = listings.filter((l) => {
      const hay = `${l.foodName} ${l.details || ""}`.toLowerCase();
      if (q && !hay.includes(q.trim().toLowerCase())) return false;
      if (cat !== "ALL" && l.category !== cat) return false;
      if (diet !== "ALL" && l.dietaryType !== diet) return false;
      return true;
    });
    const byTime = (a, b) => new Date(a.deadline) - new Date(b.deadline);
    if (sort === "TIME_ASC") out.sort(byTime);
    else if (sort === "TIME_DESC") out.sort((a, b) => -byTime(a, b));
    else if (sort === "VEG_FIRST")
      out.sort((a, b) => (VEG_SET.has(b.dietaryType) ? 1 : 0) - (VEG_SET.has(a.dietaryType) ? 1 : 0) || byTime(a, b));
    else if (sort === "NONVEG_FIRST")
      out.sort((a, b) => (a.dietaryType === "NON_VEG" ? 0 : 1) - (b.dietaryType === "NON_VEG" ? 0 : 1) || byTime(a, b));
    return out;
  }, [listings, q, cat, diet, sort]);

  return (
    <section className="browse-page">
      <h1>Browse surplus food</h1>
      <div className="controls">
        <input className="control-input" type="search" placeholder="Search food…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="control-input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {Object.entries(CATEGORIES).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select className="control-input" value={diet} onChange={(e) => setDiet(e.target.value)}>
          <option value="ALL">Veg & non-veg</option>
          <option value="VEG">Veg</option>
          <option value="VEGAN">Vegan</option>
          <option value="NON_VEG">Non-veg</option>
        </select>
        <select className="control-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="TIME_ASC">Time left: low to high</option>
          <option value="TIME_DESC">Time left: high to low</option>
          <option value="VEG_FIRST">Vegetarian first</option>
          <option value="NONVEG_FIRST">Non-vegetarian first</option>
        </select>
      </div>

      {loading && <p>Loading listings…</p>}
      {!loading && error && <div className="form-error">{error}</div>}
      {!loading && !error && listings.length === 0 && <p>No food listed yet — check back soon.</p>}
      {!loading && !error && listings.length > 0 && shown.length === 0 && <p>No listings match your search or filters.</p>}
      <div className="cards-grid">
        {shown.map((l) => (
          <ListingCard key={l.id} listing={l} now={now} />
        ))}
      </div>
    </section>
  );
}
