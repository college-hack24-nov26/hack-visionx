import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Nav from './components/Nav';
import Login from './pages/Login';
import Register from './pages/Register';
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
        <button className="btn" type="button">Browse surplus food</button>
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
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
