import { useEffect, useState } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Food Waste Saver</div>
        <span className="chip">Team HA040</span>
      </header>

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
    </div>
  );
}

export default App;
