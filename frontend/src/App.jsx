import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonApp, IonButton, IonContent, IonIcon, IonInput, IonModal, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonToast, setupIonicReact,
} from '@ionic/react';
import {
  addOutline, arrowDownOutline, arrowUpOutline, bulbOutline, calendarClearOutline,
  checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline, closeOutline,
  createOutline, flashOutline, gridOutline, homeOutline, leafOutline, logOutOutline,
  menuOutline, playOutline, pulseOutline, sparklesOutline, timeOutline, trashOutline,
  trendingDownOutline, walletOutline, waterOutline,
} from 'ionicons/icons';
import { fmtKwh, fmtMoney, request } from './api.js';

setupIonicReact();

const NAV = [
  { id: 'overview', label: 'Overview', icon: gridOutline },
  { id: 'appliances', label: 'My appliances', icon: flashOutline },
  { id: 'history', label: 'Usage & bills', icon: pulseOutline },
  { id: 'insights', label: 'Recommendations', icon: sparklesOutline },
  { id: 'scenarios', label: 'What-if planner', icon: bulbOutline },
];
const CATEGORIES = ['Cooling', 'Kitchen', 'Laundry', 'Lighting', 'Electronics', 'Water heating', 'Other'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIOD = new Date().toISOString().slice(0, 7);
const PERIOD_LABEL = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });

function Logo({ small = false }) {
  return <div className={`brand${small ? ' brand-small' : ''}`}><img className="brand-image" src="/energeia-logo.png" alt="" aria-hidden="true" /><span>energeia<span className="brand-dot">.</span></span></div>;
}

