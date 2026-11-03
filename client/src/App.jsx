import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import Nav from './components/Nav';
import InviteBanner from './components/InviteBanner';
import ListingCard from './components/ListingCard';
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
import UserProfile from './pages/UserProfile';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function Home() {
  const { t } = useLanguage();
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);
  const [impact, setImpact] = useState(null);
  const [live, setLive] = useState(null);
  const [now, setNow] = useState(Date.now());

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

  useEffect(() => {
    fetch(`${API_URL}/api/browse`)
      .then((res) => res.json())
      .then((data) => setLive(data.listings || []))
      .catch(() => setLive(null));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const stats = impact
    ? [
        { label: t('homeStatPortionsRescued'), value: impact.portionsRescued },
        { label: t('homeStatPickupsCompleted'), value: impact.pickupsCompleted },
        { label: t('homeStatListingsShared'), value: impact.listingsShared },
        { label: t('homeStatDonors'), value: impact.donors },
        { label: t('homeStatPeopleHelped'), value: impact.peopleHelped },
        { label: t('homeStatLiveNow'), value: impact.liveNow },
      ]
    : [];

  return (
    <main>
      <section className="hero">
        <h1>{t('homeHeroTitle')}</h1>
        <p>{t('homeHeroSub')}</p>
        <div className="hero-actions">
          <Link className="btn" to="/listings/new">{t('navPostFood')}</Link>
          <Link className="btn btn-ghost" to="/browse">{t('homeBrowseBtn')}</Link>
        </div>
      </section>

      {live && (
        <section className="card">
          <h2>{t('homeStatLiveNow')}</h2>
          {live.length === 0 ? (
            <p>{t('homeLiveEmpty')}</p>
          ) : (
            <div className="cards-grid">
              {live.slice(0, 6).map((l) => (
                <ListingCard key={l.id} listing={l} now={now} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>{t('homeHowItWorks')}</h2>
        <ol className="steps">
          <li><strong>{t('homeStep1Title')}</strong> - {t('homeStep1Text')}</li>
          <li><strong>{t('homeStep2Title')}</strong> - {t('homeStep2Text')}</li>
          <li><strong>{t('homeStep3Title')}</strong> - {t('homeStep3Text')}</li>
        </ol>
        <p>{t('homeSafetyLine')}</p>
      </section>

      {impact && (
        <section className="card">
          <h2>{t('homeImpactWall')}</h2>
          <p>{t('homeImpactLine')}</p>
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
          <InviteBanner />
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
            <Route path="/users/:id" element={<UserProfile />} />
          </Routes>
        </div>
      </AuthProvider>
        </LanguageProvider>

    </BrowserRouter>
  );
}

export default App;
