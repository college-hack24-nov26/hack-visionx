import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import NotificationsBell from './NotificationsBell';

export default function Nav() {
  const { user, loading, logout, switchRole } = useAuth();
  const { lang, setLang, t } = useLanguage();
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
        <Link to="/" className="nav-link">{t('navHome')}</Link>
        <Link to="/browse" className="nav-link">{t('navBrowse')}</Link>
        <Link to="/faq" className="nav-link">{t('navFaq')}</Link>
        <div className="lang-switch" aria-label="Language">
          <button type="button" className={lang === 'en' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('en')}>EN</button>
          <button type="button" className={lang === 'mr' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('mr')}>मराठी</button>
          <button type="button" className={lang === 'hi' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('hi')}>हिंदी</button>
        </div>
        {!loading && !user && (
          <>
            <Link to="/login" className="btn btn-ghost">{t('navLogin')}</Link>
            <Link to="/register" className="btn btn-primary">{t('navRegister')}</Link>
          </>
        )}
        {!loading && user && (
          <>
            {(user.accountType !== 'USER' || user.activeRole === 'CLAIMER') && (
              <Link to="/my-claims" className="nav-link">{t('navMyClaims')}</Link>
            )}
            {user.activeRole === 'PROVIDER' && (
              <Link to="/my-listings" className="nav-link">{t('navMyListings')}</Link>
            )}
            {user.accountType === 'NGO' && (
              <Link to="/ngo" className="nav-link">{t('navNgoPanel')}</Link>
            )}
            {user.accountType === 'ADMIN' && (
              <Link to="/admin" className="nav-link">{t('navAdmin')}</Link>
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
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              {t('navLogout')}
            </button>
          </>
        )}
      </nav>
      {error && <p className="nav-error">{error}</p>}
    </header>
  );
}
