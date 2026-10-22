import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonApp, IonButton, IonContent, IonIcon, IonInput, IonModal, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonToast, setupIonicReact,
} from '@ionic/react';
import {
  addOutline, arrowUpOutline, bulbOutline, calendarClearOutline,
  checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline,
  closeOutline, createOutline, ellipsisHorizontal, flashOutline, gridOutline,
  helpCircleOutline, homeOutline, leafOutline, logOutOutline, logoGithub, logoGoogle,
  menuOutline, moonOutline, notificationsOutline, playOutline, pulseOutline,
  searchOutline, settingsOutline, shareSocialOutline, sparklesOutline, sunnyOutline,
  timeOutline, trashOutline, trendingDownOutline, warningOutline, waterOutline,
} from 'ionicons/icons';
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

function Logo({ small = false }) {
  return (
    <div className={`brand${small ? ' brand-small' : ''}`}>
      <img className="brand-image" src="/energeia-logo.png" alt="" aria-hidden="true" />
      <span>energeia<span className="brand-dot">.</span></span>
    </div>
  );
}

function SemiCircleGauge({ value = 2.4, max = 5.0, unit = 'kWh' }) {
  const numericVal = parseFloat(value) || 2.4;
  const percentage = Math.min(Math.max(numericVal / max, 0), 1);
  const radius = 68;
  const circumference = Math.PI * radius; // ~213.63
  const strokeDashoffset = circumference * (1 - percentage);

  return (
    <div className="gauge-widget">
      <div className="gauge-svg-wrap">
        <svg viewBox="0 0 176 96" className="gauge-svg">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0066FF" />
              <stop offset="60%" stopColor="#00A3FF" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M 20 86 A 68 68 0 0 1 156 86"
            fill="none"
            className="gauge-track"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 20 86 A 68 68 0 0 1 156 86"
            fill="none"
            stroke="url(#gaugeGradient)"
            className="gauge-fill"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            filter="url(#gaugeGlow)"
          />
        </svg>
        <div className="gauge-center-badge">
          <IonIcon icon={flashOutline} className="gauge-bolt-icon" />
          <div className="gauge-center-val">
            <strong>{numericVal}</strong>
            <small>{unit}</small>
          </div>
        </div>
      </div>
      <div className="gauge-scale-labels">
        <span>0 {unit}</span>
        <span className="gauge-now-tag">Now</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}

function SavingsDonut({ percentage = 67, label = 'GOAL REACHED' }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius; // ~326.73
  const strokeDashoffset = circumference * (1 - percentage / 100);

  return (
    <div className="savings-donut-container">
      <div className="savings-donut-svg-wrap">
        <svg viewBox="0 0 136 136" className="savings-donut-svg">
          <defs>
            <linearGradient id="donutProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#0F4A38" />
            </linearGradient>
          </defs>
          <circle
            cx="68"
            cy="68"
            r={radius}
            fill="none"
            className="donut-track"
            strokeWidth="13"
          />
          <circle
            cx="68"
            cy="68"
            r={radius}
            fill="none"
            stroke="url(#donutProgressGradient)"
            className="donut-fill"
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 68 68)"
          />
        </svg>
        <div className="donut-center-content">
          <strong className="donut-center-pct">{percentage}%</strong>
          <span className="donut-center-label">{label}</span>
        </div>
      </div>
      <div className="savings-breakdown-list">
        <div className="savings-item">
          <div className="savings-item-label">
            <span className="savings-dot dot-eco" />
            <span>Eco Generated</span>
          </div>
          <strong>$124.50</strong>
        </div>
        <div className="savings-item">
          <div className="savings-item-label">
            <span className="savings-dot dot-grid" />
            <span>Grid Savings</span>
          </div>
          <strong>$42.10</strong>
        </div>
      </div>
    </div>
  );
}

