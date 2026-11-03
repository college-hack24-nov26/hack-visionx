import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import Nav from './components/Nav';
import Login from './pages/Login';
import Register from './pages/Register';
import Browse from './pages/Browse';
import ListingDetail from './pages/ListingDetail';
import MyListings from './pages/MyListings';
import ListingForm from './pages/ListingForm';
import MyClaims from './pages/MyClaims';
import Admin from './pages/Admin';
import Faq from './pages/Faq';
import NgoPanel from './pages/NgoPanel';
import Profile from './pages/Profile';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function Home() {
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/impact`)
      .then((res) => res.json())
      .then((data) => setImpact(data.impact || null))
      .catch(() => setImpact(null));
  }, []);

  const stats = impact
    ? [
        { label: 'Portions rescued', value: impact.portionsRescued },
        { label: 'Pickups completed', value: impact.pickupsCompleted },
        { label: 'Listings shared', value: impact.listingsShared },
        { label: 'Donors', value: impact.donors },
        { label: 'People helped', value: impact.peopleHelped },
        { label: 'Live now', value: impact.liveNow },
      ]
    : [];

  return (
    <main>
      <section className="hero">
        <h1>Good food should never go to waste.</h1>
        <p>
          Food Waste Saver connects homes, hotels and events that have extra food
          with nearby people and NGOs who can use it - before it expires.
        </p>
        <div className="hero-actions">
          <Link className="btn" to="/listings/new">Post surplus food</Link>
          <Link className="btn btn-ghost" to="/browse">Browse food</Link>
        </div>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="steps">
          <li><strong>Post it</strong> - A donor adds the food, portions, pickup place and a deadline within 24 hours.</li>
          <li><strong>Claim it</strong> - A nearby person or NGO claims the portions they can collect and gets a secret pickup code.</li>
          <li><strong>Pick it up</strong> - The donor checks the code, the food is collected, and nothing goes to waste.</li>
        </ol>
        <p>Every donor must tick a food-safety checklist before posting, and every listing shows its deadline clearly.</p>
      </section>

      {impact && (
        <section className="card">
          <h2>Impact Wall</h2>
          <p>Every collected portion is counted on our Impact Wall, so the whole community can see how much food was saved together.</p>
          <div className="impact-grid">
            {stats.map((s) => (
              <div key={s.label} className="stat-card">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>System status</h2>
        {failed && <p className="bad">Backend unreachable — is the server running?</p>}
        {!failed && !health && <p>Checking…</p>}
        {health && (
          <p className="ok">
            Backend: <strong>{health.service}</strong> · Database:{' '}
            <strong>{health.database}</strong> · Registered users:{' '}
            <strong>{health.users}</strong>
          </p>
        )}
      </section>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider> 
        <AuthProvider>
        <div className="page">
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/browse/:id" element={<ListingDetail />} />
            <Route path="/my-listings" element={<MyListings />} />
            <Route path="/listings/new" element={<ListingForm />} />
            <Route path="/listings/:id/edit" element={<ListingForm />} />
            <Route path="/my-claims" element={<MyClaims />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/ngo" element={<NgoPanel />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </AuthProvider>
        </LanguageProvider>

    </BrowserRouter>
  );
}

export default App;