function AuthScreen({ onLogin }) {
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ full_name: '', email: '', password: '' });

  function updateCredential(event) {
    const field = event.currentTarget.name;
    const value = event.detail?.value ?? '';
    setCredentials((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await request(`/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        body: credentials,
      });
      localStorage.setItem('energeia_token', result.access_token);
      onLogin(result.user);
    } catch (exception) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-left">
        <Logo />
        <div className="auth-pitch">
          <div className="eyebrow"><span className="live-dot" /> YOUR HOME, A LITTLE MORE IN BALANCE</div>
          <h1>A clearer view<br />of your <span>energy.</span></h1>
          <p>The small things add up. See what’s using power, what it costs, and the surprisingly simple ways to use a little less.</p>
          <div className="auth-highlights">
            <span><span className="highlight-icon"><IonIcon icon={flashOutline} /></span>Know where your power goes</span>
            <span><span className="highlight-icon"><IonIcon icon={trendingDownOutline} /></span>Find room on your next bill</span>
            <span><span className="highlight-icon"><IonIcon icon={leafOutline} /></span>Make changes that add up</span>
          </div>
        </div>
        <div className="auth-foot">A more thoughtful way to power your home. <span>●</span></div>
      </div>
      <div className="auth-right">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-mini"><Logo small /><span className="secure-label"><span>✳</span> YOUR PERSONAL ENERGY SPACE</span></div>
          <div className="auth-welcome"><div className="eyebrow">{registering ? 'A LITTLE LESS GUESSWORK' : 'WELCOME BACK'}</div>
            <h2>{registering ? 'Let’s get started.' : 'Good to see you.'}</h2>
            <p>{registering ? 'Your energy story starts here.' : 'Your household is right where you left it.'}</p></div>
          {registering && <label className="field-label">Your name<IonInput className="form-input" name="full_name" placeholder="e.g. Alex Santos" autocomplete="name" value={credentials.full_name} onIonInput={updateCredential} required maxlength={150} /></label>}
          <label className="field-label">Email address<IonInput className="form-input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value={credentials.email} onIonInput={updateCredential} required maxlength={150} /></label>
          <label className="field-label">Password<IonInput className="form-input" name="password" type="password" placeholder={registering ? 'At least 8 characters' : 'Enter your password'} autocomplete={registering ? 'new-password' : 'current-password'} value={credentials.password} onIonInput={updateCredential} required minlength={registering ? 8 : 1} maxlength={128} /></label>
          {error && <div className="inline-error">{error}</div>}
          <IonButton type="submit" expand="block" className="primary-button auth-submit" disabled={loading}>
            {loading ? <IonSpinner name="crescent" /> : <>{registering ? 'Create my account' : 'Sign in'} <IonIcon icon={chevronForwardOutline} slot="end" /></>}
          </IonButton>
          <div className="auth-divider"><span /></div>
          <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Energeia?'} <button className="text-button" type="button" onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? 'Sign in' : 'Create your account'}</button></p>
          <div className="privacy-note"><span>✓</span> Your household data stays yours. Always.</div>
        </form>
      </div>
    </main>
  );
}

function Modal({ isOpen, onClose, title, subtitle, children, wide = false }) {
  return <IonModal isOpen={isOpen} onDidDismiss={onClose} className={wide ? 'app-modal app-modal-wide' : 'app-modal'}><div className="modal-body"><header className="modal-heading"><div><div className="eyebrow modal-eyebrow">ENERGEIA · HOME ENERGY</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><IonIcon icon={closeOutline} /></button></header>{children}</div></IonModal>;
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

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const currentHousehold = households.find((item) => item.household_id === Number(householdId));

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
    const token = localStorage.getItem('energeia_token');
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
      dashData = await request(`/households/${id}/calculate`, { method: 'POST', body: {} });
      const latestBills = await request(`/households/${id}/bills`);
      setBills(latestBills);
    } else {
      [dashData] = await Promise.all([
        request(`/households/${id}/dashboard${query}`),
        Promise.resolve(),
      ]);
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
    if (!user) return;
    loadHouseholds().catch((exception) => { setError(exception.message); setLoading(false); });
  }, [user, loadHouseholds]);

  useEffect(() => {
    if (!user || !householdId) return;
    setLoading(true);
    refresh(householdId, { calculate: true })
      .catch((exception) => setError(exception.message))
      .finally(() => setLoading(false));
  }, [user, householdId, refresh]);

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

  function changePage(next) {
    setPage(next);
    setMenuOpen(false);
    setError('');
    if (next === 'overview') refresh(householdId).catch((exception) => setError(exception.message));
  }

  if (loading && !user) return <IonApp><div className="app-loading"><Logo /><IonSpinner name="crescent" /></div></IonApp>;
  if (!user) return <IonApp><AuthScreen onLogin={(account) => { setUser(account); setLoading(true); }} /></IonApp>;
  if (loading && !households.length) return <IonApp><div className="app-loading"><Logo /><IonSpinner name="crescent" /></div></IonApp>;

  const pageTitle = {
    overview: 'A little more in balance.',
    appliances: 'What’s using your energy?',
    history: 'It all adds up.',
    insights: 'Small changes, real impact.',
    scenarios: 'What if we tried something different?',
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
      <main className="welcome-page"><header className="welcome-top"><Logo /><button className="signout-link" onClick={handleLogout}><IonIcon icon={logOutOutline} /> Sign out</button></header>
        <section className="welcome-card"><span className="welcome-orbit orbit-one" /><span className="welcome-orbit orbit-two" /><div className="welcome-icon"><IonIcon icon={homeOutline} /></div>
          <div className="eyebrow">EVERYTHING STARTS AT HOME</div><h1>Let’s make it<br />a little <span>clearer.</span></h1>
          <p>First, give your household a name. You can add appliances, set your electricity rate, and start understanding where your energy goes.</p>
          <form className="welcome-form" onSubmit={saveHousehold}>
            <Field label="Give your household a name"><IonInput className="form-input" name="household_name" placeholder="e.g. Our home" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
            <Field label="Address" hint="Optional"><IonInput className="form-input" name="address" placeholder="City or neighbourhood" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
            {error && <div className="inline-error">{error}</div>}
            <IonButton expand="block" type="submit" className="primary-button" disabled={busy}>{busy ? <IonSpinner name="crescent" /> : <>Set up my household <IonIcon icon={chevronForwardOutline} slot="end" /></>}</IonButton>
          </form>
          <div className="welcome-secure"><span>✓</span> Private by design. Only you can see your data.</div>
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
          <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
            <Logo />
            <div className="side-kicker">YOUR ENERGY, IN VIEW</div>
            <nav className="side-nav" aria-label="Main navigation">{NAV.map((item, index) =>
              <button key={item.id} className={`nav-link${page === item.id ? ' nav-link-active' : ''}`} onClick={() => changePage(item.id)}>
                <span className="nav-number">0{index + 1}</span><IonIcon icon={item.icon} /><span>{item.label}</span>{page === item.id && <span className="nav-active-dot" />}
              </button>)}
            </nav>
            <div className="sidebar-spacer" />
            <div className="side-tip"><span className="tip-star">✳</span><p>A small change,<br />repeated often,<br />makes a difference.</p><span className="tip-sprig">↗</span></div>
            <div className="side-account"><span className="avatar">{signedInInitial}</span><span className="account-copy"><strong>{user?.full_name}</strong><span>Personal account</span></span><button className="account-out" title="Sign out" onClick={handleLogout}><IonIcon icon={logOutOutline} /></button></div>
          </aside>

          <main className="main-pane">
            <header className="topbar"><button className="icon-button menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}><IonIcon icon={menuOutline} /></button>
              <div className="breadcrumb"><span>My home</span><IonIcon icon={chevronForwardOutline} /><span className="breadcrumb-current">{currentHousehold?.household_name || 'Your household'}</span></div>
              <div className="topbar-right">{households.length > 1 &&
                <div className="household-picker"><IonIcon icon={homeOutline} /><select value={householdId} aria-label="Select household" onChange={(event) => { setDashboard(null); setHouseholdId(event.target.value); }}>{
                  households.map((household) => <option key={household.household_id} value={household.household_id}>{household.household_name}</option>)
                }</select><IonIcon icon={chevronDownOutline} /></div>}
                <button className="text-action" onClick={() => openModal('rate', Number(selectedRate?.rate_per_kwh) > 0 ? { provider_name: selectedRate.provider_name, rate_per_kwh: selectedRate.rate_per_kwh } : {})}><IonIcon icon={flashOutline} /> <span>{Number(selectedRate?.rate_per_kwh) > 0 ? 'Edit rate' : 'Set rate'}</span></button>
                <button className="text-action" onClick={() => { setEditingHousehold(null); openModal('household'); }}><IonIcon icon={addOutline} /> <span>New home</span></button>
                {currentHousehold && <button className="household-edit" title="Edit household details" onClick={() => { setEditingHousehold(currentHousehold); openModal('household', { household_name: currentHousehold.household_name, address: currentHousehold.address || '' }); }}><IonIcon icon={createOutline} /></button>}<span className="header-divider" /><button className="header-avatar" title={user?.full_name} onClick={() => openModal('account')}>{signedInInitial}</button></div>
            </header>

            <div className="page-inner">
              <section className="page-intro"><div><div className="eyebrow"><span className="live-dot" /> A MORE THOUGHTFUL HOME</div><h1>{pageTitle}</h1><p>{currentHousehold?.address || currentHousehold?.household_name || 'Your household'} <span className="intro-dot">·</span> {PERIOD_LABEL} <span className="intro-dot">·</span> <span className="intro-private">Just for you</span></p></div>
                <div className="intro-actions"><span className="update-stamp"><IonIcon icon={calendarClearOutline} /> This billing period</span>
                  {page === 'appliances' && <IonButton className="primary-button compact-button" onClick={openCreateAppliance}><IonIcon icon={addOutline} slot="start" />Add appliance</IonButton>}</div>
              </section>
              {error && <div className="global-error"><span>{error}</span><button className="icon-button" onClick={dismissError} aria-label="Dismiss error"><IonIcon icon={closeOutline} /></button></div>}

              {page === 'overview' && <section className="view overview-view">
                <div className="overview-top">
                  <article className="feature-card"><div className="feature-topline"><span><span className="feature-dot" /> YOUR ESTIMATED USAGE</span><span className="subtle-label">{PERIOD_LABEL.toUpperCase()}</span></div>
                    <div className="feature-main"><div><div className="feature-number">{hasUsage ? fmtKwh(dashboard?.current_kwh) : '—'}{hasUsage && <span>kWh</span>}</div><p>{hasUsage ? 'This is what your household is using this period.' : 'Add appliances and schedules to see your estimated usage.'}</p></div><div className="feature-emblem"><span className="emblem-orbit" /><IonIcon icon={flashOutline} /><span className="emblem-spark">✳</span></div></div>
                                  <div className="feature-bottom">{!hasUsage ? <div className="cost-pill cost-pill-empty"><span className="pill-icon"><IonIcon icon={walletOutline} /></span><span>ESTIMATED BILL</span><strong>—</strong></div> : Number(selectedRate?.rate_per_kwh) > 0 ? <div className="cost-pill"><span className="pill-icon"><IonIcon icon={walletOutline} /></span><span>ESTIMATED BILL</span><strong>{fmtMoney(dashboard?.estimated_cost)}</strong></div> : <button className="rate-setup-link" onClick={() => openModal('rate')}><span className="pill-icon"><IonIcon icon={walletOutline} /></span><span>ADD YOUR ELECTRICITY RATE</span><strong>Set rate <IonIcon icon={chevronForwardOutline} /></strong></button>}
                                    <span className="rate-caption">{!hasUsage ? 'Your estimate will appear when appliance schedules are active.' : Number(selectedRate?.rate_per_kwh) > 0 ? `${selectedRate.provider_name} · ₱${Number(selectedRate.rate_per_kwh).toFixed(2)}/kWh` : 'Your estimates will use your actual provider rate.'}</span></div>
                  </article>
                  <article className="summary-card"><div className="card-overline">A MOMENT TO NOTICE</div><div className="summary-leaf"><IonIcon icon={leafOutline} /></div>
                    {hasUsage && Number(dashboard?.previous_kwh) > 0 ? <><div className={`summary-change${Number(dashboard.current_kwh) <= Number(dashboard.previous_kwh) ? ' change-good' : ' change-up'}`}><IonIcon icon={Number(dashboard.current_kwh) <= Number(dashboard.previous_kwh) ? arrowDownOutline : arrowUpOutline} /> {fmtKwh(Math.abs(Number(dashboard.current_kwh) - Number(dashboard.previous_kwh)))} kWh</div><h3>{Number(dashboard.current_kwh) <= Number(dashboard.previous_kwh) ? 'A little less.' : 'A little more.'}</h3><p>Compared with your last saved billing period.</p></> :
                      <><div className="summary-change change-good"><IonIcon icon={checkmarkCircleOutline} /> JUST GETTING STARTED</div><h3>Every little<br />bit counts.</h3><p>As you track more billing periods, we’ll help you spot the changes.</p></>}
                    <button className="inline-link" onClick={() => changePage('history')}>See your history <IonIcon icon={chevronForwardOutline} /></button>
                  </article>
                </div>
                <div className="section-row"><div><span className="eyebrow section-eyebrow">THE BIGGER PICTURE</span><h2>A week at home</h2></div><button className="plain-link" onClick={() => changePage('history')}>Your usage history <IonIcon icon={chevronForwardOutline} /></button></div>
                <article className="chart-card"><div className="chart-heading"><div><strong>Your weekly rhythm</strong><p>A daily average, based on your saved schedules.</p></div><div className="chart-legend"><span /> DAILY AVERAGE</div></div>
                  {hasUsage && bars.some((bar) => Number(bar.kwh) > 0) ? <div className="bar-chart">{bars.map((bar) => <div className="bar-column" key={bar.day}><span className="bar-value">{fmtKwh(bar.kwh)}</span><div className="bar-track"><span className={`bar-fill${bar.highlight ? ' bar-highlight' : ''}`} style={{ height: `${Math.max(5, (bar.kwh / maxBar) * 100)}%` }} /></div><span className="bar-label">{bar.day}</span></div>)}</div> :
                    <div className="empty-inline"><span className="empty-icon"><IonIcon icon={timeOutline} /></span><div><strong>Your week hasn’t taken shape yet.</strong><p>Add appliances and schedules, and we’ll map out your daily energy rhythm.</p></div><button className="plain-link" onClick={() => changePage('appliances')}>Get started <IonIcon icon={chevronForwardOutline} /></button></div>}
                  <div className="chart-footer"><span>Each bar is your estimated household usage per day, averaged across the week.</span><span><span className="legend-green" /> A bit above your daily average</span></div>
                </article>
                <div className="section-row compact-section"><div><span className="eyebrow section-eyebrow">AROUND THE HOUSE</span><h2>Where it’s going</h2></div><button className="plain-link" onClick={() => changePage('appliances')}>All appliances <IonIcon icon={chevronForwardOutline} /></button></div>
                {dashboard?.top_appliances?.length ? <div className="appliance-strip">{dashboard.top_appliances.slice(0, 3).map((item, index) =>
                <article className="mini-appliance" key={item.appliance_id}><span className={`mini-icon mini-${index % 3}`}><IonIcon icon={item.category === 'Cooling' ? waterOutline : item.category === 'Lighting' ? bulbOutline : flashOutline} /></span><span className="mini-copy"><strong>{item.appliance_name}</strong><span>{item.category || 'Home appliance'} · {item.quantity} {Number(item.quantity) === 1 ? 'unit' : 'units'}</span></span><span className="mini-kwh">{Number(item.current_kwh) > 0 ? <>{fmtKwh(item.current_kwh)} <span>kWh</span></> : '—'}</span></article>)}</div> :
                  <button className="start-appliances" onClick={openCreateAppliance}><span className="plus-soft"><IonIcon icon={addOutline} /></span><span><strong>A place for everything.</strong><span>Add your appliances to see where the energy is going.</span></span><IonIcon icon={chevronForwardOutline} /></button>}
                <footer className="page-footer">ENERGEIA<span>·</span> A thoughtful home is made of little things.</footer>
              </section>}

              {page === 'appliances' && <section className="view">
                <div className="content-grid"><div className="wide-content">
                  <div className="section-row section-row-tight"><div><span className="eyebrow section-eyebrow">THE THINGS THAT KEEP HOME HUMMING</span><h2>Your appliances <span className="count-badge">{appliances.length}</span></h2></div></div>
                  {appliances.length ? <div className="appliance-list">{appliances.map((appliance, index) => {
                    const applianceSchedules = schedules[appliance.appliance_id] || [];
                    const current = dashboard?.top_appliances?.find((row) => row.appliance_id === appliance.appliance_id);
                    return <article className="appliance-card" key={appliance.appliance_id}><div className="appliance-head"><span className={`appliance-icon appliance-icon-${index % 4}`}><IonIcon icon={appliance.category === 'Cooling' ? waterOutline : appliance.category === 'Lighting' ? bulbOutline : appliance.category === 'Kitchen' ? flashOutline : pulseOutline} /></span>
                      <div className="appliance-name"><h3>{appliance.appliance_name}</h3><span>{appliance.category || 'Home appliance'} <span>·</span> {appliance.wattage} W <span>·</span> {appliance.quantity} {Number(appliance.quantity) === 1 ? 'unit' : 'units'}</span></div>
                      <div className="appliance-consumption"><strong>{Number(current?.current_kwh) > 0 ? <>{fmtKwh(current.current_kwh)} <span>kWh</span></> : '—'}</strong><span>{Number(current?.current_kwh) > 0 ? 'this billing period' : 'No active schedule'}</span></div>
                      <button className="icon-button" title="Edit appliance" onClick={() => { setEditingAppliance(appliance); openModal('appliance', { appliance_name: appliance.appliance_name, category: appliance.category || 'Cooling', wattage: appliance.wattage, quantity: appliance.quantity }); }}><IonIcon icon={createOutline} /></button>
                      <button className="icon-button delete-button" title="Remove appliance" onClick={() => deleteAppliance(appliance)}><IonIcon icon={trashOutline} /></button>
                    </div>
                    <div className="schedule-divider" />
                    <div className="schedule-head"><span className="eyebrow section-eyebrow">USAGE SCHEDULES</span><button className="small-add" onClick={() => { setActiveScenario(appliance); setEditingSchedule(null); openModal('schedule'); }}><IonIcon icon={addOutline} /> Add schedule</button></div>
                    {applianceSchedules.length ? <div className="schedule-list">{applianceSchedules.map((schedule) => <div className={`schedule-item${schedule.is_active ? '' : ' schedule-inactive'}`} key={schedule.schedule_id}>
                      <span className="schedule-indicator">{schedule.is_active ? <span /> : <IonIcon icon={closeOutline} />}</span><div className="schedule-copy"><strong>{schedule.days_of_week.join(' · ')}</strong><span>{schedule.hours_per_day} {Number(schedule.hours_per_day) === 1 ? 'hour' : 'hours'}/day{schedule.start_time ? ` · starting ${schedule.start_time.slice(0, 5)}` : ''}</span></div>
                      <button className={`schedule-switch${schedule.is_active ? ' is-on' : ''}`} aria-label={`${schedule.is_active ? 'Pause' : 'Activate'} schedule`} onClick={() => setScheduleActive(schedule, !schedule.is_active)}><span /></button>
                      <button className="icon-button subtle-icon" title="Edit schedule" onClick={() => { setActiveScenario(appliance); setEditingSchedule(schedule); openModal('schedule', { hours_per_day: schedule.hours_per_day, start_time: schedule.start_time?.slice(0, 5) || '' }); }}><IonIcon icon={createOutline} /></button>
                      <button className="icon-button delete-button subtle-icon" title="Delete schedule" onClick={() => deleteSchedule(schedule)}><IonIcon icon={trashOutline} /></button>
                    </div>)}</div> : <div className="schedule-empty"><IonIcon icon={timeOutline} /><span>No schedule just yet. Add one to start estimating its energy use.</span></div>}
                    </article>;
                  })}</div> : <div className="empty-state"><span className="empty-state-symbol"><IonIcon icon={flashOutline} /></span><div className="eyebrow">EVERY HOME HAS ITS RHYTHM</div><h3>Let’s start with what’s<br />around the house.</h3><p>Enter an appliance’s name, wattage, and how often it runs. You can add weekday and weekend schedules separately.</p><IonButton className="primary-button" onClick={openCreateAppliance}><IonIcon icon={addOutline} slot="start" /> Add your first appliance</IonButton></div>}
                </div><aside className="side-note"><span className="side-note-icon"><IonIcon icon={sparklesOutline} /></span><div className="eyebrow">A NOTE ABOUT ENERGY</div><h3>Wattage is only part of the story.</h3><p>How long something runs matters just as much. Add a schedule to see an appliance’s estimated monthly usage and share of your bill.</p><button className="inline-link" onClick={() => changePage('insights')}>See helpful tips <IonIcon icon={chevronForwardOutline} /></button><div className="side-note-bottom">Small adjustments, thoughtfully made.</div></aside></div>
                <footer className="page-footer">ENERGEIA<span>·</span> Your saved history always stays intact.</footer>
              </section>}

              {page === 'history' && <section className="view">
                <article className="history-callout"><div><span className="eyebrow">{hasUsage ? 'THIS IS AN ESTIMATE, NOT A SURPRISE' : 'YOUR ESTIMATE WILL APPEAR HERE'}</span><h2>{hasUsage ? <>{fmtKwh(dashboard?.current_kwh)} <span>kWh</span><span className="history-divider">·</span>{Number(selectedRate?.rate_per_kwh) > 0 ? fmtMoney(dashboard?.estimated_cost) : 'Set your rate'}</> : 'No estimate yet'}</h2><p>{hasUsage ? `Your estimated household usage and electricity cost for ${PERIOD_LABEL}. Only active schedules are included.` : 'Add an appliance and an active usage schedule to start estimating your household usage and bill.'}</p></div>
                  {hasUsage && <IonButton className="primary-button compact-button" onClick={calculateCurrentPeriod}><IonIcon icon={pulseOutline} slot="start" />Save this period</IonButton>}
                </article>
                <div className="section-row"><div><span className="eyebrow section-eyebrow">A LITTLE CONTEXT</span><h2>Your billing periods</h2></div><span className="plain-meta">Current and previous saved periods</span></div>
                {bills.length ? <div className="bill-table-wrap"><table className="bill-table"><thead><tr><th>BILLING PERIOD</th><th>PROVIDER & RATE</th><th>ESTIMATED USAGE</th><th>ESTIMATED BILL</th><th>ACTUAL BILL</th><th /></tr></thead><tbody>{bills.map((bill) => <tr key={bill.bill_id}><td><strong>{new Date(`${bill.period_start}T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' })}</strong><span>{bill.period_start} — {bill.period_end}</span></td><td><strong>{bill.provider_name}</strong><span>₱{Number(bill.rate_per_kwh).toFixed(2)} / kWh</span></td><td><strong>{fmtKwh(bill.total_kwh)} <span>kWh</span></strong></td><td><strong>{fmtMoney(bill.estimated_cost)}</strong></td><td>{bill.actual_bill_amount != null ? <strong>{fmtMoney(bill.actual_bill_amount)}</strong> : <button className="add-actual" onClick={() => { setActiveScenario(bill); openModal('actual-bill'); }}>+ Add actual bill</button>}</td><td>{bill.actual_bill_amount != null ? <span className={`bill-delta${Number(bill.actual_bill_amount) >= Number(bill.estimated_cost) ? ' delta-warm' : ''}`} title="Actual bill compared with estimate">{Number(bill.actual_bill_amount) >= Number(bill.estimated_cost) ? '+' : '−'}{fmtMoney(Math.abs(Number(bill.actual_bill_amount) - Number(bill.estimated_cost)))}</span> : <IonIcon className="bill-arrow" icon={chevronForwardOutline} />}</td></tr>)}</tbody></table></div> :
                  <div className="empty-inline history-empty"><span className="empty-icon"><calendarClearOutline /></span><div><strong>No billing periods saved yet.</strong><p>Add appliances and active usage schedules to create your first estimate and billing period.</p></div><button className="plain-link" onClick={() => changePage('appliances')}>Manage appliances <IonIcon icon={chevronForwardOutline} /></button></div>}
                <footer className="page-footer">ENERGEIA<span>·</span> Each bill keeps the provider rate that was in effect at the time.</footer>
              </section>}

              {page === 'insights' && <section className="view">
                <article className="insight-feature"><span className="insight-decoration"><span /><span /><span /><IonIcon icon={leafOutline} /></span><div className="eyebrow">PRACTICAL, PERSONAL, NEVER PREACHY</div><h2>A couple of things<br />worth a second look.</h2><p>Based on your saved schedules. Yours to use—or simply dismiss.</p></article>
                <div className="section-row"><div><span className="eyebrow section-eyebrow">NOTICED AROUND YOUR HOME</span><h2>Ideas for your household</h2></div><span className="plain-meta">{recommendations.length} {recommendations.length === 1 ? 'thought' : 'thoughts'}</span></div>
                {recommendations.length ? <div className="recommendation-list">{recommendations.map((recommendation, index) => <article className="recommendation-card" key={recommendation.recommendation_id}>
                  <span className={`recommendation-number recommendation-num-${index % 3}`}>0{index + 1}</span><div className="recommendation-content"><div className="eyebrow recommendation-type">{recommendation.appliance_name || 'AROUND THE HOUSE'}</div><p>{recommendation.message}</p><div className="recommendation-savings"><span><IonIcon icon={trendingDownOutline} /> POTENTIAL SAVINGS</span><strong>{fmtKwh(recommendation.potential_savings_kwh)} kWh <span>·</span> {fmtMoney(recommendation.potential_savings_cost)}</strong></div></div>
                  <button className="dismiss-button" onClick={() => dismissRecommendation(recommendation.recommendation_id)}>Dismiss <IonIcon icon={closeOutline} /></button>
                </article>)}</div> : <div className="empty-inline insight-empty"><span className="empty-icon"><IonIcon icon={sparklesOutline} /></span><div><strong>Nothing to nag you about. Promise.</strong><p>When an appliance or usage pattern stands out, we’ll share a practical, personalized idea here.</p></div></div>}
                <article className="reco-explainer"><IonIcon icon={checkmarkCircleOutline} /><p>Our suggestions are based on your wattage, household rate, and saved appliance schedules. Any potential savings shown are estimates, not guarantees.</p></article>
                <footer className="page-footer">ENERGEIA<span>·</span> Good habits grow quietly.</footer>
              </section>}

              {page === 'scenarios' && <section className="view">
                <article className="scenario-intro"><div className="scenario-orb"><IonIcon icon={bulbOutline} /><span>✳</span></div><div><span className="eyebrow">A GENTLE EXPERIMENT</span><h2>Change the hours.<br />Keep the what-ifs.</h2><p>Try a smaller schedule, a different quantity, or both. See the estimated difference—without touching what your household actually uses.</p><button className="text-action scenario-create" onClick={() => openModal('scenario-create')} disabled={!appliances.length}><IonIcon icon={addOutline} /> Make a what-if plan <IonIcon icon={chevronForwardOutline} /></button></div></article>
                <div className="section-row"><div><span className="eyebrow section-eyebrow">AN IDEA ISN’T A COMMITMENT</span><h2>Your saved plans</h2></div><span className="plain-meta">{scenarios.length} {scenarios.length === 1 ? 'plan' : 'plans'}</span></div>
                {scenarios.length ? <div className="scenario-layout"><div className="scenario-list">{scenarios.map((scenario, index) => <article className={`scenario-row${activeScenario?.scenario_id === scenario.scenario_id ? ' scenario-row-active' : ''}`} key={scenario.scenario_id}><button className="scenario-open" onClick={() => showScenario(scenario)}><span className={`scenario-index scenario-index-${index % 3}`}>0{index + 1}</span><span className="scenario-row-copy"><strong>{scenario.scenario_name}</strong><span>Saved {new Date(`${scenario.created_at}Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span><span className="scenario-row-result">{fmtMoney(scenario.scenario_cost)}<span>estimated bill</span></span><IonIcon icon={chevronForwardOutline} /></button><button className="icon-button delete-button" aria-label={`Delete ${scenario.scenario_name}`} onClick={() => deleteScenario(scenario)}><IonIcon icon={trashOutline} /></button></article>)}</div>
                  {scenarioResults && <article className="scenario-result"><div className="eyebrow">A GENTLE COMPARISON</div><h3>{scenarioResults.scenario_name || activeScenario?.scenario_name || 'Quick preview'}</h3><div className="compare-item"><span>Current estimated bill</span><strong>{fmtMoney(scenarioResults.current_cost)}</strong><small>{fmtKwh(scenarioResults.current_kwh)} kWh</small></div><div className="compare-item compare-proposed"><span>What-if estimated bill</span><strong>{fmtMoney(scenarioResults.scenario_cost)}</strong><small>{fmtKwh(scenarioResults.scenario_kwh)} kWh</small></div><div className={`compare-difference${Number(scenarioResults.savings_cost) >= 0 ? '' : ' compare-increase'}`}><IonIcon icon={Number(scenarioResults.savings_cost) >= 0 ? trendingDownOutline : arrowUpOutline} /><span>{Number(scenarioResults.savings_cost) >= 0 ? 'Potential savings' : 'Potential increase'}</span><strong>{fmtMoney(Math.abs(Number(scenarioResults.savings_cost)))}</strong></div>
                      {scenarioResults.items?.length > 0 && <div className="scenario-saved-items"><div className="eyebrow">SAVED ADJUSTMENTS</div>{scenarioResults.items.map((item) => <div key={item.appliance_id}><span>{item.appliance_name}</span><strong>{item.adjusted_hours_per_day != null ? `${Number(item.adjusted_hours_per_day)} hrs/day` : 'Current hours'}<span> · </span>{item.adjusted_quantity != null ? `${item.adjusted_quantity} units` : 'Current quantity'}</strong></div>)}</div>}</article>}
                </div> : <div className="empty-inline scenario-empty"><span className="empty-icon"><IonIcon icon={bulbOutline} /></span><div><strong>Just a little room to imagine.</strong><p>Add at least one appliance to start exploring changes without changing your actual usage.</p></div>{appliances.length > 0 && <button className="plain-link" onClick={() => openModal('scenario-create')}>Make a plan <IonIcon icon={chevronForwardOutline} /></button>}</div>}
                {scenarioResults && appliances.length > 0 && <><div className="section-row scenario-edit-heading"><div><span className="eyebrow section-eyebrow">NOT READY TO SAVE?</span><h2>Try changing a few things</h2></div><span className="plain-meta">Just a preview. Nothing is saved.</span></div><form className="scenario-preview-card" onSubmit={runScenario}><div className="preview-head"><span>APPLIANCE</span><span>HOURS / DAY</span><span>QUANTITY</span></div>{appliances.map((appliance) => <div className="preview-row" key={appliance.appliance_id}><strong>{appliance.appliance_name}</strong><label><span>HOURS / DAY</span><input className="small-native-input" type="number" name={`scenario_hours_${appliance.appliance_id}`} min="0" max="24" step=".25" placeholder={String(Number(appliance.average_hours_per_day || 0).toFixed(1))} /></label><label><span>QUANTITY</span><input className="small-native-input" type="number" name={`scenario_quantity_${appliance.appliance_id}`} min="1" step="1" placeholder={String(appliance.quantity)} /></label></div>)}<div className="preview-actions"><span>Leave a field empty to keep the current setting.</span><button type="submit" className="plain-link"><IonIcon icon={playOutline} /> Preview changes</button></div></form></>}
                <footer className="page-footer">ENERGEIA<span>·</span> Your scenarios are just possibilities, never changes to your real data.</footer>
              </section>}
            </div>
          </main>
        </div>
      </IonContent>
      <IonToast isOpen={!!notice} message={notice} duration={3000} position="top" onDidDismiss={() => setNotice('')} />

      <Modal isOpen={modal === 'appliance'} onClose={() => setModal('')} title={editingAppliance ? 'A small change.' : 'What keeps your home humming?'} subtitle={editingAppliance ? 'Update your appliance details; its saved history stays right where it is.' : 'A name and a little detail. You can add or change the schedule next.'}>
        <ModalForm busy={busy} error={error} onSubmit={saveAppliance} button={editingAppliance ? 'Save changes' : 'Add appliance'}>
          <Field label="Appliance name"><IonInput className="form-input" name="appliance_name" placeholder="e.g. Living room air conditioner" value={formFields.appliance_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <div className="form-row"><Field label="Category"><IonSelect className="form-input form-select" name="category" value={formFields.category ?? 'Cooling'} onIonChange={updateFormField} interface="popover">{CATEGORIES.map((category) => <IonSelectOption key={category} value={category}>{category}</IonSelectOption>)}</IonSelect></Field><Field label="Wattage"><IonInput className="form-input" name="wattage" type="number" min="0.01" max="100000" step="any" placeholder="e.g. 950" value={formFields.wattage ?? ''} onIonInput={updateFormField} required /><span className="field-hint">Look for the W rating on the label.</span></Field></div>
          <Field label="Number in your household"><IonInput className="form-input" name="quantity" type="number" min="1" max="999" step="1" value={formFields.quantity ?? 1} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'schedule'} onClose={() => setModal('')} title={editingSchedule ? 'A little rhythm.' : 'When does it run?'} subtitle={`${activeScenario?.appliance_name || 'Your appliance'} · Add different schedules for weekdays and weekends, if you’d like.`}>
        <ModalForm busy={busy} error={error} key={`${editingSchedule?.schedule_id || activeScenario?.appliance_id || 'new'}`} onSubmit={saveSchedule} button="Save schedule">
          <div className="field-label">Days of the week<div className="weekday-grid">{WEEKDAYS.map((day) => { const checked = editingSchedule?.days_of_week.includes(day) ?? false; return <label className="weekday-chip" key={day}><input type="checkbox" name="days" value={day} defaultChecked={checked} /><span>{day.slice(0, 1)}</span><small>{day}</small></label>; })}</div></div>
          <Field label="Operating hours per day" hint="An estimate is just fine. Add another schedule if the hours change on different days."><IonInput className="form-input" name="hours_per_day" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 8" value={formFields.hours_per_day ?? ''} onIonInput={updateFormField} required /></Field>
          <Field label="Usual start time"><IonInput className="form-input" name="start_time" type="time" value={formFields.start_time ?? ''} onIonInput={updateFormField} /></Field>
          <label className="check-field"><input type="checkbox" name="is_active" defaultChecked={editingSchedule?.is_active ?? true} /><span>Include this schedule in my energy estimates</span></label>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'household'} onClose={() => { setModal(''); setEditingHousehold(null); }} title={editingHousehold ? 'A name that feels like yours.' : 'Another home, another story.'} subtitle="You can keep multiple households and their electricity rates neatly separate.">
        <ModalForm busy={busy} error={error} onSubmit={saveHousehold} button={editingHousehold ? 'Save household details' : 'Add household'}>
          <Field label="Household name"><IonInput className="form-input" name="household_name" placeholder="e.g. Weekend cottage" value={formFields.household_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Address"><IonInput className="form-input" name="address" placeholder="City or neighbourhood (optional)" value={formFields.address ?? ''} onIonInput={updateFormField} maxlength={255} /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'account'} onClose={() => setModal('')} title="Your little corner of Energeia." subtitle="A personal space, just for your household data.">
        <div className="account-card-content"><span className="account-detail-avatar">{signedInInitial}</span><div className="account-detail"><span className="eyebrow">YOUR ACCOUNT</span><strong>{user.full_name}</strong><span>{user.email}</span></div></div>
        <button className="logout-modal-button" onClick={handleLogout}><IonIcon icon={logOutOutline} /> Sign out of Energeia</button>
      </Modal>

      <Modal isOpen={modal === 'rate'} onClose={() => setModal('')} title="Every provider has its own rate." subtitle="Changing providers makes a new rate; your past bills always keep theirs.">
        <ModalForm busy={busy} error={error} onSubmit={saveRate} button="Save electricity rate" note={Number(selectedRate?.rate_per_kwh) > 0 ? `Current: ${selectedRate.provider_name} · ₱${Number(selectedRate.rate_per_kwh).toFixed(2)} per kWh` : 'Your first provider and rate will be used in future bill estimates.'}>
          <Field label="Electricity provider"><IonInput className="form-input" name="provider_name" placeholder="e.g. Meralco" value={formFields.provider_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          <Field label="Rate per kilowatt-hour (₱/kWh)" hint="Usually listed on your electricity bill."><IonInput className="form-input" name="rate_per_kwh" type="number" min="0.0001" max="999999" step=".0001" placeholder="e.g. 11.5000" value={formFields.rate_per_kwh ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'actual-bill'} onClose={() => setModal('')} title="The real number, whenever you’re ready." subtitle={`Add your electricity bill for ${activeScenario?.period_start || ''} — your estimate stays saved alongside it.`}>
        <ModalForm busy={busy} error={error} onSubmit={saveActualBill} button="Save actual bill">
          <Field label="Actual bill amount (₱)"><IonInput className="form-input" name="actual_bill_amount" type="number" min="0" max="999999999" step=".01" placeholder="e.g. 2,486.50" value={formFields.actual_bill_amount ?? ''} onIonInput={updateFormField} required /></Field>
        </ModalForm>
      </Modal>

      <Modal isOpen={modal === 'scenario-create'} onClose={() => setModal('')} title="An idea worth playing with." subtitle="Change a few hours or quantities below. We’ll only save your real appliances if you choose to save this plan.">
        <ModalForm busy={busy} error={error} onSubmit={saveScenario} button="Save my what-if plan">
          <Field label="Give your idea a name"><IonInput className="form-input" name="scenario_name" placeholder="e.g. Quieter air-con evenings" value={formFields.scenario_name ?? ''} onIonInput={updateFormField} required maxlength={150} /></Field>
          {appliances.map((appliance) => <div className="scenario-form-appliance" key={appliance.appliance_id}><strong>{appliance.appliance_name}</strong><div><label className="inline-field">Hours/day<input className="small-native-input" type="number" name={`hours_${appliance.appliance_id}`} min="0" max="24" step=".25" placeholder={Number(appliance.average_hours_per_day || 0).toFixed(1)} /></label><label className="inline-field">Quantity<input className="small-native-input" type="number" name={`quantity_${appliance.appliance_id}`} min="1" max="999" step="1" placeholder={String(appliance.quantity)} /></label></div><span>Leave blank to keep the current setting.</span></div>)}
        </ModalForm>
      </Modal>
    </IonPage>
  </IonApp>;
}

export default App;
