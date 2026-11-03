import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Nav from './components/Nav';
import Login from './pages/Login';
import Register from './pages/Register';
import Browse from './pages/Browse';
import ListingDetail from './pages/ListingDetail';
import MyListings from './pages/MyListings';
import ListingForm from './pages/ListingForm';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function Home() {
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setFailed(true));
  }, []);

  return (
    <main>
      <section className="hero">
        <h1>Good food should never go to waste.</h1>
        <p>
          Food Waste Saver connects people who have surplus food with people
          and NGOs nearby who can use it — before it expires.
        </p>
        <Link className="btn" to="/browse">Browse surplus food</Link>
      </section>

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
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
