import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useSavedLocation } from '../context/LocationContext';
import { API_BASE } from '../lib/api';
import NotificationsBell from './NotificationsBell';
import LocationPrompt from './LocationPrompt';

const LANG_ORDER = ['en', 'mr', 'hi'];
const LANG_NAMES = { en: 'English', mr: 'मराठी', hi: 'हिंदी' };

export default function Nav() {
  const { user, loading, logout, switchRole } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const { saved, setPromptOpen } = useSavedLocation();
  const navigate = useNavigate();
  const location = useLocation();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the profile menu whenever the page changes.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  async function handleLogout() {
    setMenuOpen(false);
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

  const isAdmin = !!user && user.accountType === 'ADMIN';
  const canClaim = !!user && !isAdmin && (user.accountType === 'NGO' || (user.accountType === 'USER' && user.activeRole === 'CLAIMER'));

  return (
    <>
      <header className="nav">
        <div className="nav-top">
          <Link to="/" className="nav-brand" aria-label="Food Waste Saver - home"><img className="brand-logo" src="/logo.png" alt="" /><span className="brand-name">Food Waste Saver</span></Link>
          <div className="nav-actions">
            <button type="button" className="chip loc-chip" onClick={() => setPromptOpen(true)}>
              <svg className="loc-icon" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg> <span className="loc-label">{saved ? (saved.label || 'Location set') : 'Set location'}</span>
            </button>
            {!loading && !user && (
              <>
                <Link to="/login" className="btn btn-ghost">{t('navLogin')}</Link>
                <Link to="/register" className="btn btn-primary">{t('navRegister')}</Link>
              </>
            )}
            {!loading && user && (
              <>
                <NotificationsBell />
                <button
                  type="button"
                  className="avatar-btn"
                  aria-label="My menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  {user.profilePhotoUrl ? (
                    <img className="nav-avatar" src={API_BASE + user.profilePhotoUrl} alt="" />
                  ) : (
                    <span className="nav-avatar nav-avatar-initial">{(user.name || '?').trim().charAt(0).toUpperCase()}</span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="nav-sub">
          <Link to="/" className="nav-link">{t('navHome')}</Link>
          <Link to="/browse" className="nav-link">{t('navBrowse')}</Link>
          {user && user.activeRole === 'PROVIDER' && (
            <Link to="/listings/new" className="nav-link nav-link-accent">{t('navPostFood')}</Link>
          )}
        </nav>
        {menuOpen && user && (
          <>
            <div className="nav-menu-overlay" onClick={() => setMenuOpen(false)} />
            <div className="nav-menu">
              <div className="nav-menu-head">
                {user.profilePhotoUrl ? (
                  <img className="nav-avatar" src={API_BASE + user.profilePhotoUrl} alt="" />
                ) : (
                  <span className="nav-avatar nav-avatar-initial">{(user.name || '?').trim().charAt(0).toUpperCase()}</span>
                )}
                <div className="nav-menu-id">
                  <strong>{user.name}</strong>
                  <span className="chip">{user.accountType === 'USER' ? user.activeRole : user.accountType}</span>
                </div>
              </div>
              <Link to="/profile" className="nav-menu-item">{t('navProfile')}</Link>
              {user.activeRole === 'PROVIDER' && (
                <Link to="/my-listings" className="nav-menu-item">{t('navMyListings')}</Link>
              )}
              {canClaim && (
                <Link to="/my-claims" className="nav-menu-item">{t('navMyClaims')}</Link>
              )}
              {user.accountType === 'NGO' && (
                <Link to="/ngo" className="nav-menu-item">{t('navNgoPanel')}</Link>
              )}
              {isAdmin && (
                <Link to="/admin" className="nav-menu-item">{t('navAdmin')}</Link>
              )}
              <div className="nav-menu-lang">
                <span className="nav-menu-label">🌐 Language</span>
                <div className="lang-row">
                  {LANG_ORDER.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={lang === code ? 'lang-pill active' : 'lang-pill'}
                      onClick={() => setLang(code)}
                    >
                      {LANG_NAMES[code]}
                    </button>
                  ))}
                </div>
              </div>
              {user.accountType === 'USER' && (
                <div className="nav-menu-roles" aria-label="Active role">
                  <button
                    type="button"
                    className={user.activeRole === 'CLAIMER' ? 'role-btn active' : 'role-btn'}
                    disabled={switching}
                    onClick={() => handleSwitch('CLAIMER')}
                  >
                    {t('roleClaimer')}
                  </button>
                  <button
                    type="button"
                    className={user.activeRole === 'PROVIDER' ? 'role-btn active' : 'role-btn'}
                    disabled={switching}
                    onClick={() => handleSwitch('PROVIDER')}
                  >
                    {t('roleDonor')}
                  </button>
                </div>
              )}
              <button type="button" className="nav-menu-item nav-menu-logout" onClick={handleLogout}>
                {t('navLogout')}
              </button>
            </div>
          </>
        )}
        {error && <p className="nav-error">{error}</p>}
      </header>
      <LocationPrompt />
    </>
  );
}
