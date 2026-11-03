import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

export default function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (result.ok) navigate('/');
    else setError(result.error || t('authLoginFailed'));
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{t('navLogin')}</h1>
        <p className="auth-sub">{t('authWelcomeBack')}</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-email">{t('authEmail')}</label>
            <input id="login-email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t('authPassword')}</label>
            <input id="login-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t('authLoggingIn') : t('navLogin')}
          </button>
        </form>
        <p className="auth-alt">{t('authNewHere')} <Link to="/register">{t('navRegister')}</Link></p>
      </section>
    </main>
  );
}
