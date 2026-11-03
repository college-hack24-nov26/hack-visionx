import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

export default function Register() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState('USER');
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '',
    orgName: '', orgRegNo: '', orgAddress: '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((err) => ({ ...err, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({}); setError(''); setMessage('');
    setSubmitting(true);
    const payload = {
      name: form.name.trim(), email: form.email.trim(),
      mobile: form.mobile.trim(), password: form.password, accountType,
    };
    const inviteCode = sessionStorage.getItem('fws_invite');
    if (inviteCode) payload.inviteCode = inviteCode;
    if (accountType === 'NGO') {
      payload.orgName = form.orgName.trim();
      payload.orgRegNo = form.orgRegNo.trim();
      payload.orgAddress = form.orgAddress.trim();
    }
    const result = await register(payload);
    setSubmitting(false);
    if (result.ok) { sessionStorage.removeItem('fws_invite'); navigate('/'); }
    else if (result.duplicate) setMessage(result.message);
    else if (result.errors) setErrors(result.errors);
    else setError(result.error || t('authRegisterFailed'));
  }

  function field(name, label, props = {}) {
    return (
      <div className="field">
        <label htmlFor={`reg-${name}`}>{label}</label>
        <input id={`reg-${name}`} value={form[name]}
          onChange={(e) => setField(name, e.target.value)} {...props} />
        {errors[name] && <p className="field-error">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{t('navRegister')}</h1>
        <p className="auth-sub">{t('authRegisterSub')}</p>

        <div className="toggle-row">
          <div className="role-toggle" aria-label="Account type">
            <button type="button" className={accountType === 'USER' ? 'role-btn active' : 'role-btn'}
              onClick={() => setAccountType('USER')}>{t('authUser')}</button>
            <button type="button" className={accountType === 'NGO' ? 'role-btn active' : 'role-btn'}
              onClick={() => setAccountType('NGO')}>NGO</button>
          </div>
        </div>

        {message && (
          <div className="notice">
            <p>{message}</p>
            <p><Link to="/login">{t('authTryLoggingIn')}</Link></p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {field('name', t('authName'), { type: 'text', autoComplete: 'name', required: true })}
          {field('email', t('authEmail'), { type: 'email', autoComplete: 'email', required: true })}
          {field('mobile', t('authMobileShort'), { type: 'tel', autoComplete: 'tel', required: true })}
          {field('password', t('authPassword'), { type: 'password', autoComplete: 'new-password', required: true })}
          {accountType === 'NGO' && (
            <>
              {field('orgName', t('authOrgName'), { type: 'text', autoComplete: 'organization', required: true })}
              {field('orgRegNo', t('authOrgRegNo'), { type: 'text' })}
              {field('orgAddress', t('authOrgAddress'), { type: 'text' })}
            </>
          )}
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t('authRegistering') : t('navRegister')}
          </button>
        </form>
        <p className="auth-alt">{t('authHaveAccount')} <Link to="/login">{t('navLogin')}</Link></p>
      </section>
    </main>
  );
}
