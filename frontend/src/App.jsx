import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  IonApp, IonButton, IonIcon, IonInput, IonModal, IonSelect,
  IonSelectOption, IonSpinner, IonToast, setupIonicReact,
} from '@ionic/react';
import {
  addOutline, arrowUpOutline, bulbOutline, calendarClearOutline, checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline, closeOutline, createOutline, flashOutline, gridOutline, homeOutline, logOutOutline, logoGithub, logoGoogle, menuOutline, moonOutline, playOutline, pulseOutline, searchOutline, settingsOutline, sparklesOutline, sunnyOutline, timeOutline, trashOutline, trendingDownOutline, waterOutline
} from 'ionicons/icons';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import LandingPage from './LandingPage.jsx';
import { fmtKwh, fmtMoney, request } from './api.js';

setupIonicReact();

const NAV = [
  { id: 'overview', label: 'Home', mobileLabel: 'Home', icon: gridOutline },
  { id: 'appliances', label: 'Appliances', mobileLabel: 'Appliances', icon: flashOutline },
  { id: 'history', label: 'Usage & Bills', mobileLabel: 'Usage', icon: pulseOutline },
  { id: 'insights', label: 'Energy Tips', mobileLabel: 'Insights', icon: sparklesOutline },
  { id: 'scenarios', label: 'What-if Planner', mobileLabel: 'Planner', icon: bulbOutline },
  { id: 'settings', label: 'Account settings', mobileLabel: 'Account', icon: settingsOutline },
];
const CATEGORIES = ['Cooling', 'Kitchen', 'Laundry', 'Lighting', 'Electronics', 'Water heating', 'Other'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIOD = new Date().toISOString().slice(0, 7);
const PERIOD_LABEL = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
const OAUTH_ERRORS = {
  account_exists: 'An account with this email already exists. Sign in with that account, then connect this provider in Account settings.',
  provider_already_linked: 'This provider is already connected to another Energeia account.',
  account_conflict: 'That provider sign-in is already in use. Sign in to the existing account or contact support.',
  sign_in_cancelled: 'Sign-in was cancelled.',
  expired_state: 'The sign-in request expired. Please try again.',
  invalid_state: 'The sign-in response could not be verified. Please try again.',
  provider_failure: 'The provider could not complete sign-in. Check your verified provider email and try again.',
};

let googleLoginInitialization;

async function nativeGoogleSignIn({ linking = false } = {}) {
  const endpoint = linking ? '/auth/providers/google/native' : '/auth/oauth/google/native';
  const { web_client_id: webClientId, nonce } = await request(`${endpoint}/start`, { method: 'POST' });
  if (!googleLoginInitialization) {
    googleLoginInitialization = SocialLogin.initialize({
      google: { webClientId, mode: 'online' },
    }).catch((exception) => {
      googleLoginInitialization = undefined;
      throw exception;
    });
  }
  await googleLoginInitialization;
  const response = await SocialLogin.login({
    provider: 'google',
    options: {
      nonce,
      style: 'bottom',
      autoSelectEnabled: false,
      filterByAuthorizedAccounts: false,
    },
  });
  const loginResult = response?.result ?? response;
  if (loginResult?.responseType !== 'online' || !loginResult?.idToken) {
    throw new Error('Google did not return a sign-in token. Please try again.');
  }
  return request(`${endpoint}/complete`, {
    method: 'POST',
    body: { id_token: loginResult.idToken, nonce },
  });
}

function Logo({ small = false }) {
  return (
    <div className={`brand${small ? ' brand-small' : ''}`}>
      <img className="brand-image" src="/energeia-logo.png" alt="" aria-hidden="true" />
      <span>energeia<span className="brand-dot">.</span></span>
    </div>
  );
}

function UsageChart({ bars }) {
  const max = Math.max(1, ...bars.map((bar) => Number(bar.kwh)));
  return <article className="chart-card usage-estimates">
    <h2>A week in your home</h2>
    <p>Estimated daily energy from active schedules · kWh</p>
    {bars.some((bar) => Number(bar.kwh) > 0) ? <div className="estimate-bars" role="list" aria-label="Estimated usage by weekday">
      {bars.map((bar) => <div key={bar.day} role="listitem" className="estimate-day">
        <span>{fmtKwh(bar.kwh)}</span>
        <div className="estimate-track"><div style={{ height: `${Number(bar.kwh) / max * 100}%` }} /></div>
        <strong>{bar.day}</strong>
      </div>)}
    </div> : <p className="empty-inline">Add an active appliance schedule to see your weekly estimate.</p>}
  </article>;
}

function ThemeToggle({ darkMode, onToggle }) {
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
      title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
      aria-pressed={darkMode}
      onClick={onToggle}
    >
      <IonIcon aria-hidden="true" icon={darkMode ? sunnyOutline : moonOutline} />
    </button>
  );
}