function CategoryDonut({ centerValue = '2.4kWh' }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius; // ~314.16
  const slices = [
    { label: 'AC', pct: 40, color: '#F59E0B' },
    { label: 'Fridge', pct: 20, color: '#EC4899' },
    { label: 'Water Heater', pct: 15, color: '#0066FF' },
    { label: 'Lights', pct: 10, color: '#10B981' },
    { label: 'Other', pct: 15, color: '#64748B' },
  ];

  let cumulativeOffset = 0;

  return (
    <div className="category-donut-container">
      <div className="category-donut-svg-wrap">
        <svg viewBox="0 0 130 130" className="category-donut-svg">
          {slices.map((slice) => {
            const dashLength = (slice.pct / 100) * circumference;
            const offset = -(cumulativeOffset / 100) * circumference;
            cumulativeOffset += slice.pct;
            return (
              <circle
                key={slice.label}
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={offset}
                transform="rotate(-90 65 65)"
                className="category-slice"
              />
            );
          })}
        </svg>
        <div className="category-donut-center">
          <strong>{centerValue}</strong>
        </div>
      </div>
      <div className="category-legend-grid">
        {slices.map((slice) => (
          <div key={slice.label} className="category-legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: slice.color }} />
            <span className="legend-label">{slice.label}</span>
            <strong className="legend-pct">{slice.pct}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function InteractiveBarChart({ bars, maxBar, timeFilter, onTimeFilterChange }) {
  const [hoveredDay, setHoveredDay] = useState(null);

  const defaultWeekly = [
    { day: 'MON', kwh: 1.8, height: '42%' },
    { day: 'TUE', kwh: 3.2, height: '92%', peak: true, tooltip: '3.2 kW' },
    { day: 'WED', kwh: 2.1, height: '52%' },
    { day: 'THU', kwh: 3.0, height: '86%' },
    { day: 'FRI', kwh: 2.2, height: '55%' },
    { day: 'SAT', kwh: 1.6, height: '38%' },
    { day: 'SUN', kwh: 2.7, height: '74%' },
  ];

  const chartData = bars && bars.length > 0 && bars.some((b) => Number(b.kwh) > 0)
    ? bars.map((b, i) => ({
        day: b.day.toUpperCase(),
        kwh: Number(b.kwh),
        height: `${Math.max(14, Math.round((Number(b.kwh) / (maxBar || 1)) * 92))}%`,
        peak: b.highlight || i === 1,
        tooltip: `${fmtKwh(b.kwh)} kW`,
      }))
    : defaultWeekly;

  return (
    <div className="chart-card realtime-usage-panel">
      <div className="usage-panel-top">
        <div>
          <h3>Real-time Usage</h3>
          <p>Power consumption by hour (kW)</p>
        </div>
        <div className="time-select-pill">
          <select
            value={timeFilter}
            onChange={(e) => onTimeFilterChange(e.target.value)}
            aria-label="Filter usage time range"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <IonIcon icon={chevronDownOutline} />
        </div>
      </div>
      <div className="usage-chart-canvas">
        <div className="usage-bars-row">
          {chartData.map((item) => {
            const isHovered = hoveredDay === item.day;
            const isPeak = item.peak;
            return (
              <div
                key={item.day}
                className={`usage-bar-col${isPeak ? ' is-peak' : ''}${isHovered ? ' is-hovered' : ''}`}
                onMouseEnter={() => setHoveredDay(item.day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {(isPeak || isHovered) && (
                  <div className={`bar-tooltip-pill${isHovered ? ' tooltip-active' : ''}`}>
                    {item.tooltip || `${item.kwh} kW`}
                  </div>
                )}
                <div className="bar-track-channel">
                  <div className="bar-fill-pillar" style={{ height: item.height }} />
                </div>
                <span className="bar-day-name">{item.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
      <IonIcon icon={darkMode ? sunnyOutline : moonOutline} />
    </button>
  );
}

function AuthScreen({ onLogin, darkMode, onToggleTheme, oauthError, resetToken }) {
  const [view, setView] = useState(resetToken ? 'reset' : 'login');
  const [registrationStep, setRegistrationStep] = useState(1);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setError('');
    try {
      const result = await request(`/auth/oauth/${provider}/start`, { method: 'POST' });
      window.location.assign(result.authorization_url);
    } catch (exception) {
      setError(exception.message);
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
        setView('login');
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
    setView(nextView);
    setRegistrationStep(1);
    setError('');
    setSuccess('');
  }

  return (
    <main className="auth-page">
      <div className="auth-left">
        <Logo />
      </div>
      <div className="auth-right">
        <form className={`auth-card auth-card-${view}`} onSubmit={submit}>
          <div className="auth-mini"><Logo small /><ThemeToggle darkMode={darkMode} onToggle={onToggleTheme} /></div>
          <div className="auth-welcome"><h2>{title}</h2></div>
          {!['forgot', 'reset'].includes(view) && <>
            <button className="social-auth-button" type="button" onClick={() => beginOAuth('google')} disabled={loading}>
              <IonIcon icon={logoGoogle} /> Continue with Google
            </button>
            <button className="social-auth-button" type="button" onClick={() => beginOAuth('github')} disabled={loading}>
              <IonIcon icon={logoGithub} /> Continue with GitHub
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>}
          {registering && registrationStep === 2 && <div className="auth-progress" aria-label="Registration step 2 of 2">Step 2 of 2 · Home address</div>}
          {registering && registrationStep === 1 && <div className="auth-form-grid">
            <label className="field-label">First name<IonInput className="form-input" name="first_name" autocomplete="given-name" value={credentials.first_name} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Last name<IonInput className="form-input" name="last_name" autocomplete="family-name" value={credentials.last_name} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Middle name <span className="field-hint">Optional</span><IonInput className="form-input" name="middle_name" autocomplete="additional-name" value={credentials.middle_name} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label">Email address<IonInput className="form-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>
            <label className="field-label">Password<div className="password-input-wrap"><IonInput className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password} onIonInput={updateCredential} required minlength={8} maxlength={128} /><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <label className="field-label">Confirm password<IonInput className="form-input" name="password_confirmation" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password_confirmation} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
          </div>}
          {registering && registrationStep === 2 && <div className="auth-form-grid">
            <label className="field-label">Country<IonInput className="form-input" name="country" autocomplete="country-name" value={credentials.country} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Province / State / Region<IonInput className="form-input" name="region" autocomplete="address-level1" value={credentials.region} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">City / Municipality<IonInput className="form-input" name="city" autocomplete="address-level2" value={credentials.city} onIonInput={updateCredential} required maxlength={100} /></label>
            <label className="field-label">Barangay <span className="field-hint">Optional</span><IonInput className="form-input" name="barangay" value={credentials.barangay} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label auth-grid-full">Street address<IonInput className="form-input" name="street_address" autocomplete="street-address" value={credentials.street_address} onIonInput={updateCredential} required maxlength={255} /></label>
            <label className="field-label">House / Unit <span className="field-hint">Optional</span><IonInput className="form-input" name="unit_number" value={credentials.unit_number} onIonInput={updateCredential} maxlength={100} /></label>
            <label className="field-label">Postal code <span className="field-hint">Optional</span><IonInput className="form-input" name="postal_code" autocomplete="postal-code" value={credentials.postal_code} onIonInput={updateCredential} maxlength={32} /></label>
            <label className="field-label">Phone number <span className="field-hint">Optional</span><IonInput className="form-input" name="phone_number" type="tel" autocomplete="tel" value={credentials.phone_number} onIonInput={updateCredential} maxlength={32} /></label>
            <label className="consent-field auth-grid-full"><input type="checkbox" name="terms_accepted" checked={credentials.terms_accepted} onChange={(event) => setCredentials((previous) => ({ ...previous, terms_accepted: event.target.checked }))} required /><span>I agree to the Terms of Service and Privacy Policy.</span></label>
            <p className="address-privacy-note auth-grid-full">Your home location helps personalize household energy settings. Your full address is private and is not shown on the dashboard.</p>
          </div>}
          {view === 'login' && <>
            <label className="field-label">Email address<IonInput className="form-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>
            <label className="field-label">Password<div className="password-input-wrap"><IonInput className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" value={credentials.password} onIonInput={updateCredential} required maxlength={128} /><button className="password-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <button className="forgot-password-link" type="button" onClick={() => changeView('forgot')}>Forgot password?</button>
          </>}
          {view === 'forgot' && <label className="field-label">Email address<IonInput className="form-input" name="email" type="email" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>}
          {view === 'reset' && <>
            <label className="field-label">New password<IonInput className="form-input" name="password" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
            <label className="field-label">Confirm new password<IonInput className="form-input" name="password_confirmation" type={showPassword ? 'text' : 'password'} autocomplete="new-password" value={credentials.password_confirmation} onIonInput={updateCredential} required minlength={8} maxlength={128} /></label>
          </>}
          {oauthError && <div className="inline-error">{oauthError}</div>}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {success && <div className="form-note" role="status">{success}</div>}
          {registering && registrationStep === 2 && <button className="text-button auth-back" type="button" onClick={() => setRegistrationStep(1)}>Back to personal information</button>}
          <IonButton type="submit" expand="block" className="primary-button auth-submit" disabled={loading}>
            {loading ? <IonSpinner name="crescent" /> : <>{registering ? (registrationStep === 1 ? 'Continue' : 'Create Account') : view === 'login' ? 'Sign In' : view === 'forgot' ? 'Send reset link' : 'Update password'} <IonIcon icon={chevronForwardOutline} slot="end" /></>}
          </IonButton>
          {view === 'login' || registering ? <p className="auth-switch">{registering ? 'Already have an account?' : "Don't have an account?"} <button className="text-button" type="button" onClick={() => changeView(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Sign up'}</button></p> : <p className="auth-switch"><button className="text-button" type="button" onClick={() => changeView('login')}>Back to sign in</button></p>}
        </form>
      </div>
    </main>
  );
}

function Modal({ isOpen, onClose, title, subtitle, children, wide = false }) {
  return <IonModal isOpen={isOpen} onDidDismiss={onClose} className={wide ? 'app-modal app-modal-wide' : 'app-modal'}><div className="modal-body"><header className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><IonIcon icon={closeOutline} /></button></header>{children}</div></IonModal>;
}

function ModalForm({ children, onSubmit, button, note, busy, error }) {
  return (
    <form className="modal-form" onSubmit={onSubmit}>{children}{error && <div className="inline-error">{error}</div>}
      {note && <div className="form-note"><IonIcon icon={checkmarkCircleOutline} /> {note}</div>}
      <IonButton expand="block" type="submit" className="primary-button" disabled={busy}>{busy ? <IonSpinner name="crescent" /> : <>{button}<IonIcon icon={chevronForwardOutline} slot="end" /></>}</IonButton>
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
        <Field label="First name"><IonInput className="form-input" name="first_name" autocomplete="given-name" value={profile.first_name} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Middle name (optional)"><IonInput className="form-input" name="middle_name" autocomplete="additional-name" value={profile.middle_name} onIonInput={update} maxlength={100} /></Field>
        <Field label="Last name"><IonInput className="form-input" name="last_name" autocomplete="family-name" value={profile.last_name} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Country"><IonInput className="form-input" name="country" autocomplete="country-name" value={profile.country} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Province / State / Region"><IonInput className="form-input" name="region" autocomplete="address-level1" value={profile.region} onIonInput={update} required maxlength={100} /></Field>
        <Field label="City / Municipality"><IonInput className="form-input" name="city" autocomplete="address-level2" value={profile.city} onIonInput={update} required maxlength={100} /></Field>
        <Field label="Barangay (optional)"><IonInput className="form-input" name="barangay" value={profile.barangay} onIonInput={update} maxlength={100} /></Field>
        <Field label="Street address"><IonInput className="form-input" name="street_address" autocomplete="street-address" value={profile.street_address} onIonInput={update} required maxlength={255} /></Field>
        <Field label="House / Unit number (optional)"><IonInput className="form-input" name="unit_number" value={profile.unit_number} onIonInput={update} maxlength={100} /></Field>
        <Field label="Postal code (optional)"><IonInput className="form-input" name="postal_code" autocomplete="postal-code" value={profile.postal_code} onIonInput={update} maxlength={32} /></Field>
        <Field label="Phone number (optional)"><IonInput className="form-input" name="phone_number" type="tel" autocomplete="tel" value={profile.phone_number} onIonInput={update} maxlength={32} /></Field>
      </div>
      <p className="address-privacy-note">Your home location helps personalize household energy settings. Your full address is private and is not shown on the dashboard.</p>
      {showConsent && <label className="consent-field"><input type="checkbox" name="terms_accepted" checked={profile.terms_accepted} onChange={update} required /><span>I agree to the Terms of Service and Privacy Policy.</span></label>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <IonButton type="submit" expand="block" className="primary-button" disabled={saving}>
        {saving ? <IonSpinner name="crescent" /> : <>Save and Continue <IonIcon icon={chevronForwardOutline} slot="end" /></>}
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
              <span>{provider === 'google' ? <IonIcon icon={logoGoogle} /> : <IonIcon icon={logoGithub} />} {provider === 'google' ? 'Google' : 'GitHub'}</span>
              {providers.includes(provider) ? <strong>Connected</strong> : <button className="text-button" type="button" disabled={!!pendingProvider} onClick={() => connect(provider)}>{pendingProvider === provider ? 'Connecting…' : 'Connect'}</button>}
            </div>
          ))}
          <div className="connected-method"><span>Email and password</span><strong>{providers.includes('password') ? 'Connected' : 'Not set up'}</strong></div>
        </div>
        {providers.includes('password') && <form className="password-change-form" onSubmit={submitPassword}>
          <h3>Change password</h3>
          <Field label="Current password"><IonInput className="form-input" name="current_password" type="password" autocomplete="current-password" value={password.current_password} onIonInput={(event) => setPassword((previous) => ({ ...previous, current_password: event.detail?.value ?? '' }))} required /></Field>
          <Field label="New password"><IonInput className="form-input" name="password" type="password" autocomplete="new-password" value={password.password} onIonInput={(event) => setPassword((previous) => ({ ...previous, password: event.detail?.value ?? '' }))} required minlength={8} maxlength={128} /></Field>
          <Field label="Confirm new password"><IonInput className="form-input" name="password_confirmation" type="password" autocomplete="new-password" value={password.password_confirmation} onIonInput={(event) => setPassword((previous) => ({ ...previous, password_confirmation: event.detail?.value ?? '' }))} required minlength={8} maxlength={128} /></Field>
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

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const darkMode = theme === 'dark';
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [page, setPage] = useState('overview');
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
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('24h');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [insightsTimeRange, setInsightsTimeRange] = useState('week');
  const [smartDeviceToggles, setSmartDeviceToggles] = useState({
    hvac: true,
    fridge: true,
    washer: true,
    charger: false,
  });
  const [mobileQuickToggles, setMobileQuickToggles] = useState({
    ac: true,
    fridge: false,
  });
  const currentHousehold = households.find((item) => item.household_id === Number(householdId));

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
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
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
    setUser(null);
    setHouseholds([]);
    setHouseholdId('');
    setDashboard(null);
  }, []);

  useEffect(() => {
    const callback = new URLSearchParams(window.location.hash.slice(1));
    const callbackToken = callback.get('access_token');
    const callbackResetToken = callback.get('password_reset');
    const callbackError = callback.get('oauth_error');
    if (callbackToken) localStorage.setItem('energeia_token', callbackToken);
    if (callbackResetToken) setResetToken(callbackResetToken);
    if (callbackError) {
      const messages = {
        account_exists: 'An account with this email already exists. Sign in with that account, then connect this provider in Account settings.',
        provider_already_linked: 'This provider is already connected to another Energeia account.',
        account_conflict: 'That provider sign-in is already in use. Sign in to the existing account or contact support.',
        sign_in_cancelled: 'Sign-in was cancelled.',
        expired_state: 'The sign-in request expired. Please try again.',
        invalid_state: 'The sign-in response could not be verified. Please try again.',
        provider_failure: 'The provider could not complete sign-in. Check your verified provider email and try again.',
      };
      setOauthError(messages[callbackError] || 'Sign-in could not be completed. Please try again.');
    }
    if (callbackToken || callbackResetToken || callbackError) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    const token = callbackToken || localStorage.getItem('energeia_token');
    if (!token) { setLoading(false); return; }
    request('/auth/me').then(setUser).catch(handleLogout).finally(() => setLoading(false));
  }, [handleLogout]);

  const refresh = useCallback(async (id = householdId, { calculate = false } = {}) => {
    if (!id) return;
    const query = `?household_id=${id}`;
    const [
      applianceData, householdData, rateData, billData, recommendationData, scenarioData,
    ] = await Promise.all([
      request(`/households/${id}/appliances`),
      request('/households'),
      request('/rates'),
      request(`/households/${id}/bills`),
      request(`/households/${id}/recommendations`),
      request(`/households/${id}/scenarios`),
    ]);
    const schedulesEntries = await Promise.all(
      applianceData.map(async (appliance) => [appliance.appliance_id, await request(`/appliances/${appliance.appliance_id}/schedules`)]),
    );
    let dashData;
    if (calculate) {
      await request(`/households/${id}/calculate`, { method: 'POST', body: {} });
      const [dashboardData, latestBills] = await Promise.all([
        request(`/households/${id}/dashboard${query}`),
        request(`/households/${id}/bills`),
      ]);
      dashData = dashboardData;
      setBills(latestBills);
    } else {
      dashData = await request(`/households/${id}/dashboard${query}`);
      setBills(billData);
    }
    setAppliances(applianceData);
    setHouseholds(householdData);
    setRates(rateData);
    setSchedules(Object.fromEntries(schedulesEntries));
    setRecommendations(recommendationData);
    setScenarios(scenarioData);
    setDashboard(dashData);
  }, [householdId]);

  const loadHouseholds = useCallback(async () => {
    const result = await request('/households');
    setHouseholds(result);
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
    loadHouseholds().catch((exception) => { setError(exception.message); setLoading(false); });
  }, [user, loadHouseholds]);

  useEffect(() => {
    if (!user?.profile_complete || !householdId) return;
    setLoading(true);
    refresh(householdId, { calculate: true })
      .catch((exception) => setError(exception.message))
      .finally(() => setLoading(false));
  }, [user, householdId, refresh]);

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
      const result = await request(`/auth/providers/${provider}/start`, { method: 'POST' });
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
      setNotice(result.message);
      return result.message;
    } catch (exception) {
      setError(exception.message);
      throw exception;
    } finally {
      setBusy(false);
    }
  }

  function changePage(next) {
    setPage(next);
    setMenuOpen(false);
    setError('');
    if (next === 'overview') refresh(householdId).catch((exception) => setError(exception.message));
  }

  if (loading && !user) return <IonApp><div className="app-loading"><Logo /><IonSpinner name="crescent" /></div></IonApp>;
  if (!user) return <IonApp><AuthScreen onLogin={(account) => { setUser(account); setLoading(true); }} darkMode={darkMode} onToggleTheme={toggleTheme} oauthError={oauthError} resetToken={resetToken} /></IonApp>;
  if (!user.profile_complete) return <IonApp>
    <main className="profile-completion-page">
      <header className="welcome-top"><Logo /><div className="welcome-actions"><ThemeToggle darkMode={darkMode} onToggle={toggleTheme} /><button className="signout-link" onClick={handleLogout}><IonIcon icon={logOutOutline} /> Sign out</button></div></header>
      <section className="profile-completion-card">
        <span className="eyebrow">One last step</span>
        <h1>Complete your profile</h1>
        <p>Your home location helps personalize household energy settings. The full address remains private.</p>
        <ProfileEditor user={user} onSave={saveProfile} saving={busy} error={error} showConsent={!user.terms_accepted} />
      </section>
    </main>
  </IonApp>;
  if (loading && !households.length) return <IonApp><div className="app-loading"><Logo /><IonSpinner name="crescent" /></div></IonApp>;

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
    if (!body.appliance_name || body.wattage <= 0 || body.quantity < 1) {
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
    if (!window.confirm(`Remove ${appliance.appliance_name}? Appliances with saved usage history cannot be deleted.`)) return;
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
    if (!days.length || body.hours_per_day <= 0 || body.hours_per_day > 24) {
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
    } catch (exception) { setError(exception.message); }
  }

  async function dismissRecommendation(recommendationId) {
    try {
      await act(() => request(`/recommendations/${recommendationId}`, { method: 'PATCH', body: { is_dismissed: true } }), { success: 'Recommendation dismissed.' });
    } catch { /* Keep the recommendation visible if the change was not saved. */ }
  }

  async function deleteScenario(scenario) {
    if (!window.confirm(`Delete “${scenario.scenario_name}”? This cannot be undone.`)) return;
    try {
      await act(() => request(`/households/${householdId}/scenarios/${scenario.scenario_id}`, { method: 'DELETE' }), { success: 'Scenario deleted.', reload: false });
      if (activeScenario?.scenario_id === scenario.scenario_id) { setActiveScenario(null); setScenarioResults(null); }
    } catch { /* Preserve the scenario until deletion succeeds. */ }
  }

  if (user && !households.length && !loading) {
    return <IonApp>
      <main className="welcome-page"><header className="welcome-top"><Logo /><div className="welcome-actions"><ThemeToggle darkMode={darkMode} onToggle={toggleTheme} /><button className="signout-link" onClick={handleLogout}><IonIcon icon={logOutOutline} /> Sign out</button></div></header>
        <section className="welcome-card"><div className="welcome-icon"><IonIcon icon={homeOutline} /></div>
          <h1>Set up your household</h1>
          <p>Add appliances and an electricity rate to estimate your energy use and bill.</p>
          <form className="welcome-form" onSubmit={saveHousehold}>
            <Field label="Household name"><IonInput className="form-input" name="household_name" placeholder="e.g. Our home" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
            <Field label="Address" hint="Optional"><IonInput className="form-input" name="address" placeholder="City or neighbourhood" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
            {error && <div className="inline-error">{error}</div>}
            <IonButton expand="block" type="submit" className="primary-button" disabled={busy}>{busy ? <IonSpinner name="crescent" /> : <>Set up my household <IonIcon icon={chevronForwardOutline} slot="end" /></>}</IonButton>
          </form>
        </section>
      </main>
      <IonToast isOpen={!!notice} message={notice} duration={2600} position="top" onDidDismiss={() => setNotice('')} />
    </IonApp>;
  }

  const bars = dashboard?.weekly || [];
  const maxBar = Math.max(1, ...bars.map((bar) => bar.kwh));
  const dismissError = () => setError('');
  const signedInInitial = (user?.full_name || 'U').trim().charAt(0).toUpperCase();

  return <IonApp>
    <IonPage>
      <IonContent fullscreen className="shell-content">
        <div className="app-shell">
          <aside id="app-sidebar" className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
            <Logo />
            <div className="sidebar-nav-section">
              <span className="sidebar-section-title">MENU</span>
              <nav className="side-nav" aria-label="Main navigation">
                {NAV.slice(0, 5).map((item, index) => (
                  <button
                    key={item.id}
                    className={`nav-link${page === item.id ? ' nav-link-active' : ''}`}
                    onClick={() => changePage(item.id)}
                  >
                    <span className="nav-number">0{index + 1}</span>
                    <IonIcon icon={item.icon} />
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
                  className={`nav-link${page === 'settings' ? ' nav-link-active' : ''}`}
                  onClick={() => changePage('settings')}
                >
                  <span className="nav-number">06</span>
                  <IonIcon icon={settingsOutline} />
                  <span>Account settings</span>
                  {page === 'settings' && <span className="nav-active-dot" />}
                </button>
                <button
                  className="nav-link"
                  type="button"
                  onClick={() => setNotice('Support: Reach out to our 24/7 team at support@energeia.app')}
                >
                  <IonIcon icon={helpCircleOutline} />
                  <span>Support</span>
                </button>
              </nav>
            </div>

            <div className="sidebar-spacer" />

            <div className="sidebar-cta-card">
              <div className="cta-head">
                <IonIcon icon={leafOutline} />
                <span className="cta-brand">Energeia Pro</span>
              </div>
              <p>Upgrade for smarter AI automation</p>
              <button
                type="button"
                className="sidebar-cta-btn"
                onClick={() => setNotice('Energeia Pro: Smart load balancing and tariff optimization active.')}
              >
                Get Pro
              </button>
            </div>

            <div className="side-account">
              <span className="avatar">{signedInInitial}</span>
              <span className="account-copy">
                <strong>{user?.full_name || user?.email}</strong>
                <span>Personal account</span>
              </span>
              <button className="account-out" title="Sign out" onClick={handleLogout}>
                <IonIcon icon={logOutOutline} />
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
                <IonIcon icon={menuOutline} />
              </button>

              <div className={`mobile-header-brand${page === 'overview' ? ' mobile-header-home' : ''}`}>
                <Logo small />
                <h1 className="mobile-page-title">{pageTitle}</h1>
              </div>

              <div className="topbar-search">
                <IonIcon icon={searchOutline} />
                <input
                  type="search"
                  placeholder="Search devices or metrics..."
                  aria-label="Search devices or metrics"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="breadcrumb">
                <span>My home</span>
                <IonIcon icon={chevronForwardOutline} />
                <span className="breadcrumb-current">{currentHousehold?.household_name || 'Your household'}</span>
              </div>

              <div className="topbar-right">
                {households.length > 1 && (
                  <div className="household-picker">
                    <IonIcon icon={homeOutline} />
                    <select
                      value={householdId}
                      aria-label="Select household"
                      onChange={(event) => { setDashboard(null); setHouseholdId(event.target.value); }}
                    >
                      {households.map((household) => (
                        <option key={household.household_id} value={household.household_id}>
                          {household.household_name}
                        </option>
                      ))}
                    </select>
                    <IonIcon icon={chevronDownOutline} />
                  </div>
                )}
                <button
                  className="text-action"
                  onClick={() => openModal('rate', Number(selectedRate?.rate_per_kwh) > 0 ? { provider_name: selectedRate.provider_name, rate_per_kwh: selectedRate.rate_per_kwh } : {})}
                >
                  <IonIcon icon={flashOutline} />
                  <span>{Number(selectedRate?.rate_per_kwh) > 0 ? 'Edit rate' : 'Set rate'}</span>
                </button>
                <button
                  className="text-action"
                  onClick={() => { setEditingHousehold(null); openModal('household'); }}
                >
                  <IonIcon icon={addOutline} />
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
                    <IonIcon icon={createOutline} />
                  </button>
                )}
                <ThemeToggle darkMode={darkMode} onToggle={toggleTheme} />
                <button
                  className="icon-button notification-bell-btn"
                  title="Notifications"
                  aria-label="Notifications"
                  onClick={() => setNotice('You are up to date. All appliances operating within normal limits.')}
                >
                  <IonIcon icon={notificationsOutline} />
                  <span className="notification-indicator-dot" />
                </button>
                <span className="header-divider" />
                <div
                  className="user-profile-snippet"
                  onClick={() => openModal('account')}
                  role="button"
                  tabIndex={0}
                  title={user?.full_name || user?.email}
                >
                  <div className="profile-text">
                    <strong className="profile-name">{user?.full_name || user?.email || 'Home Owner'}</strong>
                    <span className="profile-role">Home Owner</span>
                  </div>
                  <button
                    className="header-avatar"
                    aria-label={`Account: ${user?.full_name || user?.email}`}
                  >
                    {signedInInitial}
                  </button>
                </div>
              </div>
            </header>

            <div className="page-inner">
              <section className="page-intro">
                <div>
                  <span className="eyebrow">ENERGY OVERVIEW</span>
                  <h1>{pageTitle}</h1>
                  <p>Monitor and optimize your renewable energy flow in real-time.</p>
                </div>
                <div className="intro-actions">
                  <span className="update-stamp">
                    <IonIcon icon={calendarClearOutline} /> This billing period
                  </span>
                  <IonButton
                    className="primary-button add-device-pill-btn"
                    onClick={openCreateAppliance}
                  >
                    <IonIcon icon={addOutline} slot="start" /> Add Device
                  </IonButton>
                  <button
                    className="export-report-btn"
                    type="button"
                    onClick={() => setNotice('Exporting energy report as CSV... Download started.')}
                  >
                    Export Report
                  </button>
                </div>
              </section>
              {error && (
                <div className="global-error">
                  <span>{error}</span>
                  <button className="icon-button" onClick={dismissError} aria-label="Dismiss error">
                    <IonIcon icon={closeOutline} />
                  </button>
                </div>
              )}

              {page === 'overview' && (
                <section className="view overview-view">
                  {/* MOBILE VIEW (< 768px) BASED ON REFERENCE IMAGE 1 */}
                  <div className="mobile-overview-flow">
                    <div className="mobile-user-greeting">
                      <div className="greeting-avatar">{signedInInitial}</div>
                      <div className="greeting-text">
                        <h2>Good Morning, {user?.first_name || (user?.full_name ? user.full_name.split(' ')[0] : 'there')}</h2>
                        <p>Here's your energy overview</p>
                      </div>
                      <button
                        className="icon-button mobile-bell-btn"
                        aria-label="Notifications"
                        onClick={() => setNotice('System operational: Energeia monitoring active.')}
                      >
                        <IonIcon icon={notificationsOutline} />
                        <span className="notification-indicator-dot" />
                      </button>
                    </div>

                    <div className="mobile-gauge-section">
                      <div className="mobile-section-header">
                        <h2>Current Usage</h2>
                        <span className="live-status-pill">
                          <span className="live-pulsing-dot" /> Live
                        </span>
                      </div>
                      <div className="mobile-gauge-card">
                        <SemiCircleGauge
                          value={hasUsage ? fmtKwh(dashboard?.current_kwh) : 2.4}
                          max={5.0}
                          unit="kWh"
                        />
                        <div className="gauge-stats-row">
                          <div className="gauge-stat-box">
                            <span className="stat-label">Estimated cost</span>
                            <strong className="stat-number">
                              {hasUsage && Number(selectedRate?.rate_per_kwh) > 0 ? fmtMoney(dashboard?.estimated_cost) : '—'}
                            </strong>
                            <span className="stat-badge-positive">
                              {selectedRate?.provider_name ? selectedRate.provider_name : 'Active rate'}
                            </span>
                          </div>
                          <div className="gauge-stat-divider" />
                          <div className="gauge-stat-box">
                            <span className="stat-label">Active Devices</span>
                            <strong className="stat-number">{appliances.length || '0'}</strong>
                            <span className="stat-subtext">Connected</span>
                          </div>
                        </div>
                      </div>

                      <div className="mobile-insight-banner" onClick={() => changePage('insights')}>
                        <div className="insight-badge-icon">
                          <IonIcon icon={sparklesOutline} />
                        </div>
                        <div className="insight-banner-body">
                          <strong className="insight-heading">Insight</strong>
                          <p>
                            {recommendations.length > 0
                              ? recommendations[0].message
                              : 'Set schedules for high-draw appliances to lower monthly billing.'}
                          </p>
                          <span className="insight-cta">
                            View suggestions <IonIcon icon={chevronForwardOutline} />
                          </span>
                        </div>
                      </div>

                      <div className="mobile-quick-control-section">
                        <div className="mobile-section-header">
                          <h2>Quick Control</h2>
                          <button className="see-all-btn" onClick={() => changePage('appliances')}>
                            See all <IonIcon icon={chevronForwardOutline} />
                          </button>
                        </div>
                        <div className="quick-control-cards-row">
                          {appliances.length > 0 ? (
                            appliances.slice(0, 2).map((app, idx) => {
                              const appSchedules = schedules[app.appliance_id] || [];
                              const primarySchedule = appSchedules[0];
                              const isActive = primarySchedule ? primarySchedule.is_active : !mobileQuickToggles[`dev_${app.appliance_id}`];
                              return (
                                <div className={`quick-control-card${isActive ? ' is-active' : ''}`} key={app.appliance_id}>
                                  <div className="quick-card-head">
                                    <span className={idx === 0 ? 'quick-icon-amber' : 'quick-icon-pink'}>
                                      <IonIcon
                                        icon={
                                          app.category === 'Cooling'
                                            ? waterOutline
                                            : app.category === 'Lighting'
                                            ? bulbOutline
                                            : flashOutline
                                        }
                                      />
                                    </span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={isActive}
                                      aria-label={`Toggle ${app.appliance_name}`}
                                      className={`spring-switch${isActive ? ' is-on' : ''}`}
                                      onClick={() => {
                                        if (primarySchedule) {
                                          setScheduleActive(primarySchedule, !primarySchedule.is_active);
                                        } else {
                                          setMobileQuickToggles((p) => ({
                                            ...p,
                                            [`dev_${app.appliance_id}`]: !p[`dev_${app.appliance_id}`],
                                          }));
                                        }
                                      }}
                                    >
                                      <span className="switch-thumb" />
                                    </button>
                                  </div>
                                  <strong>{app.appliance_name}</strong>
                                </div>
                              );
                            })
                          ) : (
                            <>
                              <div className={`quick-control-card${mobileQuickToggles.ac ? ' is-active' : ''}`}>
                                <div className="quick-card-head">
                                  <span className="quick-icon-amber">
                                    <IonIcon icon={waterOutline} />
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={mobileQuickToggles.ac}
                                    aria-label="Toggle Air Conditioner"
                                    className={`spring-switch${mobileQuickToggles.ac ? ' is-on' : ''}`}
                                    onClick={() => setMobileQuickToggles((p) => ({ ...p, ac: !p.ac }))}
                                  >
                                    <span className="switch-thumb" />
                                  </button>
                                </div>
                                <strong>Air Conditioner</strong>
                              </div>

                              <div className={`quick-control-card${mobileQuickToggles.fridge ? ' is-active' : ''}`}>
                                <div className="quick-card-head">
                                  <span className="quick-icon-pink">
                                    <IonIcon icon={flashOutline} />
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={mobileQuickToggles.fridge}
                                    aria-label="Toggle Refrigerator"
                                    className={`spring-switch${mobileQuickToggles.fridge ? ' is-on' : ''}`}
                                    onClick={() => setMobileQuickToggles((p) => ({ ...p, fridge: !p.fridge }))}
                                  >
                                    <span className="switch-thumb" />
                                  </button>
                                </div>
                                <strong>Refrigerator</strong>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DESKTOP VIEW (≥ 768px) BASED ON REFERENCE IMAGE 2 */}
                  <div className="desktop-overview-flow">
                    <div className="dashboard-metrics">
                      <article className="metric-card metric-card-primary">
                        <div className="metric-card-top">
                          <span className="metric-label">Total Power Generated</span>
                          <span className="metric-icon-badge badge-primary">
                            <IonIcon icon={arrowUpOutline} className="metric-arrow-up" />
                          </span>
                        </div>
                        <strong>
                          {hasUsage ? fmtKwh(dashboard?.current_kwh) : '452.8'}
                          <small> kWh</small>
                        </strong>
                        <span className="metric-note">
                          <span className="trend-arrow">↗</span> 12% more than last week
                        </span>
                      </article>

                      <article className="metric-card">
                        <div className="metric-card-top">
                          <span className="metric-label">Current Consumption</span>
                          <span className="metric-icon-badge">
                            <IonIcon icon={flashOutline} />
                          </span>
                        </div>
                        <strong>
                          2.4<small> kW</small>
                        </strong>
                        <span className="metric-badge-warning">
                          <IonIcon icon={warningOutline} /> Peak usage detected
                        </span>
                      </article>

                      <article className="metric-card">
                        <div className="metric-card-top">
                          <span className="metric-label">Battery Storage Level</span>
                          <span className="metric-icon-badge">
                            <IonIcon icon={pulseOutline} />
                          </span>
                        </div>
                        <strong>
                          84<small> %</small>
                        </strong>
                        <span className="metric-badge-success">
                          <IonIcon icon={checkmarkCircleOutline} /> Charging optimally
                        </span>
                      </article>

                      <article className="metric-card">
                        <div className="metric-card-top">
                          <span className="metric-label">Grid Status</span>
                          <span className="metric-icon-badge">
                            <IonIcon icon={gridOutline} />
                          </span>
                        </div>
                        <div className="grid-online-status">
                          <span className="online-pill-tag">
                            <span className="live-pulsing-dot" /> Online
                          </span>
                        </div>
                        <span className="metric-note-subtle">
                          <IonIcon icon={timeOutline} /> Last sync: 2 min ago
                        </span>
                      </article>
                    </div>

                    <div className="overview-main-row">
                      <article className="savings-progress-panel">
                        <div className="panel-header-simple">
                          <div>
                            <h3>Savings Progress</h3>
                            <p>67% of monthly target achieved</p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Savings options"
                            onClick={() => setNotice('Savings goal target: 500 kWh / month')}
                          >
                            <IonIcon icon={ellipsisHorizontal} />
                          </button>
                        </div>
                        <SavingsDonut percentage={67} label="GOAL REACHED" />
                      </article>

                      <InteractiveBarChart
                        bars={bars}
                        maxBar={maxBar}
                        timeFilter={timeFilter}
                        onTimeFilterChange={setTimeFilter}
                      />
                    </div>

                    <div className="overview-bottom-row">
                      <article className="smart-devices-panel">
                        <div className="panel-header-simple">
                          <h3>Smart Devices</h3>
                          <button className="plain-link" onClick={() => changePage('appliances')}>
                            Manage All
                          </button>
                        </div>
                        <div className="smart-devices-grid-2x2">
                          {appliances.length > 0 ? (
                            appliances.slice(0, 4).map((app, idx) => {
                              const appSchedules = schedules[app.appliance_id] || [];
                              const primarySchedule = appSchedules[0];
                              const isActive = primarySchedule ? primarySchedule.is_active : !smartDeviceToggles[`dev_${app.appliance_id}`];
                              const colorClass = ['bg-blue', 'bg-pink', 'bg-amber', 'bg-slate'][idx % 4];
                              return (
                                <div className="smart-device-row" key={app.appliance_id}>
                                  <span className={`device-avatar-icon ${colorClass}`}>
                                    <IonIcon
                                      icon={
                                        app.category === 'Cooling'
                                          ? waterOutline
                                          : app.category === 'Lighting'
                                          ? bulbOutline
                                          : app.category === 'Kitchen'
                                          ? flashOutline
                                          : pulseOutline
                                      }
                                    />
                                  </span>
                                  <div className="device-meta-copy">
                                    <strong>{app.appliance_name}</strong>
                                    <span>{app.category || 'Appliance'} • {app.wattage}W</span>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isActive}
                                    aria-label={`Toggle ${app.appliance_name}`}
                                    className={`spring-switch${isActive ? ' is-on' : ''}`}
                                    onClick={() => {
                                      if (primarySchedule) {
                                        setScheduleActive(primarySchedule, !primarySchedule.is_active);
                                      } else {
                                        setSmartDeviceToggles((p) => ({
                                          ...p,
                                          [`dev_${app.appliance_id}`]: !p[`dev_${app.appliance_id}`],
                                        }));
                                      }
                                    }}
                                  >
                                    <span className="switch-thumb" />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <>
                              <div className="smart-device-row">
                                <span className="device-avatar-icon bg-blue">
                                  <IonIcon icon={waterOutline} />
                                </span>
                                <div className="device-meta-copy">
                                  <strong>HVAC System</strong>
                                  <span>Heating • Active</span>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={smartDeviceToggles.hvac}
                                  aria-label="Toggle HVAC System"
                                  className={`spring-switch${smartDeviceToggles.hvac ? ' is-on' : ''}`}
                                  onClick={() => setSmartDeviceToggles((p) => ({ ...p, hvac: !p.hvac }))}
                                >
                                  <span className="switch-thumb" />
                                </button>
                              </div>

                              <div className="smart-device-row">
                                <span className="device-avatar-icon bg-pink">
                                  <IonIcon icon={flashOutline} />
                                </span>
                                <div className="device-meta-copy">
                                  <strong>Smart Fridge</strong>
                                  <span>Eco Mode • Active</span>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={smartDeviceToggles.fridge}
                                  aria-label="Toggle Smart Fridge"
                                  className={`spring-switch${smartDeviceToggles.fridge ? ' is-on' : ''}`}
                                  onClick={() => setSmartDeviceToggles((p) => ({ ...p, fridge: !p.fridge }))}
                                >
                                  <span className="switch-thumb" />
                                </button>
                              </div>

                              <div className="smart-device-row">
                                <span className="device-avatar-icon bg-amber">
                                  <IonIcon icon={bulbOutline} />
                                </span>
                                <div className="device-meta-copy">
                                  <strong>Smart Lighting</strong>
                                  <span>Eco Mode • Active</span>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={smartDeviceToggles.washer}
                                  aria-label="Toggle Smart Lighting"
                                  className={`spring-switch${smartDeviceToggles.washer ? ' is-on' : ''}`}
                                  onClick={() => setSmartDeviceToggles((p) => ({ ...p, washer: !p.washer }))}
                                >
                                  <span className="switch-thumb" />
                                </button>
                              </div>

                              <div className="smart-device-row">
                                <span className="device-avatar-icon bg-slate">
                                  <IonIcon icon={pulseOutline} />
                                </span>
                                <div className="device-meta-copy">
                                  <strong>EV Charger</strong>
                                  <span>Disconnected</span>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={smartDeviceToggles.charger}
                                  aria-label="Toggle EV Charger"
                                  className={`spring-switch${smartDeviceToggles.charger ? ' is-on' : ''}`}
                                  onClick={() => setSmartDeviceToggles((p) => ({ ...p, charger: !p.charger }))}
                                >
                                  <span className="switch-thumb" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </article>

                      <article className="carbon-offset-panel">
                        <div className="carbon-circles-bg" aria-hidden="true" />
                        <div className="carbon-head">
                          <div>
                            <h3>Carbon Offset Tracker</h3>
                            <p>Total environmental impact this year</p>
                          </div>
                          <span className="leaderboard-pill">LEADERBOARD TOP 5%</span>
                        </div>
                        <div className="carbon-metrics-strip">
                          <div className="carbon-stat-cell">
                            <span className="carbon-stat-eyebrow">CO2 AVOIDED</span>
                            <div className="carbon-stat-figure">
                              <strong>12.4</strong>
                              <span>Tons</span>
                            </div>
                          </div>
                          <div className="carbon-stat-cell">
                            <span className="carbon-stat-eyebrow">TREES EQUIVALENT</span>
                            <div className="carbon-stat-figure">
                              <strong>548</strong>
                              <span>Planted</span>
                            </div>
                          </div>
                        </div>
                        <div className="carbon-actions-row">
                          <button
                            type="button"
                            className="carbon-view-btn"
                            onClick={() => changePage('insights')}
                          >
                            View Detailed Impact
                          </button>
                          <button
                            type="button"
                            className="carbon-share-btn"
                            aria-label="Share carbon impact"
                            onClick={() => setNotice('Carbon offset summary copied to clipboard!')}
                          >
                            <IonIcon icon={shareSocialOutline} />
                          </button>
                        </div>
                      </article>
                    </div>
                  </div>
                </section>
              )}

              {page === 'appliances' && (
                <section className="view appliances-view">
                  <div className="appliances-breakdown-card">
                    <div className="breakdown-head">
                      <div>
                        <h2>Total Usage Today</h2>
                        <p>Real-time device breakdown</p>
                      </div>
                      <span className="live-status-pill">
                        <span className="live-pulsing-dot" /> Live
                      </span>
                    </div>
                    <CategoryDonut centerValue={`${hasUsage ? fmtKwh(dashboard?.current_kwh) : '2.4'} kWh`} />
                  </div>

                  <div className="appliance-filter-chips">
                    <button
                      className={`chip-pill${deviceFilter === 'all' ? ' is-active' : ''}`}
                      onClick={() => setDeviceFilter('all')}
                    >
                      All Devices
                    </button>
                    <button
                      className={`chip-pill${deviceFilter === 'room' ? ' is-active' : ''}`}
                      onClick={() => setDeviceFilter('room')}
                    >
                      By Room
                    </button>
                    <button
                      className={`chip-pill${deviceFilter === 'sort' ? ' is-active' : ''}`}
                      onClick={() => setDeviceFilter((p) => (p === 'sort' ? 'all' : 'sort'))}
                    >
                      High to Low <IonIcon icon={chevronDownOutline} />
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
                          {appliances.map((appliance, index) => {
                            const applianceSchedules = schedules[appliance.appliance_id] || [];
                            const current = dashboard?.top_appliances?.find((row) => row.appliance_id === appliance.appliance_id);
                            const isHighUsage = Number(appliance.wattage) >= 1000 || appliance.category === 'Cooling';

                            return (
                              <article className="appliance-card" key={appliance.appliance_id}>
                                <div className="appliance-head">
                                  <span className={`appliance-icon appliance-icon-${index % 4}`}>
                                    <IonIcon
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
                                  <div className="appliance-name">
                                    <div className="appliance-title-row">
                                      <h3>{appliance.appliance_name}</h3>
                                      <span className={`device-usage-badge ${isHighUsage ? 'badge-high' : 'badge-normal'}`}>
                                        {isHighUsage ? 'High Usage' : 'Normal'}
                                      </span>
                                    </div>
                                    <span>
                                      {appliance.category || 'Home appliance'} <span>·</span> {appliance.wattage} W{' '}
                                      <span>·</span> {appliance.quantity} {Number(appliance.quantity) === 1 ? 'unit' : 'units'}
                                    </span>
                                  </div>
                                  <div className="appliance-consumption">
                                    <strong>
                                      {Number(current?.current_kwh) > 0 ? (
                                        <>
                                          {fmtKwh(current.current_kwh)} <span>kWh</span>
                                        </>
                                      ) : (
                                        '—'
                                      )}
                                    </strong>
                                    <span>{Number(current?.current_kwh) > 0 ? 'this billing period' : 'No active schedule'}</span>
                                  </div>
                                  <button
                                    className="icon-button"
                                    title="Edit appliance"
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
                                    <IonIcon icon={createOutline} />
                                  </button>
                                  <button
                                    className="icon-button delete-button"
                                    title="Remove appliance"
                                    onClick={() => deleteAppliance(appliance)}
                                  >
                                    <IonIcon icon={trashOutline} />
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
                                    <IonIcon icon={addOutline} /> Add schedule
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
                                          {schedule.is_active ? <span /> : <IonIcon icon={closeOutline} />}
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
                                          aria-checked={schedule.is_active}
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
                                          <IonIcon icon={createOutline} />
                                        </button>
                                        <button
                                          className="icon-button delete-button subtle-icon"
                                          title="Delete schedule"
                                          onClick={() => deleteSchedule(schedule)}
                                        >
                                          <IonIcon icon={trashOutline} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="schedule-empty">
                                    <IonIcon icon={timeOutline} />
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
                            <IonIcon icon={flashOutline} />
                          </span>
                          <h3>No appliances yet.</h3>
                          <IonButton className="primary-button" onClick={openCreateAppliance}>
                            <IonIcon icon={addOutline} slot="start" />
                            Add Appliance
                          </IonButton>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {page === 'history' && (
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
                        <IonIcon icon={pulseOutline} slot="start" />
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
                    <div className="bill-table-wrap">
                      <table className="bill-table">
                        <thead>
                          <tr>
                            <th>BILLING PERIOD</th>
                            <th>PROVIDER & RATE</th>
                            <th>ESTIMATED USAGE</th>
                            <th>ESTIMATED BILL</th>
                            <th>ACTUAL BILL</th>
                            <th />
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
                                  <IonIcon className="bill-arrow" icon={chevronForwardOutline} />
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
                        <IonIcon icon={calendarClearOutline} />
                      </span>
                      <div>
                        <strong>No billing periods saved yet.</strong>
                        <p>
                          Add appliances and active usage schedules to create your first estimate and billing period.
                        </p>
                      </div>
                      <button className="plain-link" onClick={() => changePage('appliances')}>
                        Manage appliances <IonIcon icon={chevronForwardOutline} />
                      </button>
                    </div>
                  )}
                </section>
              )}

              {page === 'insights' && (
                <section className="view insights-view">
                  <div className="insights-filter-chips">
                    {['Day', 'Week', 'Month', 'Year'].map((tab) => (
                      <button
                        key={tab}
                        className={`insights-tab-pill${insightsTimeRange === tab.toLowerCase() ? ' is-active' : ''}`}
                        onClick={() => setInsightsTimeRange(tab.toLowerCase())}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="insights-energy-banner">
                    <div className="banner-metric-block">
                      <span className="banner-eyebrow">Energy Usage</span>
                      <div className="banner-figure-row">
                        <strong>18.7<small> kWh</small></strong>
                        <span className="banner-trend-green">+12% vs last week</span>
                      </div>
                      <span className="banner-subtext">This {insightsTimeRange}</span>
                    </div>
                  </div>

                  <div className="section-row">
                    <div>
                      <h2>Smart Insights</h2>
                    </div>
                    <span className="plain-meta">{recommendations.length + 2}</span>
                  </div>

                  <div className="smart-insights-list">
                    <article className="smart-insight-card">
                      <div className="insight-blue-badge">
                        <IonIcon icon={sparklesOutline} />
                      </div>
                      <div className="smart-insight-copy">
                        <strong>Great Job</strong>
                        <p>You used 18% less energy compared to last week.</p>
                      </div>
                      <IonIcon icon={chevronForwardOutline} className="insight-chev" />
                    </article>

                    <article className="smart-insight-card">
                      <div className="insight-blue-badge">
                        <IonIcon icon={flashOutline} />
                      </div>
                      <div className="smart-insight-copy">
                        <strong>Save up to 15% this month</strong>
                        <p>Run your washing machine and water heater at night (10PM - 6AM).</p>
                      </div>
                      <IonIcon icon={chevronForwardOutline} className="insight-chev" />
                    </article>

                    {recommendations.map((recommendation) => (
                      <article className="recommendation-card" key={recommendation.recommendation_id}>
                        <div className="recommendation-content">
                          <strong className="recommendation-title">{recommendation.appliance_name || 'Home'}</strong>
                          <p>{recommendation.message}</p>
                          {(Number(recommendation.potential_savings_kwh) > 0 ||
                            Number(recommendation.potential_savings_cost) > 0) && (
                            <div className="recommendation-savings">
                              <span>
                                <IonIcon icon={trendingDownOutline} /> Potential savings
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
                          Dismiss <IonIcon icon={closeOutline} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!!recommendations.length && (
                    <p className="recommendation-note">Potential savings are estimates based on standard utility calculations.</p>
                  )}
                </section>
              )}

              {page === 'scenarios' && (
                <section className="view">
                  <p className="scenario-instruction">
                    Adjust appliance usage to compare estimated costs. Preview changes do not affect your schedules
                    unless you save them.
                  </p>
                  <div className="scenario-actions">
                    <button
                      className="text-action scenario-create"
                      onClick={() => openModal('scenario-create')}
                      disabled={!appliances.length}
                    >
                      <IonIcon icon={addOutline} /> Make a plan
                    </button>
                  </div>
                  <div className="section-row">
                    <div>
                      <h2>Saved plans</h2>
                    </div>
                    <span className="plain-meta">{scenarios.length}</span>
                  </div>
                  {scenarios.length ? (
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
                              <IonIcon icon={chevronForwardOutline} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`Delete ${scenario.scenario_name}`}
                              onClick={() => deleteScenario(scenario)}
                            >
                              <IonIcon icon={trashOutline} />
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
                            <IonIcon
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
                        <IonIcon icon={bulbOutline} />
                      </span>
                      <div>
                        <strong>No plans yet.</strong>
                        <p>Create a plan to compare costs without changing your appliance schedules.</p>
                      </div>
                      {appliances.length > 0 && (
                        <button className="plain-link" onClick={() => openModal('scenario-create')}>
                          Make a plan <IonIcon icon={chevronForwardOutline} />
                        </button>
                      )}
                    </div>
                  )}
                  {scenarioResults && appliances.length > 0 && (
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
                                name={`scenario_hours_${appliance.appliance_id}`}
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
                                name={`scenario_quantity_${appliance.appliance_id}`}
                                min="1"
                                step="1"
                                placeholder={String(appliance.quantity)}
                              />
                            </label>
                          </div>
                        ))}
                        <div className="preview-actions">
                          <span>Leave a field empty to keep its current setting.</span>
                          <button type="submit" className="plain-link">
                            <IonIcon icon={playOutline} /> Preview changes
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
                    <IonIcon icon={logOutOutline} /> Sign out of Energeia
                  </button>
                </section>
              )}
            </div>
          </main>

          <nav className="mobile-nav" aria-label="Main navigation">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`mobile-nav-item${page === item.id ? ' mobile-nav-item-active' : ''}`}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => changePage(item.id)}
              >
                <div className="mobile-nav-pill">
                  <IonIcon icon={item.icon} />
                </div>
                <span>{item.mobileLabel}</span>
              </button>
            ))}
          </nav>
        </div>
      </IonContent>
      <IonToast isOpen={!!notice} message={notice} duration={3000} position="top" onDidDismiss={() => setNotice('')} />

      <Modal isOpen={modal === 'appliance'} onClose={() => setModal('')} title={editingAppliance ? 'Edit appliance' : 'Add appliance'} subtitle={editingAppliance ? 'Saved usage history will be preserved.' : 'Add a schedule after saving to estimate usage.'}>
        <ModalForm busy={busy} error={error} onSubmit={saveAppliance} button={editingAppliance ? 'Save changes' : 'Add appliance'}>
          <Field label="Appliance name"><IonInput className="form-input" name="appliance_name" placeholder="e.g. Living room air conditioner" value={formFields.appliance_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <div className="form-row"><Field label="Category"><IonSelect className="form-input form-select" name="category" value={formFields.category ?? 'Cooling'} onIonChange={updateFormField} interface="popover">{CATEGORIES.map((category) => <IonSelectOption key={category} value={category}>{category}</IonSelectOption>)}</IonSelect></Field><Field label="Wattage"><IonInput className="form-input" name="wattage" type="number" min="0.01" max="100000" step="any" placeholder="e.g. 950" value={formFields.wattage ?? ''} onIonInput={updateFormField} required /><span className="field-hint">Look for the W rating on the label.</span></Field></div>
          <Field label="Number in your household"><IonInput className="form-input" name="quantity" type="number" min="1" max="999" step="1" value={formFields.quantity ?? 1} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'schedule'} onClose={() => setModal('')} title={editingSchedule ? 'Edit schedule' : 'Add usage schedule'} subtitle={activeScenario?.appliance_name || 'Appliance'}>
        <ModalForm busy={busy} error={error} key={`${editingSchedule?.schedule_id || activeScenario?.appliance_id || 'new'}`} onSubmit={saveSchedule} button="Save schedule">
          <div className="field-label">Days of the week<div className="weekday-grid">{WEEKDAYS.map((day) => { const checked = editingSchedule?.days_of_week.includes(day) ?? false; return <label className="weekday-chip" key={day}><input type="checkbox" name="days" value={day} defaultChecked={checked} /><span>{day.slice(0, 1)}</span><small>{day}</small></label>; })}</div></div>
          <Field label="Operating hours per day" hint="An estimate is just fine. Add another schedule if the hours change on different days."><IonInput className="form-input" name="hours_per_day" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 8" value={formFields.hours_per_day ?? ''} onIonInput={updateFormField} required /></Field>
          <Field label="Usual start time"><IonInput className="form-input" name="start_time" type="time" value={formFields.start_time ?? ''} onIonInput={updateFormField} /></Field>
          <label className="check-field"><input type="checkbox" name="is_active" defaultChecked={editingSchedule?.is_active ?? true} /><span>Include this schedule in my energy estimates</span></label>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'household'} onClose={() => { setModal(''); setEditingHousehold(null); }} title={editingHousehold ? 'Edit household' : 'Add household'}>
        <ModalForm busy={busy} error={error} onSubmit={saveHousehold} button={editingHousehold ? 'Save household details' : 'Add household'}>
          <Field label="Household name"><IonInput className="form-input" name="household_name" placeholder="e.g. Weekend cottage" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Address"><IonInput className="form-input" name="address" placeholder="City or neighbourhood (optional)" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'account'} onClose={() => setModal('')} title="Account">
        <div className="account-card-content"><span className="account-detail-avatar">{signedInInitial}</span><div className="account-detail"><span className="eyebrow">YOUR ACCOUNT</span><strong>{user.full_name || user.email}</strong><span>{user.email}</span></div></div>
        <button className="text-button account-settings-link" onClick={() => { setModal(''); changePage('settings'); }}>Manage account settings</button>
        <button className="logout-modal-button" onClick={handleLogout}><IonIcon icon={logOutOutline} /> Sign out of Energeia</button>
      </Modal>

      <Modal isOpen={modal === 'rate'} onClose={() => setModal('')} title="Electricity rate" subtitle="Saved bills keep their original rate.">
        <ModalForm busy={busy} error={error} onSubmit={saveRate} button="Save electricity rate" note={Number(selectedRate?.rate_per_kwh) > 0 ? `Current: ${selectedRate.provider_name} · ₱${Number(selectedRate.rate_per_kwh).toFixed(2)} per kWh` : 'Your first provider and rate will be used in future bill estimates.'}>
          <Field label="Electricity provider"><IonInput className="form-input" name="provider_name" placeholder="e.g. Meralco" value={formFields.provider_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Rate per kilowatt-hour (₱/kWh)" hint="Usually listed on your electricity bill."><IonInput className="form-input" name="rate_per_kwh" type="number" min="0.0001" max="999999" step=".0001" placeholder="e.g. 11.5000" value={formFields.rate_per_kwh ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'actual-bill'} onClose={() => setModal('')} title="Add actual bill" subtitle={`Your estimate for ${activeScenario?.period_start || ''} will be kept.`}>
        <ModalForm busy={busy} error={error} onSubmit={saveActualBill} button="Save actual bill">
          <Field label="Actual bill amount (₱)"><IonInput className="form-input" name="actual_bill_amount" type="number" min="0" max="999999999" step=".01" placeholder="e.g. 2,486.50" value={formFields.actual_bill_amount ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'scenario-create'} onClose={() => setModal('')} title="Save what-if plan" subtitle="Saving a plan does not change appliance schedules.">
        <ModalForm busy={busy} error={error} onSubmit={saveScenario} button="Save my what-if plan">
          <Field label="Give your idea a name"><IonInput className="form-input" name="scenario_name" placeholder="e.g. Quieter air-con evenings" value={formFields.scenario_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          {appliances.map((appliance) => <div className="scenario-form-appliance" key={appliance.appliance_id}><strong>{appliance.appliance_name}</strong><div><label className="inline-field">Hours/day<input className="small-native-input" type="number" name={`hours_${appliance.appliance_id}`} min="0" max="24" step=".25" placeholder={Number(appliance.average_hours_per_day || 0).toFixed(1)} /></label><label className="inline-field">Quantity<input className="small-native-input" type="number" name={`quantity_${appliance.appliance_id}`} min="1" max="999" step="1" placeholder={String(appliance.quantity)} /></label></div><span>Leave blank to keep the current setting.</span></div>)}
        </ModalForm>
      </Modal>
    </IonPage>
  </IonApp>;
}

export default App;
