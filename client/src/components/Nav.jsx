import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationsBell from './NotificationsBell';

export default function Nav() {
  const { user, loading, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  async function handleSwitch(role) {
    if (!user || user.activeRole === role || switching) return;
    setSwitching(true);
    setError('');
    const result = await switchRole(role);
    if (!result.ok) setError(result.error || 'Could not switch role');
    setSwitching(false);
  }

  return (
    <header className="nav">
      <Link to="/" className="nav-brand">Food Waste Saver</Link>
      <nav className="nav-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/browse" className="nav-link">Browse</Link>
        {!loading && !user && (
          <>
            <Link to="/login" className="btn btn-ghost">Login</Link>
            <Link to="/register" className="btn btn-primary">Register</Link>
          </>
        )}
        {!loading && user && (
          <>
            {(user.accountType !== 'USER' || user.activeRole === 'CLAIMER') && (
              <Link to="/my-claims" className="nav-link">My Claims</Link>
            )}
            {user.activeRole === 'PROVIDER' && (
              <Link to="/my-listings" className="nav-link">My Listings</Link>
            )}
            {user.accountType === 'ADMIN' && (
              <Link to="/admin" className="nav-link">Admin</Link>
            )}
            <NotificationsBell />
            <span className="nav-user">{user.name}</span>
            {user.accountType !== 'USER' && (
              <span className="chip">{user.accountType}</span>
            )}
            {user.accountType === 'USER' && (
              <div className="role-toggle" aria-label="Active role">
                <button
                  type="button"
                  className={user.activeRole === 'CLAIMER' ? 'role-btn active' : 'role-btn'}
                  disabled={switching}
                  onClick={() => handleSwitch('CLAIMER')}
                >
                  Claimer
                </button>
                <button
                  type="button"
                  className={user.activeRole === 'PROVIDER' ? 'role-btn active' : 'role-btn'}
                  disabled={switching}
                  onClick={() => handleSwitch('PROVIDER')}
                >
                  Donor
                </button>
              </div>
            )}
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Logout
            </button>
          </>
        )}
      </nav>
      {error && <p className="nav-error">{error}</p>}
    </header>
  );
}