function AuthScreen({ onLogin, darkMode, onToggleTheme, oauthError, resetToken, authMessage }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = pathname === '/reset-password' ? 'reset' : pathname === '/register' ? 'register' : pathname === '/forgot-password' ? 'forgot' : 'login';
  const [registrationStep, setRegistrationStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState({
    first_name: '', middle_name: '', last_name: '', email: '', password: '',
    password_confirmation: '', country: '', region: '', city: '', barangay: '',
    street_address: '', unit_number: '', postal_code: '', phone_number: '',
    terms_accepted: false,
  });
  const registering = view === 'register';

  function updateCredential(event) {
    const field = event.currentTarget.name;
    const value = event.detail?.value ?? '';
    setCredentials((previous) => ({ ...previous, [field]: value }));
  }

  async function beginOAuth(provider) {
    setOAuthProvider(provider);
    setLoading(true);
    setError('');
    try {
      if (provider === 'google' && Capacitor.getPlatform() === 'android') {
        try {
          const result = await nativeGoogleSignIn();
          localStorage.setItem('energeia_token', result.access_token);
          onLogin(result.user);
          return;
        } catch (exception) {
          if (exception.message !== 'Google did not return a sign-in token. Please try again.') throw exception;
          // The native Credential Manager can return no ID token when the
          // installed APK's package/SHA-1 is not yet registered with Google.
          // Keep sign-in usable through the configured OAuth web client.
          const fallback = await request('/auth/oauth/google/start?native_app=true', { method: 'POST' });
          window.location.assign(fallback.authorization_url);
          return;
        }
      }
      const nativeQuery = Capacitor.isNativePlatform() ? '?native_app=true' : '';
      const result = await request(`/auth/oauth/${provider}/start${nativeQuery}`, { method: 'POST' });
      window.location.assign(result.authorization_url);
    } catch (exception) {
      setError(exception.message);
      setOAuthProvider('');
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (registering && registrationStep === 1) {
      if (credentials.password !== credentials.password_confirmation) {
        setError('Passwords do not match.');
        return;
      }
      setError('');
      setRegistrationStep(2);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (view === 'forgot') {
        const result = await request('/auth/password-reset/request', {
          method: 'POST',
          body: { email: credentials.email },
        });
        setSuccess(result.message);
      } else if (view === 'reset') {
        const result = await request('/auth/password-reset/complete', {
          method: 'POST',
          body: {
            token: resetToken,
            password: credentials.password,
            password_confirmation: credentials.password_confirmation,
          },
        });
        setSuccess(result.message);
        navigate('/login', { replace: true });
      } else {
        const result = await request(`/auth/${registering ? 'register' : 'login'}`, {
          method: 'POST',
          body: registering ? credentials : {
            email: credentials.email,
            password: credentials.password,
          },
        });
        localStorage.setItem('energeia_token', result.access_token);
        onLogin(result.user);
      }
    } catch (exception) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  const title = {
    login: 'Welcome back',
    register: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[view];

  function changeView(nextView) {
    navigate(nextView === 'register' ? '/register' : nextView === 'forgot' ? '/forgot-password' : '/login');
    setRegistrationStep(1);
    setError('');
    setSuccess('');
  }

  return (
    <main className="auth-page">
      <div className="auth-left">
        <Link to="/" aria-label="Energeia home"><Logo /></Link>
        <div className="auth-pitch"><span className="eyebrow">A little clarity. A better energy habit.</span><h1>Know your home.<br />Understand your energy.</h1><p>Turn appliance schedules into useful estimates, and explore changes at your own pace.</p></div>
      </div>
      <div className="auth-right">
        <form className={`auth-card auth-card-${view}`} onSubmit={submit}>
          <div className="auth-mini"><Link to="/" aria-label="Energeia home"><Logo small /></Link><ThemeToggle darkMode={darkMode} onToggle={onToggleTheme} /></div>
          <div className="auth-welcome"><h1>{title}</h1></div>
          {!['forgot', 'reset'].includes(view) && <>
            <button className="social-auth-button" type="button" onClick={() => beginOAuth('google')} disabled={loading}>
              {oauthProvider === 'google' ? <IonSpinner aria-hidden="true" name="crescent" /> : <IonIcon aria-hidden="true" icon={logoGoogle} />} {oauthProvider === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
            <button className="social-auth-button" type="button" onClick={() => beginOAuth('github')} disabled={loading}>
              {oauthProvider === 'github' ? <IonSpinner aria-hidden="true" name="crescent" /> : <IonIcon aria-hidden="true" icon={logoGithub} />} {oauthProvider === 'github' ? 'Connecting to GitHub…' : 'Continue with GitHub'}
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>}
          {registering && registrationStep === 2 && <div className="auth-progress" aria-label="Registration step 2 of 2">Step 2 of 2 · Home address</div>}
          {registering && registrationStep === 1 && <div className="auth-form-grid">
            <label className="field-label">First name<IonInput aria-label="First name" className="form-input" name="first_name" autocomplete="given-name" value={credentials.first_name} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Last name<IonInput aria-label="Last name" className="form-input" name="last_name" autocomplete="family-name" value={credentials.last_name} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Middle name <span className="field-hint">Optional</span><IonInput aria-label="Middle name" className="form-input" name="middle_name" autocomplete="additional-name" value={credentials.middle_name} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label">Email address<IonInput aria-label="Email" className="form-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>
            <label className="field-label">Password<div className="password-input-wrap"><IonInput aria-label="Password" className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password} onIonInput={updateCredential} required minlength={8} maxlength={128} /><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <label className="field-label">Confirm password<IonInput aria-label="Password confirmation" className="form-input" name="password_confirmation" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password_confirmation} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
          </div>}
          {registering && registrationStep === 2 && <div className="auth-form-grid">
            <label className="field-label">Country<IonInput aria-label="Country" className="form-input" name="country" autocomplete="country-name" value={credentials.country} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Province / State / Region<IonInput aria-label="Region" className="form-input" name="region" autocomplete="address-level1" value={credentials.region} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">City / Municipality<IonInput aria-label="City" className="form-input" name="city" autocomplete="address-level2" value={credentials.city} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Barangay <span className="field-hint">Optional</span><IonInput aria-label="Barangay" className="form-input" name="barangay" value={credentials.barangay} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label auth-grid-full">Street address<IonInput aria-label="Street address" className="form-input" name="street_address" autocomplete="street-address" value={credentials.street_address} onIonInput={updateCredential} required maxlength={255} /></label>
            <label className="field-label">House / Unit <span className="field-hint">Optional</span><IonInput aria-label="Unit number" className="form-input" name="unit_number" value={credentials.unit_number} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label">Postal code <span className="field-hint">Optional</span><IonInput aria-label="Postal code" className="form-input" name="postal_code" autocomplete="postal-code" value={credentials.postal_code} onIonInput={updateCredential} maxlength={32} /></label>
            <label className="field-label">Phone number <span className="field-hint">Optional</span><IonInput aria-label="Phone number" className="form-input" name="phone_number" type="tel" autocomplete="tel" value={credentials.phone_number} onIonInput={updateCredential} maxlength={32} /></label>
            <label className="consent-field auth-grid-full"><input type="checkbox" name="terms_accepted" checked={credentials.terms_accepted} onChange={(event) => setCredentials((previous) => ({ ...previous, terms_accepted: event.target.checked }))} required /><span>I agree to the Terms of Service and Privacy Policy.</span></label>
            <p className="address-privacy-note auth-grid-full">Your home location helps personalize household energy settings. Your full address is private and is not shown on the dashboard.</p>
          </div>}
          {view === 'login' && <>
            <label className="field-label">Email address<IonInput aria-label="Email" className="form-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>
            <label className="field-label">Password<div className="password-input-wrap"><IonInput aria-label="Password" className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" value={credentials.password} onIonInput={updateCredential} required maxlength={128} /><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <button className="forgot-password-link" type="button" onClick={() => changeView('forgot')}>Forgot password?</button>
          </>}
          {view === 'forgot' && <label className="field-label">Email address<IonInput aria-label="Email" className="form-input" name="email" type="email" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>}
          {view === 'reset' && <>
            {!resetToken && <p role="alert" className="inline-error">This reset link is missing or expired. Request a new password reset email.</p>}
            <label className="field-label">New password<IonInput aria-label="Password" className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
            <label className="field-label">Confirm new password<IonInput aria-label="Password confirmation" className="form-input" name="password_confirmation" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password_confirmation} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
          </>}
          {authMessage && <p className="form-note" role="status">{authMessage}</p>}
          {oauthError && <div className="inline-error" role="alert">{oauthError}</div>}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {success && <div className="form-note" role="status">{success}</div>}
          {registering && registrationStep === 2 && <button className="text-button auth-back" type="button" onClick={() => setRegistrationStep(1)}>Back to personal information</button>}
          <IonButton type="submit" expand="block" className="primary-button auth-submit" disabled={loading || (view === 'reset' && !resetToken)}>
            {loading ? <IonSpinner aria-label="Loading" name="crescent" /> : <>{registering ? (registrationStep === 1 ? 'Continue' : 'Create Account') : view === 'login' ? 'Sign In' : view === 'forgot' ? 'Send reset link' : 'Update password'} <IonIcon aria-hidden="true" icon={chevronForwardOutline} slot="end" /></>}
          </IonButton>
          {view === 'login' || registering ? <p className="auth-switch">{registering ? 'Already have an account?' : "Don't have an account?"} <button className="text-button" type="button" onClick={() => changeView(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Sign up'}</button></p> : <p className="auth-switch"><button className="text-button" type="button" onClick={() => changeView('login')}>Back to sign in</button></p>}
        </form>
      </div>
    </main>
  );
}

function Modal({ isOpen, onClose, title, subtitle, children, wide = false }) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setKeyboardOffset(0);
      return undefined;
    }

    const viewport = window.visualViewport;
    const updateKeyboardOffset = () => {
      if (!viewport) return;
      const visibleBottom = viewport.height + viewport.offsetTop;
      setKeyboardOffset(Math.max(0, Math.round(window.innerHeight - visibleBottom)));
    };

    updateKeyboardOffset();
    viewport?.addEventListener('resize', updateKeyboardOffset);
    viewport?.addEventListener('scroll', updateKeyboardOffset);
    return () => {
      viewport?.removeEventListener('resize', updateKeyboardOffset);
      viewport?.removeEventListener('scroll', updateKeyboardOffset);
    };
  }, [isOpen]);

  return <IonModal
    isOpen={isOpen}
    onDidDismiss={onClose}
    aria-label={title}
    className={wide ? 'app-modal app-modal-wide' : 'app-modal'}
    style={{ '--app-keyboard-offset': `${keyboardOffset}px` }}
  >
    <div className="modal-body"><header className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><IonIcon aria-hidden="true" icon={closeOutline} /></button></header>{children}</div>
  </IonModal>;
}

function ModalForm({ children, onSubmit, button, note, busy, error }) {
  return (
    <form className="modal-form" onSubmit={onSubmit}>{children}{error && <div className="inline-error" role="alert">{error}</div>}
      {note && <div className="form-note"><IonIcon aria-hidden="true" icon={checkmarkCircleOutline} /> {note}</div>}
      <IonButton expand="block" type="submit" className="primary-button" disabled={busy}>{busy ? <IonSpinner aria-label="Loading" name="crescent" /> : <>{button}<IonIcon aria-hidden="true" icon={chevronForwardOutline} slot="end" /></>}</IonButton>
    </form>
  );
}

function Field({ label, children, hint }) {
  return <label className="field-label">{label}{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function ProfileEditor({ user, onSave, saving, error, showConsent = false }) {
  const [profile, setProfile] = useState(() => ({
    first_name: user.first_name || '',
    middle_name: user.middle_name || '',
    last_name: user.last_name || '',
    country: user.country || '',
    region: user.region || '',
    city: user.city || '',
    barangay: user.barangay || '',
    street_address: user.street_address || '',
    unit_number: user.unit_number || '',
    postal_code: user.postal_code || '',
    phone_number: user.phone_number || '',
    terms_accepted: Boolean(user.terms_accepted),
  }));

  function update(event) {
    const { name, value, checked, type } = event.currentTarget;
    setProfile((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : event.detail?.value ?? value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    try {
      await onSave(profile);
    } catch {
      // The parent keeps the API error visible on the form.
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="profile-form-grid">
        <Field label="First name"><IonInput aria-label="First name" className="form-input" name="first_name" autocomplete="given-name" value={profile.first_name} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Middle name (optional)"><IonInput aria-label="Middle name" className="form-input" name="middle_name" autocomplete="additional-name" value={profile.middle_name} onIonInput={update} maxlength={100} /></Field>
        <Field label="Last name"><IonInput aria-label="Last name" className="form-input" name="last_name" autocomplete="family-name" value={profile.last_name} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Country"><IonInput aria-label="Country" className="form-input" name="country" autocomplete="country-name" value={profile.country} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Province / State / Region"><IonInput aria-label="Region" className="form-input" name="region" autocomplete="address-level1" value={profile.region} onIonInput={update} required maxlength={100} /></Field>
        <Field label="City / Municipality"><IonInput aria-label="City" className="form-input" name="city" autocomplete="address-level2" value={profile.city} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Barangay (optional)"><IonInput aria-label="Barangay" className="form-input" name="barangay" value={profile.barangay} onIonInput={update} maxlength={100} /></Field>
        <Field label="Street address"><IonInput aria-label="Street address" className="form-input" name="street_address" autocomplete="street-address" value={profile.street_address} onIonInput={update} required maxlength={255} /></Field>
        <Field label="House / Unit number (optional)"><IonInput aria-label="Unit number" className="form-input" name="unit_number" value={profile.unit_number} onIonInput={update} maxlength={100} /></Field>
        <Field label="Postal code (optional)"><IonInput aria-label="Postal code" className="form-input" name="postal_code" autocomplete="postal-code" value={profile.postal_code} onIonInput={update} maxlength={32} /></Field>
        <Field label="Phone number (optional)"><IonInput aria-label="Phone number" className="form-input" name="phone_number" type="tel" autocomplete="tel" value={profile.phone_number} onIonInput={update} maxlength={32} /></Field>
      </div>
      <p className="address-privacy-note">Your home location helps personalize household energy settings. Your full address is private and is not shown on the dashboard.</p>
      {showConsent && <label className="consent-field"><input type="checkbox" name="terms_accepted" checked={profile.terms_accepted} onChange={update} required /><span>I agree to the Terms of Service and Privacy Policy.</span></label>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <IonButton type="submit" expand="block" className="primary-button" disabled={saving}>
        {saving ? <IonSpinner aria-label="Loading" name="crescent" /> : <>Save and Continue <IonIcon aria-hidden="true" icon={chevronForwardOutline} slot="end" /></>}
      </IonButton>
    </form>
  );
}

function AccountSettings({ user, providers, onSave, onConnect, onChangePassword, saving, error }) {
  const [password, setPassword] = useState({
    current_password: '', password: '', password_confirmation: '',
  });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [pendingProvider, setPendingProvider] = useState('');

  async function connect(provider) {
    setPendingProvider(provider);
    await onConnect(provider);
    setPendingProvider('');
  }

  async function submitPassword(event) {
    event.preventDefault();
    setPasswordMessage('');
    try {
      const message = await onChangePassword(password);
      setPasswordMessage(message);
      setPassword({ current_password: '', password: '', password_confirmation: '' });
    } catch {
      // The parent displays the API error.
    }
  }

  return (
    <div className="account-settings-grid">
      <section className="settings-card">
        <h2>Personal information</h2>
        <p className="settings-email">Email address · {user.email}</p>
        <ProfileEditor user={user} onSave={onSave} saving={saving} error={error} />
      </section>
      <section className="settings-card">
        <h2>Sign-in methods</h2>
        <p>Link another sign-in method only while signed in to this account.</p>
        <div className="connected-methods">
          {['google', 'github'].map((provider) => (
            <div className="connected-method" key={provider}>
              <span>{provider === 'google' ? <IonIcon aria-hidden="true" icon={logoGoogle} /> : <IonIcon aria-hidden="true" icon={logoGithub} />} {provider === 'google' ? 'Google' : 'GitHub'}</span>
              {providers.includes(provider) ? <strong>Connected</strong> : <button className="text-button" type="button" disabled={!!pendingProvider} onClick={() => connect(provider)}>{pendingProvider === provider ? 'Connecting…' : 'Connect'}</button>}
            </div>
          ))}
          <div className="connected-method"><span>Email and password</span><strong>{providers.includes('password') ? 'Connected' : 'Not set up'}</strong></div>
        </div>
        {providers.includes('password') && <form className="password-change-form" onSubmit={submitPassword}>
          <h3>Change password</h3>
          <Field label="Current password"><IonInput aria-label="Current password" className="form-input" name="current_password" type="password" autocomplete="current-password" value={password.current_password} onIonInput={(event) => setPassword((previous) => ({ ...previous, current_password: event.detail?.value ?? '' }))} required /></Field>
          <Field label="New password"><IonInput aria-label="Password" className="form-input" name="password" type="password" autocomplete="new-password" value={password.password} onIonInput={(event) => setPassword((previous) => ({ ...previous, password: event.detail?.value ?? '' }))} required minlength={8} maxlength={128} /></Field>
          <Field label="Confirm new password"><IonInput aria-label="Password confirmation" className="form-input" name="password_confirmation" type="password" autocomplete="new-password" value={password.password_confirmation} onIonInput={(event) => setPassword((previous) => ({ ...previous, password_confirmation: event.detail?.value ?? '' }))} required minlength={8} maxlength={128} /></Field>
          {passwordMessage && <p className="form-note" role="status">{passwordMessage}</p>}
          <IonButton type="submit" className="primary-button" disabled={saving}>Update password</IonButton>
        </form>}
      </section>
    </div>
  );
}

function getInitialTheme() {
  const currentTheme = document.documentElement.dataset.theme;
  if (currentTheme === 'dark' || currentTheme === 'light') return currentTheme;
  const savedTheme = localStorage.getItem('energeia_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function EnergiaApp() {
  const routerNavigate = useNavigate();
  const navigateRef = useRef(routerNavigate);
  const nativePlatform = Capacitor.getPlatform();
  const isMobileShell = nativePlatform !== 'web' || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  useEffect(() => {
    document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();
    return () => { delete document.documentElement.dataset.nativePlatform; };
  }, []);
  useEffect(() => { navigateRef.current = routerNavigate; }, [routerNavigate]);
  const navigate = useCallback((...args) => navigateRef.current(...args), []);
  const location = useLocation();
  const page = NAV.find((item) => `/${item.id}` === location.pathname)?.id || 'overview';
  const refreshVersion = useRef(0);
  const sidebarRef = useRef(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const darkMode = theme === 'dark';
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [householdsLoaded, setHouseholdsLoaded] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [households, setHouseholds] = useState([]);
  const [householdId, setHouseholdId] = useState('');
  const [rates, setRates] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [dashboard, setDashboard] = useState(null);
  const [bills, setBills] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioResults, setScenarioResults] = useState(null);
  const [modal, setModal] = useState('');
  const [editingAppliance, setEditingAppliance] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);
  const [editingHousehold, setEditingHousehold] = useState(null);
  const [formFields, setFormFields] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState([]);
  const handledOAuthUrls = useRef(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const currentHousehold = households.find((item) => item.household_id === Number(householdId));

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener;
    let active = true;
    CapacitorApp.addListener('backButton', () => {
      if (menuOpen) {
        setMenuOpen(false);
      } else if (modal) {
        setModal('');
        setEditingHousehold(null);
      } else if (user && location.pathname !== '/overview') {
        navigate('/overview', { replace: true });
      } else if (!user && ['/register', '/forgot-password', '/reset-password'].includes(location.pathname)) {
        navigate('/login', { replace: true });
      } else {
        void CapacitorApp.exitApp();
      }
    }).then((registeredListener) => {
      if (active) listener = registeredListener;
      else void registeredListener.remove();
    });
    return () => {
      active = false;
      void listener?.remove();
    };
  }, [menuOpen, modal, user, location.pathname, navigate]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('energeia_theme', nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121a18' : '#f5f7f6');
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousFocus = document.activeElement;
    const drawer = sidebarRef.current;
    const focusable = () => [...drawer.querySelectorAll('button, a[href]')].filter((el) => !el.disabled);
    focusable()[0]?.focus();
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key === 'Tab') {
        const items = focusable();
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('keydown', closeOnEscape); previousFocus?.focus(); };
  }, [menuOpen]);

  function updateFormField(event) {
    const field = event.currentTarget.name;
    const value = event.detail?.value ?? '';
    setFormFields((previous) => ({ ...previous, [field]: value }));
  }

  function openModal(name, initialFields = {}) {
    setError('');
    setFormFields(initialFields);
    setModal(name);
  }

  const selectedRate = useMemo(
    () => rates.find((rate) => rate.rate_id === currentHousehold?.rate_id),
    [currentHousehold, rates],
  );
  const hasUsage = dashboard?.has_usage ?? Number(dashboard?.current_kwh) > 0;

  const handleLogout = useCallback(() => {
    localStorage.removeItem('energeia_token');
    refreshVersion.current += 1;
    setModal(''); setMenuOpen(false); setNotice(''); setError(''); setResetToken('');
    setAppliances([]); setSchedules({}); setBills([]); setRecommendations([]); setScenarios([]);
    setScenarioResults(null); setActiveScenario(null); setConnectedProviders([]);
    setLoading(false);
    navigate('/login', { replace: true });
    setUser(null);
    setHouseholdsLoaded(false);
    setHouseholds([]);
    setHouseholdId('');
    setDashboard(null);
  }, [navigate]);

  useEffect(() => {
    const expired = () => { handleLogout(); setOauthError('Your session expired. Please sign in again.'); };
    window.addEventListener('energeia:session-expired', expired);
    return () => window.removeEventListener('energeia:session-expired', expired);
  }, [handleLogout]);

  const handleOAuthReturn = useCallback(async (url) => {
    if (handledOAuthUrls.current.has(url)) return;
    handledOAuthUrls.current.add(url);

    let callback;
    try {
      callback = new URL(url);
    } catch {
      return;
    }
    if (callback.protocol !== 'io.ionic.starter:' || callback.hostname !== 'oauth') return;

    const params = new URLSearchParams(callback.hash.slice(1));
    const token = params.get('access_token');
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      setOauthError(OAUTH_ERRORS[oauthError] || 'Sign-in could not be completed. Please try again.');
    }
    if (!token) return;

    localStorage.setItem('energeia_token', token);
    setOauthError('');
    setLoading(true);
    try {
      setUser(await request('/auth/me'));
    } catch (exception) {
      handleLogout();
      setOauthError(exception.message);
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    const callback = new URLSearchParams(window.location.hash.slice(1));
    const callbackToken = callback.get('access_token');
    const callbackResetToken = callback.get('password_reset');
    const callbackError = callback.get('oauth_error');
    if (callbackToken) localStorage.setItem('energeia_token', callbackToken);
    if (callbackResetToken) { localStorage.removeItem('energeia_token'); setUser(null); setResetToken(callbackResetToken); navigate('/reset-password', { replace: true }); }
    if (callbackError) {
      setOauthError(OAUTH_ERRORS[callbackError] || 'Sign-in could not be completed. Please try again.');
    }
    if (callbackToken || callbackResetToken || callbackError) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    if (callbackResetToken) { setLoading(false); return; }
    const token = callbackToken || localStorage.getItem('energeia_token');
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    request('/auth/me').then((account) => { if (!cancelled && localStorage.getItem('energeia_token') === token) setUser(account); }).catch((exception) => { if (!cancelled && exception.status !== 401) setOauthError(exception.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [handleLogout, navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let listener;
    let active = true;
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void handleOAuthReturn(url);
    }).then((registeredListener) => {
      if (active) listener = registeredListener;
      else void registeredListener.remove();
    });
    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (launch?.url) void handleOAuthReturn(launch.url);
    });

    return () => {
      active = false;
      void listener?.remove();
    };
  }, [handleOAuthReturn]);

  const refresh = useCallback(async (id = householdId, { calculate = false } = {}) => {
    const token = localStorage.getItem('energeia_token');
    if (!id || !token) return;
    const version = ++refreshVersion.current;
    if (calculate) await request(`/households/${id}/calculate`, { method: 'POST', body: {} });
    // Dashboard generates recommendations, so read them only after it completes.
    const dashData = await request(`/households/${id}/dashboard`);
    const [applianceData, householdData, rateData, billData, recommendationData, scenarioData] = await Promise.all([
      request(`/households/${id}/appliances`), request('/households'), request('/rates'),
      request(`/households/${id}/bills`), request(`/households/${id}/recommendations`),
      request(`/households/${id}/scenarios`),
    ]);
    const entries = await Promise.all(applianceData.map(async (appliance) => [appliance.appliance_id, await request(`/appliances/${appliance.appliance_id}/schedules`)]));
    if (version !== refreshVersion.current || localStorage.getItem('energeia_token') !== token) return;
    setBills(billData); setAppliances(applianceData); setHouseholds(householdData);
    setRates(rateData); setSchedules(Object.fromEntries(entries));
    setRecommendations(recommendationData); setScenarios(scenarioData); setDashboard(dashData);
  }, [householdId]);

  const loadHouseholds = useCallback(async () => {
    const token = localStorage.getItem('energeia_token');
    const result = await request('/households');
    if (localStorage.getItem('energeia_token') !== token) return;
    setHouseholds(result);
    setHouseholdsLoaded(true);
    if (result.length) {
      setHouseholdId((current) => {
        const selected = result.some((household) => household.household_id === Number(current))
          ? Number(current)
          : result[0].household_id;
        return String(selected);
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.profile_complete) return;
    setLoading(true);
    loadHouseholds().catch((exception) => { setError(exception.message); setLoading(false); });
  }, [user?.user_id, user?.profile_complete, loadHouseholds]);

  useEffect(() => {
    if (!user?.profile_complete || !householdId) return;
    let cancelled = false;
    setLoading(true);
    setDashboard(null); setAppliances([]); setSchedules({}); setBills([]); setRecommendations([]); setScenarios([]); setScenarioResults(null); setActiveScenario(null);
    refresh(householdId, { calculate: true })
      .catch((exception) => { if (!cancelled) setError(exception.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; refreshVersion.current += 1; };
  }, [user?.user_id, user?.profile_complete, householdId, refresh]);

  useEffect(() => {
    if (!user || page !== 'settings') return;
    request('/auth/providers')
      .then((result) => setConnectedProviders([
        ...result.providers,
        ...(result.password_enabled ? ['password'] : []),
      ]))
      .catch((exception) => setError(exception.message));
  }, [user, page]);

  async function act(fn, { success, reload = true, calculate = false } = {}) {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      if (reload) await refresh(householdId, { calculate });
      if (success) setNotice(success);
      return result;
    } catch (exception) {
      setError(exception.message);
      throw exception;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(profile) {
    setBusy(true);
    setError('');
    try {
      const updated = await request('/auth/profile', {
        method: 'PATCH',
        body: profile,
      });
      setUser(updated);
      setNotice('Your account information has been saved.');
      return updated;
    } catch (exception) {
      setError(exception.message);
      throw exception;
    } finally {
      setBusy(false);
    }
  }

  async function connectProvider(provider) {
    setError('');
    try {
      if (provider === 'google' && Capacitor.getPlatform() === 'android') {
        const result = await nativeGoogleSignIn({ linking: true });
        setNotice(result.message);
        return;
      }
      const nativeQuery = Capacitor.isNativePlatform() ? '?native_app=true' : '';
      const result = await request(`/auth/providers/${provider}/start${nativeQuery}`, { method: 'POST' });
      window.location.assign(result.authorization_url);
    } catch (exception) {
      setError(exception.message);
    }
  }

  async function changePassword(password) {
    setBusy(true);
    setError('');
    try {
      const result = await request('/auth/password/change', { method: 'POST', body: password });
      handleLogout();
      setAuthMessage(`${result.message} Sign in with your new password.`);
      return result.message;
    } catch (exception) {
      setError(exception.message);
      throw exception;
    } finally {
      setBusy(false);
    }
  }

  function changePage(next) {
    navigate(`/${next}`);
    setMenuOpen(false); setModal(''); setSearchQuery('');

  }

  useEffect(() => {
    setMenuOpen(false); setModal('');
    window.scrollTo?.(0, 0);
    const name = NAV.find((item) => `/${item.id}` === location.pathname)?.label;
    document.title = `${name || ({ '/': 'Energy, made visible', '/login': 'Sign in', '/register': 'Create account', '/forgot-password': 'Reset password', '/reset-password': 'Choose a password' }[location.pathname] || 'Page not found')} · Energeia`;
  }, [location.pathname]);

  useEffect(() => {
    if (loading) return;
    const protectedRoute = NAV.some((item) => `/${item.id}` === location.pathname);
    if (!user && protectedRoute) navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    if (user && ['/', '/login', '/register'].includes(location.pathname)) {
      const next = new URLSearchParams(location.search).get('next');
      navigate(NAV.some((item) => `/${item.id}` === next) ? next : '/overview', { replace: true });
    }
  }, [loading, user, location.pathname, location.search, navigate]);

  if (loading && !user) return <IonApp><div className="app-loading"><Logo /><IonSpinner aria-label="Loading" name="crescent" /></div></IonApp>;
  const knownRoute = ['/', '/login', '/register', '/forgot-password', '/reset-password', ...NAV.map((item) => `/${item.id}`)].includes(location.pathname);
  if (!knownRoute) return <IonApp><main className="not-found"><Logo /><h1>Page not found</h1><p>This address does not match an Energeia page.</p><Link to={user ? '/overview' : '/'}>Return home</Link></main></IonApp>;
  if (!user && location.pathname === '/' && !oauthError && !resetToken) return <IonApp><LandingPage darkMode={darkMode} onToggleTheme={toggleTheme} /></IonApp>;
  if (!user) return <IonApp><AuthScreen onLogin={(account) => { setUser(account); setLoading(true); setOauthError(''); setAuthMessage(''); }} darkMode={darkMode} onToggleTheme={toggleTheme} oauthError={oauthError} resetToken={resetToken} authMessage={authMessage} /></IonApp>;
  if (!user.profile_complete) return <IonApp>
    <main className="profile-completion-page">
      <header className="welcome-top"><Logo /><div className="welcome-actions"><ThemeToggle darkMode={darkMode} onToggle={toggleTheme} /><button className="signout-link" onClick={handleLogout}><IonIcon aria-hidden="true" icon={logOutOutline} /> Sign out</button></div></header>
      <section className="profile-completion-card">
        <span className="eyebrow">One last step</span>
        <h1>Complete your profile</h1>
        <p>Your home location helps personalize household energy settings. The full address remains private.</p>
        <ProfileEditor user={user} onSave={saveProfile} saving={busy} error={error} showConsent={!user.terms_accepted} />
      </section>
    </main>
  </IonApp>;
  if ((!householdsLoaded && !error) || (loading && !households.length)) return <IonApp><div className="app-loading"><Logo /><IonSpinner aria-label="Loading" name="crescent" /></div></IonApp>;

  const pageTitle = {
    overview: 'Home',
    appliances: 'Appliances',
    history: 'Usage & Bills',
    insights: 'Energy Tips',
    scenarios: 'What-if Planner',
    settings: 'Account settings',
  }[page];

  const openCreateAppliance = () => { setEditingAppliance(null); openModal('appliance'); };

  async function saveAppliance(event) {
    event.preventDefault();
    const body = {
      appliance_name: String(formFields.appliance_name || '').trim(),
      category: formFields.category || 'Cooling',
      wattage: Number(formFields.wattage),
      quantity: Number(formFields.quantity ?? editingAppliance?.quantity ?? 1),
    };
    if (!body.appliance_name || !Number.isFinite(body.wattage) || body.wattage <= 0 || !Number.isInteger(body.quantity) || body.quantity < 1) {
      setError('Enter an appliance name, a positive wattage, and a quantity of at least one.');
      return;
    }
    try {
      if (editingAppliance) {
        await act(() => request(`/appliances/${editingAppliance.appliance_id}`, { method: 'PATCH', body }), { success: `${body.appliance_name} has been updated.`, calculate: true });
      } else {
        await act(() => request(`/households/${householdId}/appliances`, { method: 'POST', body }), { success: `${body.appliance_name} was added. Next, add its usage schedule.`, calculate: true });
      }
      setModal('');
    } catch { /* Keep the form open so the user can correct the error. */ }
  }

  async function deleteAppliance(appliance) {
    if (!window.confirm(`Remove ${appliance.appliance_name}? Its saved billing history will be preserved by archiving the appliance.`)) return;
    try {
      const result = await act(() => request(`/appliances/${appliance.appliance_id}`, { method: 'DELETE' }), { calculate: true });
      setNotice(result.archived
        ? `${appliance.appliance_name} was archived; its billing history is safe.`
        : `${appliance.appliance_name} has been removed.`);
    } catch { /* The API explains when preserving a billing history prevents removal. */ }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = WEEKDAYS.filter((day) => data.getAll('days').includes(day));
    const body = { days_of_week: days, hours_per_day: Number(formFields.hours_per_day), start_time: formFields.start_time || null, is_active: data.get('is_active') === 'on' };
    if (!days.length || !Number.isFinite(body.hours_per_day) || body.hours_per_day <= 0 || body.hours_per_day > 24) {
      setError('Choose at least one day and enter between 0 and 24 operating hours.');
      return;
    }
    try {
      if (editingSchedule) {
        await act(() => request(`/schedules/${editingSchedule.schedule_id}`, { method: 'PATCH', body }), { success: 'Your usage schedule has been updated.', calculate: true });
      } else {
        await act(() => request(`/appliances/${activeScenario.appliance_id}/schedules`, { method: 'POST', body }), { success: 'Usage schedule saved.', calculate: true });
      }
      setModal('');
    } catch { /* Leave the dialog open with the server validation message visible. */ }
  }

  async function setScheduleActive(schedule, isActive) {
    try {
      await act(() => request(`/schedules/${schedule.schedule_id}`, { method: 'PATCH', body: { is_active: isActive } }), { success: `Schedule ${isActive ? 'activated' : 'paused'}.`, calculate: true });
    } catch { /* Keep the previous state visible until a successful response. */ }
  }

  async function deleteSchedule(schedule) {
    if (!window.confirm('Remove this usage schedule?')) return;
    try {
      await act(() => request(`/schedules/${schedule.schedule_id}`, { method: 'DELETE' }), { success: 'Schedule removed.', calculate: true });
    } catch (exception) {
      setError(exception.message);
    }
  }

  async function saveHousehold(event) {
    event.preventDefault();
    try {
      const household = await act(() => request(editingHousehold ? `/households/${editingHousehold.household_id}` : '/households', {
        method: editingHousehold ? 'PATCH' : 'POST',
        body: { household_name: String(formFields.household_name || '').trim(), address: String(formFields.address || '').trim() || null },
      }), { reload: false, success: editingHousehold ? 'Your household details have been updated.' : 'Your new household is ready.' });
      setModal('');
      setEditingHousehold(null);
      await loadHouseholds();
      setHouseholdId(String(household.household_id));
    } catch { /* Display the validation error above the open form. */ }
  }

  async function saveRate(event) {
    event.preventDefault();
    try {
      await act(() => request(`/households/${householdId}/rate`, {
        method: 'PATCH',
        body: { provider_name: String(formFields.provider_name || '').trim(), rate_per_kwh: Number(formFields.rate_per_kwh) },
      }), { success: 'Your electricity rate is updated. Previous bills retain their original rates.', calculate: true });
      setModal('');
    } catch { /* The API message remains visible while the form is open. */ }
  }

  async function calculateCurrentPeriod() {
    try {
      await act(() => request(`/households/${householdId}/calculate`, {
        method: 'POST',
        body: { period_start: `${PERIOD}-01` },
      }), { success: 'This period’s consumption has been saved.', calculate: false });
      const [nextDashboard, nextBills] = await Promise.all([
        request(`/households/${householdId}/dashboard?household_id=${householdId}`),
        request(`/households/${householdId}/bills`),
      ]);
      setDashboard(nextDashboard);
      setBills(nextBills);
    } catch { /* Display the failed calculation without discarding saved data. */ }
  }

  async function saveActualBill(event) {
    event.preventDefault();
    try {
      await act(() => request(`/households/${householdId}/bills/${Number(activeScenario?.bill_id)}/actual`, {
        method: 'PATCH',
        body: { actual_bill_amount: Number(formFields.actual_bill_amount) },
      }), { success: 'Your actual bill amount has been saved.' });
      setModal('');
    } catch { /* Keep the amount editable if the server rejects it. */ }
  }

  async function saveScenario(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const items = appliances.map((appliance) => {
      const hourValue = data.get(`hours_${appliance.appliance_id}`);
      const quantityValue = data.get(`quantity_${appliance.appliance_id}`);
      return {
        appliance_id: appliance.appliance_id,
        adjusted_hours_per_day: hourValue === '' ? null : Number(hourValue),
        adjusted_quantity: quantityValue === '' ? null : Number(quantityValue),
      };
    });
    try {
      const scenario = await act(() => request(`/households/${householdId}/scenarios`, {
        method: 'POST',
        body: { scenario_name: String(formFields.scenario_name || '').trim(), items },
      }), { success: 'Your what-if plan was saved.' });
      setActiveScenario(scenario);
      setScenarioResults(scenario);
      setModal('');
    } catch { /* Show the server error without losing the entered plan. */ }
  }

  async function showScenario(scenario) {
    try {
      const result = await request(`/households/${householdId}/scenarios/${scenario.scenario_id}`);
      setActiveScenario(result);
      setScenarioResults(result);
    } catch (exception) { setError(exception.message); }
  }

  async function runScenario(event) {
    event.preventDefault();
    setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const items = appliances.map((appliance) => {
      const hourValue = data.get(`scenario_hours_${appliance.appliance_id}`);
      const quantityValue = data.get(`scenario_quantity_${appliance.appliance_id}`);
      return {
        appliance_id: appliance.appliance_id,
        adjusted_hours_per_day: hourValue === '' ? null : Number(hourValue),
        adjusted_quantity: quantityValue === '' ? null : Number(quantityValue),
      };
    });
    try {
      const result = await request(`/households/${householdId}/scenarios/preview`, {
        method: 'POST',
        body: { items },
      });
      setScenarioResults(result);
      setNotice('Your preview did not change your appliances or usage history.');
    } catch (exception) { setError(exception.message); } finally { setBusy(false); }
  }

  async function dismissRecommendation(recommendationId) {
    try {
      await act(() => request(`/recommendations/${recommendationId}`, { method: 'PATCH', body: { is_dismissed: true } }), { success: 'Recommendation dismissed.' });
    } catch { /* Keep the recommendation visible if the change was not saved. */ }
  }

  async function deleteScenario(scenario) {
    if (!window.confirm(`Delete “${scenario.scenario_name}”? This cannot be undone.`)) return;
    try {
      await act(() => request(`/households/${householdId}/scenarios/${scenario.scenario_id}`, { method: 'DELETE' }), { success: 'Scenario deleted.' });
      if (activeScenario?.scenario_id === scenario.scenario_id) { setActiveScenario(null); setScenarioResults(null); }
    } catch { /* Preserve the scenario until deletion succeeds. */ }
  }

  if (!householdsLoaded && !loading) return <IonApp><main className="not-found"><Logo /><h1>Your household could not be loaded</h1><p role="alert">{error}</p><button className="text-action" onClick={() => { setLoading(true); loadHouseholds().catch((exception) => { setError(exception.message); setLoading(false); }); }}>Try again</button><button className="text-button" onClick={handleLogout}>Sign out</button></main></IonApp>;

  if (user && !households.length && !loading) {
    return <IonApp>
      <main className="welcome-page"><header className="welcome-top"><Logo /><div className="welcome-actions"><ThemeToggle darkMode={darkMode} onToggle={toggleTheme} /><button className="signout-link" onClick={handleLogout}><IonIcon aria-hidden="true" icon={logOutOutline} /> Sign out</button></div></header>
        <section className="welcome-card"><div className="welcome-icon"><IonIcon aria-hidden="true" icon={homeOutline} /></div>
          <h1>Set up your household</h1>
          <p>Add appliances and an electricity rate to estimate your energy use and bill.</p>
          <form className="welcome-form" onSubmit={saveHousehold}>
            <Field label="Household name"><IonInput aria-label="Household name" className="form-input" name="household_name" placeholder="e.g. Our home" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
            <Field label="Address" hint="Optional"><IonInput aria-label="Address" className="form-input" name="address" placeholder="City or neighbourhood" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <IonButton expand="block" type="submit" className="primary-button" disabled={busy}>{busy ? <IonSpinner aria-label="Loading" name="crescent" /> : <>Set up my household <IonIcon aria-hidden="true" icon={chevronForwardOutline} slot="end" /></>}</IonButton>
          </form>
        </section>
      </main>
      <IonToast isOpen={!!notice} message={notice} duration={2600} position="top" onDidDismiss={() => setNotice('')} />
    </IonApp>;
  }

  const bars = dashboard?.weekly || [];

  const dismissError = () => setError('');
  const signedInInitial = (user?.full_name || 'U').trim().charAt(0).toUpperCase();

  return <IonApp>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="shell-content">
        <div className="app-shell">
          <aside ref={sidebarRef} id="app-sidebar" className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
            <Logo />
            <button className="drawer-close icon-button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><IonIcon aria-hidden="true" icon={closeOutline} /></button>
            <div className="sidebar-nav-section">
              <span className="sidebar-section-title">MENU</span>
              <nav className="side-nav" aria-label="Main navigation">
                {NAV.slice(0, 5).map((item, index) => (
                  <button
                    key={item.id}
                    aria-current={page === item.id ? 'page' : undefined}
                    className={`nav-link${page === item.id ? ' nav-link-active' : ''}`}
                    onClick={() => changePage(item.id)}
                  >
                    <span className="nav-number">0{index + 1}</span>
                    <IonIcon aria-hidden="true" icon={item.icon} />
                    <span>{item.label}</span>
                    {page === item.id && <span className="nav-active-dot" />}
                  </button>
                ))}
              </nav>
            </div>

            <div className="sidebar-nav-section">
              <span className="sidebar-section-title">ACCOUNT</span>
              <nav className="side-nav" aria-label="Account navigation">
                <button
                  aria-current={page === 'settings' ? 'page' : undefined}
                  className={`nav-link${page === 'settings' ? ' nav-link-active' : ''}`}
                  onClick={() => changePage('settings')}
                >
                  <span className="nav-number">06</span>
                  <IonIcon aria-hidden="true" icon={settingsOutline} />
                  <span>Account settings</span>
                  {page === 'settings' && <span className="nav-active-dot" />}
                </button>
              </nav>
            </div>

            <div className="sidebar-spacer" />

            <div className="side-account">
              <span className="avatar">{signedInInitial}</span>
              <span className="account-copy">
                <strong>{user?.full_name || user?.email}</strong>
                <span>Personal account</span>
              </span>
              <button className="account-out" title="Sign out" onClick={handleLogout}>
                <IonIcon aria-hidden="true" icon={logOutOutline} />
              </button>
            </div>
          </aside>
          {menuOpen && <button className="sidebar-scrim" aria-label="Dismiss navigation menu" onClick={() => setMenuOpen(false)} />}

          <main className="main-pane">
            <header className="topbar">
              <button
                className="icon-button menu-toggle"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-controls="app-sidebar"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <IonIcon aria-hidden="true" icon={menuOutline} />
              </button>

              <div className={`mobile-header-brand${page === 'overview' ? ' mobile-header-home' : ''}`}>
                <Logo small />
                <h1 className="mobile-page-title">{pageTitle}</h1>
              </div>

              <div className="topbar-search">
                <IonIcon aria-hidden="true" icon={searchOutline} />
                <input
                  type="search"
                  placeholder="Search appliances"
                  aria-label="Search appliances"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); if (page !== 'appliances') navigate('/appliances'); }}
                />
              </div>

              <div className="breadcrumb">
                <span>My home</span>
                <IonIcon aria-hidden="true" icon={chevronForwardOutline} />
                <span className="breadcrumb-current">{currentHousehold?.household_name || 'Your household'}</span>
              </div>

              <div className="topbar-right">
                {households.length > 1 && (
                  <div className="household-picker">
                    <IonIcon aria-hidden="true" icon={homeOutline} />
                    <select
                      value={householdId}
                      aria-label="Select household"
                      disabled={busy || loading} onChange={(event) => { setModal(''); setDashboard(null); setHouseholdId(event.target.value); }}
                    >
                      {households.map((household) => (
                        <option key={household.household_id} value={household.household_id}>
                          {household.household_name}
                        </option>
                      ))}
                    </select>
                    <IonIcon aria-hidden="true" icon={chevronDownOutline} />
                  </div>
                )}
                <button
                  className="text-action"
                  onClick={() => openModal('rate', Number(selectedRate?.rate_per_kwh) > 0 ? { provider_name: selectedRate.provider_name, rate_per_kwh: selectedRate.rate_per_kwh } : {})}
                >
                  <IonIcon aria-hidden="true" icon={flashOutline} />
                  <span>{Number(selectedRate?.rate_per_kwh) > 0 ? 'Edit rate' : 'Set rate'}</span>
                </button>
                <button
                  className="text-action"
                  onClick={() => { setEditingHousehold(null); openModal('household'); }}
                >
                  <IonIcon aria-hidden="true" icon={addOutline} />
                  <span>New home</span>
                </button>
                {currentHousehold && (
                  <button
                    className="household-edit"
                    title="Edit household details"
                    onClick={() => {
                      setEditingHousehold(currentHousehold);
                      openModal('household', { household_name: currentHousehold.household_name, address: currentHousehold.address || '' });
                    }}
                  >
                    <IonIcon aria-hidden="true" icon={createOutline} />
                  </button>
                )}
                <ThemeToggle darkMode={darkMode} onToggle={toggleTheme} />
                <span className="header-divider" />
                <div
                  className="user-profile-snippet"
                  title={user?.full_name || user?.email}
                >
                  <div className="profile-text">
                    <strong className="profile-name">{user?.full_name || user?.email || 'Home Owner'}</strong>
                    <span className="profile-role">Home Owner</span>
                  </div>
                  <button
                    className="header-avatar" onClick={() => openModal('account')}
                    aria-label={`Account: ${user?.full_name || user?.email}`}
                  >
                    {signedInInitial}
                  </button>
                </div>
              </div>
            </header>

            <div className="page-inner" id="main-content" tabIndex={-1}>
              <section className="page-intro">
                <div>
                  <span className="eyebrow">ENERGY OVERVIEW</span>
                  <h1>{pageTitle}</h1>
                  <p>Understand your household energy estimates, one appliance at a time.</p>
                </div>
                <div className="intro-actions">
                  <span className="update-stamp">
                    <IonIcon aria-hidden="true" icon={calendarClearOutline} /> This billing period
                  </span>
                  <IonButton
                    className="primary-button add-device-pill-btn"
                    onClick={openCreateAppliance}
                  >
                    <IonIcon aria-hidden="true" icon={addOutline} slot="start" /> Add Device
                  </IonButton>
                </div>
              </section>
              {error && (
                <div className="global-error" role="alert">
                  <span>{error}</span>
                  <button className="icon-button" onClick={dismissError} aria-label="Dismiss error">
                    <IonIcon aria-hidden="true" icon={closeOutline} />
                  </button>
                </div>
              )}

              {loading && <p role="status" className="loading-status"><IonSpinner aria-label="Loading" name="crescent" /> Loading your household…</p>}
              {!loading && page === 'overview' && (
                <section className="view overview-view">
                  <div className="overview-heading"><span className="eyebrow">{PERIOD_LABEL}</span><h2>A clearer picture of your energy.</h2><p>Estimates from your saved wattage, quantities and schedules. Not live meter readings.</p></div>
                  <div className="dashboard-metrics">
                    <article className="metric-card metric-card-primary"><span className="metric-label">Estimated energy</span><strong>{dashboard ? fmtKwh(dashboard.current_kwh) : '—'} <small>kWh</small></strong><span className="metric-note">This billing period</span></article>
                    <article className="metric-card"><span className="metric-label">Estimated bill</span><strong>{Number(selectedRate?.rate_per_kwh) > 0 && dashboard ? fmtMoney(dashboard.estimated_cost) : '—'}</strong><span className="metric-note">{Number(selectedRate?.rate_per_kwh) > 0 ? 'Based on your provider rate' : 'Set your electricity rate to estimate cost'}</span></article>
                    <article className="metric-card"><span className="metric-label">Your appliances</span><strong>{appliances.length}</strong><span className="metric-note">{Object.values(schedules).flat().filter((item) => item.is_active).length} active schedules</span></article>
                    <article className="metric-card"><span className="metric-label">Previous period</span><strong>{dashboard?.previous_kwh > 0 ? fmtKwh(dashboard.previous_kwh) : '—'} <small>kWh</small></strong><span className="metric-note">{dashboard?.previous_kwh > 0 ? 'Saved estimated usage' : 'No usage history yet'}</span></article>
                  </div>
                  <UsageChart bars={bars} />
                  <article className="overview-next"><div><h2>Small changes start with a plan.</h2><p>Compare different hours or appliance quantities without changing your saved schedules.</p></div><button className="plain-link" onClick={() => changePage('scenarios')}>Explore the planner <IonIcon aria-hidden="true" icon={chevronForwardOutline} /></button></article>
                  <article className="settings-card"><h2>Your appliances</h2><p>{appliances.length ? 'Manage schedules and wattage to keep your estimates useful.' : 'Add your first appliance, then tell us when you use it.'}</p><button className="plain-link" onClick={() => changePage('appliances')}>Manage appliances <IonIcon aria-hidden="true" icon={chevronForwardOutline} /></button></article>
                </section>
              )}

              {!loading && page === 'appliances' && (
                <section className="view appliances-view">
                  <p className="scenario-instruction">Estimated usage for {PERIOD_LABEL}. Manage the schedules used in your calculations.</p>
                  <label className="appliance-search field-label">Find an appliance<input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or category" /></label>
                  <div className="appliance-filter-chips">
                    <button
                      className={`chip-pill${deviceFilter === 'all' ? ' is-active' : ''}`}
                      onClick={() => setDeviceFilter('all')}
                    >
                      All Devices
                    </button>
                    <button
                      className={`chip-pill${deviceFilter === 'category' ? ' is-active' : ''}`}
                      onClick={() => setDeviceFilter('category')}
                    >
                      By category
                    </button>
                    <button
                      className={`chip-pill${deviceFilter.startsWith('sort-') ? ' is-active' : ''}`}
                      aria-pressed={deviceFilter.startsWith('sort-')}
                      onClick={() => setDeviceFilter((p) => p === 'sort-desc' ? 'sort-asc' : 'sort-desc')}
                    >
                      Wattage: {deviceFilter === 'sort-asc' ? 'low to high' : 'high to low'} <IonIcon aria-hidden="true" icon={deviceFilter === 'sort-asc' ? arrowUpOutline : chevronDownOutline} />
                    </button>
                  </div>

                  <div className="content-grid">
                    <div className="wide-content">
                      <div className="section-row section-row-tight">
                        <div>
                          <h2>
                            Devices List <span className="count-badge">{appliances.length}</span>
                          </h2>
                        </div>
                      </div>
                      {appliances.length ? (
                        <div className="appliance-list">
                          {!appliances.some((item) => `${item.appliance_name} ${item.category}`.toLowerCase().includes(searchQuery.toLowerCase())) && <p role="status">No appliances match your search.</p>}
                          {appliances.filter((item) => `${item.appliance_name} ${item.category}`.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => deviceFilter === 'sort-desc' ? Number(b.wattage) - Number(a.wattage) : deviceFilter === 'sort-asc' ? Number(a.wattage) - Number(b.wattage) : deviceFilter === 'category' ? (a.category || '').localeCompare(b.category || '') : a.appliance_id - b.appliance_id).map((appliance, index) => {
                            const applianceSchedules = schedules[appliance.appliance_id] || [];
                            const current = { current_kwh: Number(appliance.wattage) * Number(appliance.quantity) * Number(appliance.average_hours_per_day) * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() / 1000 };
                            const isHighUsage = Number(appliance.wattage) >= 1000 || appliance.category === 'Cooling';

                            return (
                              <article className="appliance-card" key={appliance.appliance_id}>
                                <div
                                  className="appliance-head"
                                  style={isMobileShell ? {
                                    display: 'grid',
                                    gridTemplateColumns: '44px minmax(0, 1fr) 40px 40px',
                                    gridTemplateAreas: '"icon name edit delete" "icon consumption consumption consumption"',
                                    alignItems: 'center',
                                    gap: '8px 10px',
                                  } : undefined}
                                >
                                  <span className={`appliance-icon appliance-icon-${index % 4}`} style={isMobileShell ? { gridArea: 'icon' } : undefined}>
                                    <IonIcon aria-hidden="true"
                                      icon={
                                        appliance.category === 'Cooling'
                                          ? waterOutline
                                          : appliance.category === 'Lighting'
                                          ? bulbOutline
                                          : appliance.category === 'Kitchen'
                                          ? flashOutline
                                          : pulseOutline
                                      }
                                    />
                                  </span>
                                  <div className="appliance-name" style={isMobileShell ? { gridArea: 'name', minWidth: 0, flex: 'none' } : undefined}>
                                    <div className="appliance-title-row">
                                      <h3>{appliance.appliance_name}</h3>
                                      <span className={`device-usage-badge ${isHighUsage ? 'badge-high' : 'badge-normal'}`}>
                                        {isHighUsage ? 'High wattage' : 'Appliance'}
                                      </span>
                                    </div>
                                    <span>
                                      {appliance.category || 'Home appliance'} <span>·</span> {appliance.wattage} W{' '}
                                      <span>·</span> {appliance.quantity} {Number(appliance.quantity) === 1 ? 'unit' : 'units'}
                                    </span>
                                  </div>
                                  <div className="appliance-consumption" style={isMobileShell ? { gridArea: 'consumption', display: 'flex', minWidth: 0, padding: 0, flex: 'none', flexDirection: 'row', alignItems: 'baseline', gap: '6px', textAlign: 'left' } : undefined}>
                                    <strong>
                                      {Number(current?.current_kwh) > 0 ? (
                                        <>
                                          {fmtKwh(current.current_kwh)} <span>kWh</span>
                                        </>
                                      ) : (
                                        '—'
                                      )}
                                    </strong>
                                    <span style={isMobileShell ? { whiteSpace: 'nowrap', writingMode: 'horizontal-tb', wordBreak: 'normal' } : undefined}>{Number(current?.current_kwh) > 0 ? 'this billing period' : 'No active schedule'}</span>
                                  </div>
                                  <button
                                    className="icon-button"
                                    style={isMobileShell ? { gridArea: 'edit' } : undefined}
                                    title="Edit appliance" aria-label={`Edit ${appliance.appliance_name}`}
                                    onClick={() => {
                                      setEditingAppliance(appliance);
                                      openModal('appliance', {
                                        appliance_name: appliance.appliance_name,
                                        category: appliance.category || 'Cooling',
                                        wattage: appliance.wattage,
                                        quantity: appliance.quantity,
                                      });
                                    }}
                                  >
                                    <IonIcon aria-hidden="true" icon={createOutline} />
                                  </button>
                                  <button
                                    className="icon-button delete-button"
                                    style={isMobileShell ? { gridArea: 'delete' } : undefined}
                                    title="Remove appliance" aria-label={`Remove ${appliance.appliance_name}`}
                                    onClick={() => deleteAppliance(appliance)}
                                  >
                                    <IonIcon aria-hidden="true" icon={trashOutline} />
                                  </button>
                                </div>
                                <div className="schedule-divider" />
                                <div className="schedule-head">
                                  <span className="eyebrow section-eyebrow">Usage schedules</span>
                                  <button
                                    className="small-add"
                                    onClick={() => {
                                      setActiveScenario(appliance);
                                      setEditingSchedule(null);
                                      openModal('schedule');
                                    }}
                                  >
                                    <IonIcon aria-hidden="true" icon={addOutline} /> Add schedule
                                  </button>
                                </div>
                                {applianceSchedules.length ? (
                                  <div className="schedule-list">
                                    {applianceSchedules.map((schedule) => (
                                      <div
                                        className={`schedule-item${schedule.is_active ? '' : ' schedule-inactive'}`}
                                        key={schedule.schedule_id}
                                      >
                                        <span className="schedule-indicator">
                                          {schedule.is_active ? <span /> : <IonIcon aria-hidden="true" icon={closeOutline} />}
                                        </span>
                                        <div className="schedule-copy">
                                          <strong>{schedule.days_of_week.join(' · ')}</strong>
                                          <span>
                                            {schedule.hours_per_day}{' '}
                                            {Number(schedule.hours_per_day) === 1 ? 'hour' : 'hours'}/day
                                            {schedule.start_time ? ` · starting ${schedule.start_time.slice(0, 5)}` : ''}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          role="switch"
                                          disabled={busy} aria-checked={schedule.is_active}
                                          className={`spring-switch${schedule.is_active ? ' is-on' : ''}`}
                                          aria-label={`${schedule.is_active ? 'Pause' : 'Activate'} schedule`}
                                          onClick={() => setScheduleActive(schedule, !schedule.is_active)}
                                        >
                                          <span className="switch-thumb" />
                                        </button>
                                        <button
                                          className="icon-button subtle-icon"
                                          title="Edit schedule"
                                          onClick={() => {
                                            setActiveScenario(appliance);
                                            setEditingSchedule(schedule);
                                            openModal('schedule', {
                                              hours_per_day: schedule.hours_per_day,
                                              start_time: schedule.start_time?.slice(0, 5) || '',
                                            });
                                          }}
                                        >
                                          <IonIcon aria-hidden="true" icon={createOutline} />
                                        </button>
                                        <button
                                          className="icon-button delete-button subtle-icon"
                                          title="Delete schedule"
                                          onClick={() => deleteSchedule(schedule)}
                                        >
                                          <IonIcon aria-hidden="true" icon={trashOutline} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="schedule-empty">
                                    <IonIcon aria-hidden="true" icon={timeOutline} />
                                    <span>No schedule yet. Add one to estimate usage.</span>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <span className="empty-state-symbol">
                            <IonIcon aria-hidden="true" icon={flashOutline} />
                          </span>
                          <h3>No appliances yet.</h3>
                          <IonButton className="primary-button" onClick={openCreateAppliance}>
                            <IonIcon aria-hidden="true" icon={addOutline} slot="start" />
                            Add Appliance
                          </IonButton>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {!loading && page === 'history' && (
                <section className="view">
                  <article className="history-callout">
                    <div>
                      <span className="eyebrow">Estimated bill and usage</span>
                      <h2>
                        {hasUsage ? (
                          <>
                            {fmtKwh(dashboard?.current_kwh)} <span>kWh</span>
                            <span className="history-divider">·</span>
                            {Number(selectedRate?.rate_per_kwh) > 0
                              ? fmtMoney(dashboard?.estimated_cost)
                              : 'Set your rate'}
                          </>
                        ) : (
                          'No estimate yet'
                        )}
                      </h2>
                      <p>
                        {hasUsage
                          ? `Billing period: ${PERIOD_LABEL}. Only active schedules are included.`
                          : 'Add an appliance and usage schedule to estimate your bill.'}
                      </p>
                    </div>
                    {hasUsage && (
                      <IonButton className="primary-button compact-button" onClick={calculateCurrentPeriod}>
                        <IonIcon aria-hidden="true" icon={pulseOutline} slot="start" />
                        Save this period
                      </IonButton>
                    )}
                  </article>
                  <div className="section-row">
                    <div>
                      <h2>Billing periods</h2>
                    </div>
                  </div>
                  {bills.length ? (
                    <div className="bill-table-wrap" role="region" aria-label="Billing history, scroll horizontally for all columns" tabIndex={0}>
                      <table className="bill-table">
                        <thead>
                          <tr>
                            <th>BILLING PERIOD</th>
                            <th>PROVIDER & RATE</th>
                            <th>ESTIMATED USAGE</th>
                            <th>ESTIMATED BILL</th>
                            <th>ACTUAL BILL</th>
                            <th scope="col">DIFFERENCE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bills.map((bill) => (
                            <tr key={bill.bill_id}>
                              <td>
                                <strong>
                                  {new Date(`${bill.period_start}T00:00:00`).toLocaleString('en', {
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </strong>
                                <span>
                                  {bill.period_start} — {bill.period_end}
                                </span>
                              </td>
                              <td>
                                <strong>{bill.provider_name}</strong>
                                <span>₱{Number(bill.rate_per_kwh).toFixed(2)} / kWh</span>
                              </td>
                              <td>
                                <strong>
                                  {fmtKwh(bill.total_kwh)} <span>kWh</span>
                                </strong>
                              </td>
                              <td>
                                <strong>{fmtMoney(bill.estimated_cost)}</strong>
                              </td>
                              <td>
                                {bill.actual_bill_amount != null ? (
                                  <strong>{fmtMoney(bill.actual_bill_amount)}</strong>
                                ) : (
                                  <button
                                    className="add-actual"
                                    onClick={() => {
                                      setActiveScenario(bill);
                                      openModal('actual-bill');
                                    }}
                                  >
                                    + Add actual bill
                                  </button>
                                )}
                              </td>
                              <td>
                                {bill.actual_bill_amount != null ? (
                                  <span
                                    className={`bill-delta${
                                      Number(bill.actual_bill_amount) >= Number(bill.estimated_cost)
                                        ? ' delta-warm'
                                        : ''
                                    }`}
                                    title="Actual bill compared with estimate"
                                  >
                                    {Number(bill.actual_bill_amount) >= Number(bill.estimated_cost) ? '+' : '−'}
                                    {fmtMoney(Math.abs(Number(bill.actual_bill_amount) - Number(bill.estimated_cost)))}
                                  </span>
                                ) : (
                                  <IonIcon aria-hidden="true" className="bill-arrow" icon={chevronForwardOutline} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-inline history-empty">
                      <span className="empty-icon">
                        <IonIcon aria-hidden="true" icon={calendarClearOutline} />
                      </span>
                      <div>
                        <strong>No billing periods saved yet.</strong>
                        <p>
                          Add appliances and active usage schedules to create your first estimate and billing period.
                        </p>
                      </div>
                      <button className="plain-link" onClick={() => changePage('appliances')}>
                        Manage appliances <IonIcon aria-hidden="true" icon={chevronForwardOutline} />
                      </button>
                    </div>
                  )}
                </section>
              )}

              {!loading && page === 'insights' && (
                <section className="view insights-view">
                  <div className="section-row"><div><h2>Suggestions for your home</h2><p>Based on your current appliance schedules.</p></div><span className="plain-meta">{recommendations.length}</span></div>
                  {!recommendations.length && <div className="empty-inline"><p>No suggestions yet. Add appliances and active schedules, or revisit after updating your usage.</p></div>}
                  <div className="smart-insights-list">
                    {recommendations.map((recommendation) => (
                      <article className="recommendation-card" key={recommendation.recommendation_id}>
                        <div className="recommendation-content">
                          <strong className="recommendation-title">{recommendation.appliance_name || 'Home'}</strong>
                          <p>{recommendation.message}</p>
                          {(Number(recommendation.potential_savings_kwh) > 0 ||
                            Number(recommendation.potential_savings_cost) > 0) && (
                            <div className="recommendation-savings">
                              <span>
                                <IonIcon aria-hidden="true" icon={trendingDownOutline} /> Potential savings
                              </span>
                              <strong>
                                {Number(recommendation.potential_savings_kwh) > 0 && (
                                  <>{fmtKwh(recommendation.potential_savings_kwh)} kWh</>
                                )}
                                {Number(recommendation.potential_savings_kwh) > 0 &&
                                  Number(recommendation.potential_savings_cost) > 0 &&
                                  ' · '}
                                {Number(recommendation.potential_savings_cost) > 0 &&
                                  fmtMoney(recommendation.potential_savings_cost)}
                              </strong>
                            </div>
                          )}
                        </div>
                        <button
                          className="dismiss-button"
                          onClick={() => dismissRecommendation(recommendation.recommendation_id)}
                        >
                          Dismiss <IonIcon aria-hidden="true" icon={closeOutline} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!!recommendations.length && (
                    <p className="recommendation-note">Potential savings are estimates from the suggested schedule changes and your configured rate. Actual usage may differ.</p>
                  )}
                </section>
              )}

              {!loading && page === 'scenarios' && (
                <section className="view">
                  <p className="scenario-instruction">
                    Adjust appliance usage to compare estimated costs. Previews and saved plans never change your appliance schedules.
                  </p>
                  <div className="scenario-actions">
                    <button
                      className="text-action scenario-create"
                      onClick={() => openModal('scenario-create')}
                      disabled={!appliances.length}
                    >
                      <IonIcon aria-hidden="true" icon={addOutline} /> Make a plan
                    </button>
                  </div>
                  <div className="section-row">
                    <div>
                      <h2>Saved plans</h2>
                    </div>
                    <span className="plain-meta">{scenarios.length}</span>
                  </div>
                  {(scenarios.length > 0 || scenarioResults) ? (
                    <div className="scenario-layout">
                      <div className="scenario-list">
                        {scenarios.map((scenario, index) => (
                          <article
                            className={`scenario-row${
                              activeScenario?.scenario_id === scenario.scenario_id ? ' scenario-row-active' : ''
                            }`}
                            key={scenario.scenario_id}
                          >
                            <button className="scenario-open" onClick={() => showScenario(scenario)}>
                              <span className={`scenario-index scenario-index-${index % 3}`}>0{index + 1}</span>
                              <span className="scenario-row-copy">
                                <strong>{scenario.scenario_name}</strong>
                                <span>
                                  Saved{' '}
                                  {new Date(`${scenario.created_at}Z`).toLocaleDateString('en', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </span>
                              </span>
                              <span className="scenario-row-result">
                                {fmtMoney(scenario.scenario_cost)}
                                <span>estimated bill</span>
                              </span>
                              <IonIcon aria-hidden="true" icon={chevronForwardOutline} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`Delete ${scenario.scenario_name}`}
                              onClick={() => deleteScenario(scenario)}
                            >
                              <IonIcon aria-hidden="true" icon={trashOutline} />
                            </button>
                          </article>
                        ))}
                      </div>
                      {scenarioResults && (
                        <article className="scenario-result">
                          <h3>Comparison</h3>
                          <div className="compare-item">
                            <span>Current estimated bill</span>
                            <strong>{fmtMoney(scenarioResults.current_cost)}</strong>
                            <small>{fmtKwh(scenarioResults.current_kwh)} kWh</small>
                          </div>
                          <div className="compare-item compare-proposed">
                            <span>What-if estimated bill</span>
                            <strong>{fmtMoney(scenarioResults.scenario_cost)}</strong>
                            <small>{fmtKwh(scenarioResults.scenario_kwh)} kWh</small>
                          </div>
                          <div
                            className={`compare-difference${
                              Number(scenarioResults.savings_cost) >= 0 ? '' : ' compare-increase'
                            }`}
                          >
                            <IonIcon aria-hidden="true"
                              icon={Number(scenarioResults.savings_cost) >= 0 ? trendingDownOutline : arrowUpOutline}
                            />
                            <span>{Number(scenarioResults.savings_cost) >= 0 ? 'Potential savings' : 'Potential increase'}</span>
                            <strong>{fmtMoney(Math.abs(Number(scenarioResults.savings_cost)))}</strong>
                          </div>
                          {scenarioResults.items?.length > 0 && (
                            <div className="scenario-saved-items">
                              <div className="eyebrow">SAVED ADJUSTMENTS</div>
                              {scenarioResults.items.map((item) => (
                                <div key={item.appliance_id}>
                                  <span>{item.appliance_name}</span>
                                  <strong>
                                    {item.adjusted_hours_per_day != null
                                      ? `${Number(item.adjusted_hours_per_day)} hrs/day`
                                      : 'Current hours'}
                                    <span> · </span>
                                    {item.adjusted_quantity != null
                                      ? `${item.adjusted_quantity} units`
                                      : 'Current quantity'}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      )}
                    </div>
                  ) : (
                    <div className="empty-inline scenario-empty">
                      <span className="empty-icon">
                        <IonIcon aria-hidden="true" icon={bulbOutline} />
                      </span>
                      <div>
                        <strong>No plans yet.</strong>
                        <p>Create a plan to compare costs without changing your appliance schedules.</p>
                      </div>
                      {appliances.length > 0 && (
                        <button className="plain-link" onClick={() => openModal('scenario-create')}>
                          Make a plan <IonIcon aria-hidden="true" icon={chevronForwardOutline} />
                        </button>
                      )}
                    </div>
                  )}
                  {appliances.length > 0 && (
                    <>
                      <div className="section-row scenario-edit-heading">
                        <div>
                          <h2>Preview adjustments</h2>
                        </div>
                        <span className="plain-meta">Changes are not saved.</span>
                      </div>
                      <form className="scenario-preview-card" onSubmit={runScenario}>
                        <div className="preview-head">
                          <span>Appliance</span>
                          <span>Hours / day</span>
                          <span>Quantity</span>
                        </div>
                        {appliances.map((appliance) => (
                          <div className="preview-row" key={appliance.appliance_id}>
                            <strong>{appliance.appliance_name}</strong>
                            <label>
                              <span>Hours / day</span>
                              <input
                                className="small-native-input"
                                type="number"
                                aria-label={`Hours per day for ${appliance.appliance_name}`} name={`scenario_hours_${appliance.appliance_id}`}
                                min="0"
                                max="24"
                                step=".25"
                                placeholder={String(Number(appliance.average_hours_per_day || 0).toFixed(1))}
                              />
                            </label>
                            <label>
                              <span>Quantity</span>
                              <input
                                className="small-native-input"
                                type="number"
                                aria-label={`Quantity for ${appliance.appliance_name}`} name={`scenario_quantity_${appliance.appliance_id}`}
                                min="1"
                                step="1"
                                placeholder={String(appliance.quantity)}
                              />
                            </label>
                          </div>
                        ))}
                        <div className="preview-actions">
                          <span>Leave a field empty to keep its current setting.</span>
                          <button type="submit" className="plain-link" disabled={busy}>
                            <IonIcon aria-hidden="true" icon={playOutline} /> Preview changes
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </section>
              )}

              {page === 'settings' && (
                <section className="view">
                  <div className="section-row">
                    <div>
                      <h2>Account settings</h2>
                    </div>
                  </div>
                  <AccountSettings
                    user={user}
                    providers={connectedProviders}
                    onSave={saveProfile}
                    onConnect={connectProvider}
                    onChangePassword={changePassword}
                    saving={busy}
                    error={error}
                  />
                  <button className="logout-modal-button settings-signout" onClick={handleLogout}>
                    <IonIcon aria-hidden="true" icon={logOutOutline} /> Sign out of Energeia
                  </button>
                </section>
              )}
            </div>
          </main>

        </div>
      </div>
      {createPortal(
        <nav
          className="mobile-nav mobile-nav-portal"
          aria-label="Main navigation"
          style={{
            display: 'grid',
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(48px + env(safe-area-inset-bottom))',
            zIndex: 2147483647,
            minHeight: '58px',
          }}
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`mobile-nav-item${page === item.id ? ' mobile-nav-item-active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => changePage(item.id)}
            >
              <div className="mobile-nav-pill">
                <IonIcon aria-hidden="true" icon={item.icon} />
              </div>
              <span>{item.mobileLabel}</span>
            </button>
          ))}
        </nav>,
        document.body,
      )}
      <IonToast isOpen={!!notice} message={notice} duration={3000} position="top" onDidDismiss={() => setNotice('')} />

      <Modal isOpen={modal === 'appliance'} onClose={() => setModal('')} title={editingAppliance ? 'Edit appliance' : 'Add appliance'} subtitle={editingAppliance ? 'Saved usage history will be preserved.' : 'Add a schedule after saving to estimate usage.'}>
        <ModalForm busy={busy} error={error} onSubmit={saveAppliance} button={editingAppliance ? 'Save changes' : 'Add appliance'}>
          <Field label="Appliance name"><IonInput aria-label="Appliance name" className="form-input" name="appliance_name" placeholder="e.g. Living room air conditioner" value={formFields.appliance_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <div className="form-row"><Field label="Category"><IonSelect aria-label="Category" className="form-input form-select" name="category" value={formFields.category ?? 'Cooling'} onIonChange={updateFormField} interface="popover">{CATEGORIES.map((category) => <IonSelectOption key={category} value={category}>{category}</IonSelectOption>)}</IonSelect></Field><Field label="Wattage"><IonInput aria-label="Wattage" className="form-input" name="wattage" type="number" min="0.01" max="100000" step="any" placeholder="e.g. 950" value={formFields.wattage ?? ''} onIonInput={updateFormField} required /><span className="field-hint">Look for the W rating on the label.</span></Field></div>
          <Field label="Number in your household"><IonInput aria-label="Quantity" className="form-input" name="quantity" type="number" min="1" max="999" step="1" value={formFields.quantity ?? 1} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'schedule'} onClose={() => setModal('')} title={editingSchedule ? 'Edit schedule' : 'Add usage schedule'} subtitle={activeScenario?.appliance_name || 'Appliance'}>
        <ModalForm busy={busy} error={error} key={`${editingSchedule?.schedule_id || activeScenario?.appliance_id || 'new'}`} onSubmit={saveSchedule} button="Save schedule">
          <div className="field-label">Days of the week<div className="weekday-grid">{WEEKDAYS.map((day) => { const checked = editingSchedule?.days_of_week.includes(day) ?? false; return <label className="weekday-chip" key={day}><input type="checkbox" name="days" value={day} defaultChecked={checked} /><span>{day.slice(0, 1)}</span><small>{day}</small></label>; })}</div></div>
          <Field label="Operating hours per day" hint="An estimate is just fine. Add another schedule if the hours change on different days."><IonInput aria-label="Hours per day" className="form-input" name="hours_per_day" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 8" value={formFields.hours_per_day ?? ''} onIonInput={updateFormField} required /></Field>
          <Field label="Usual start time"><IonInput aria-label="Start time" className="form-input" name="start_time" type="time" value={formFields.start_time ?? ''} onIonInput={updateFormField} /></Field>
          <label className="check-field"><input type="checkbox" name="is_active" defaultChecked={editingSchedule?.is_active ?? true} /><span>Include this schedule in my energy estimates</span></label>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'household'} onClose={() => { setModal(''); setEditingHousehold(null); }} title={editingHousehold ? 'Edit household' : 'Add household'}>
        <ModalForm busy={busy} error={error} onSubmit={saveHousehold} button={editingHousehold ? 'Save household details' : 'Add household'}>
          <Field label="Household name"><IonInput aria-label="Household name" className="form-input" name="household_name" placeholder="e.g. Weekend cottage" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Address"><IonInput aria-label="Address" className="form-input" name="address" placeholder="City or neighbourhood (optional)" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'account'} onClose={() => setModal('')} title="Account">
        <div className="account-card-content"><span className="account-detail-avatar">{signedInInitial}</span><div className="account-detail"><span className="eyebrow">YOUR ACCOUNT</span><strong>{user.full_name || user.email}</strong><span>{user.email}</span></div></div>
        <button className="text-button account-settings-link" onClick={() => { setModal(''); changePage('settings'); }}>Manage account settings</button>
        <button className="logout-modal-button" onClick={handleLogout}><IonIcon aria-hidden="true" icon={logOutOutline} /> Sign out of Energeia</button>
      </Modal>

      <Modal isOpen={modal === 'rate'} onClose={() => setModal('')} title="Electricity rate" subtitle="Saved bills keep their original rate.">
        <ModalForm busy={busy} error={error} onSubmit={saveRate} button="Save electricity rate" note={Number(selectedRate?.rate_per_kwh) > 0 ? `Current: ${selectedRate.provider_name} · ₱${Number(selectedRate.rate_per_kwh).toFixed(2)} per kWh` : 'Your first provider and rate will be used in future bill estimates.'}>
          <Field label="Electricity provider"><IonInput aria-label="Provider name" className="form-input" name="provider_name" placeholder="e.g. Meralco" value={formFields.provider_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Rate per kilowatt-hour (₱/kWh)" hint="Usually listed on your electricity bill."><IonInput aria-label="Rate per kwh" className="form-input" name="rate_per_kwh" type="number" min="0.0001" max="999999" step=".0001" placeholder="e.g. 11.5000" value={formFields.rate_per_kwh ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'actual-bill'} onClose={() => setModal('')} title="Add actual bill" subtitle={`Your estimate for ${activeScenario?.period_start || ''} will be kept.`}>
        <ModalForm busy={busy} error={error} onSubmit={saveActualBill} button="Save actual bill">
          <Field label="Actual bill amount (₱)"><IonInput aria-label="Actual bill amount" className="form-input" name="actual_bill_amount" type="number" min="0" max="999999999" step=".01" placeholder="e.g. 2,486.50" value={formFields.actual_bill_amount ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'scenario-create'} onClose={() => setModal('')} title="Save what-if plan" subtitle="Saving a plan does not change appliance schedules.">
        <ModalForm busy={busy} error={error} onSubmit={saveScenario} button="Save my what-if plan">
          <Field label="Give your idea a name"><IonInput aria-label="Scenario name" className="form-input" name="scenario_name" placeholder="e.g. Quieter air-con evenings" value={formFields.scenario_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          {appliances.map((appliance) => <div className="scenario-form-appliance" key={appliance.appliance_id}><strong>{appliance.appliance_name}</strong><div><label className="inline-field">Hours/day<input className="small-native-input" type="number" name={`hours_${appliance.appliance_id}`} min="0" max="24" step=".25" placeholder={Number(appliance.average_hours_per_day || 0).toFixed(1)} /></label><label className="inline-field">Quantity<input className="small-native-input" type="number" name={`quantity_${appliance.appliance_id}`} min="1" max="999" step="1" placeholder={String(appliance.quantity)} /></label></div><span>Leave blank to keep the current setting.</span></div>)}
        </ModalForm>
      </Modal>
  </IonApp>;
}

export default function App() { return <BrowserRouter><EnergiaApp /></BrowserRouter>; }
