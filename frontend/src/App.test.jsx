import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

beforeEach(() => {
  window.history.replaceState(null, '', '/login');
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('Energeia', () => {
  it('introduces real features and links to registration from the landing page', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Small habits/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get started' }).getAttribute('href')).toBe('/register');
    expect(screen.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href')).toBe('/login');
  });

  it('preserves the intended private route when redirecting to sign-in', async () => {
    window.history.replaceState(null, '', '/scenarios');
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/scenarios');
  });


  it('waits for household loading before showing a failure state', async () => {
    let finishHouseholds;
    const pendingHouseholds = new Promise((resolve) => { finishHouseholds = resolve; });
    localStorage.setItem('energeia_token', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => url.endsWith('/auth/me')
        ? { user_id: 1, profile_complete: true, full_name: 'Alex' }
        : pendingHouseholds,
    })));
    const { container } = render(<App />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/households'), expect.any(Object)));
    expect(container.querySelector('.app-loading')).toBeTruthy();
    expect(screen.queryByText('Your household could not be loaded')).toBeNull();
    finishHouseholds([]);
    expect(await screen.findByRole('heading', { name: 'Set up your household' })).toBeTruthy();
  });

  it('loads the real sign-in route', async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(container.querySelector('.brand-image')?.getAttribute('src')).toBe('/energeia-logo.png');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeTruthy();
  });

  it('lets a visitor switch to account registration', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByText('First name')).toBeTruthy();
    expect(screen.getByText('Confirm password')).toBeTruthy();
  });

  it('toggles and persists the selected color theme', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' });
    fireEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('energeia_theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('energeia_theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('uses the system theme until a preference is saved', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('energeia_theme')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(window.localStorage.getItem('energeia_theme')).toBe('light');
  });

  it('keeps a saved light preference when the system prefers dark', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    window.localStorage.setItem('energeia_theme', 'light');
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeTruthy();
  });

  it('shows the responsive energy dashboard with live household values', async () => {
    const dashboard = {
      has_usage: true,
      current_kwh: 75.2,
      estimated_cost: 846,
      previous_kwh: 83.1,
      weekly: [{ day: 'Mon', kwh: 8 }],
      top_appliances: [],
    };
    const household = { household_id: 1, household_name: 'My home', address: 'Cebu City', rate_id: 1 };
    const responses = {
      '/auth/me': { user_id: 1, full_name: 'Alex Rivera', email: 'alex@example.com', profile_complete: true },
      '/auth/providers': { providers: [], password_enabled: true },
      '/households': [household],
      '/rates': [{ rate_id: 1, provider_name: 'Sample Utility', rate_per_kwh: 11.25 }],
      '/households/1/appliances': [
        { appliance_id: 1, appliance_name: 'Desk fan', category: 'Electronics', wattage: 60, quantity: 1, average_hours_per_day: 2 },
        { appliance_id: 2, appliance_name: 'Air conditioner', category: 'Cooling', wattage: 1200, quantity: 1, average_hours_per_day: 4 },
      ],
      '/appliances/1/schedules': [],
      '/appliances/2/schedules': [],
      '/households/1/bills': [],
      '/households/1/recommendations': [],
      '/households/1/scenarios': [],
      '/households/1/calculate': { current_kwh: dashboard.current_kwh, estimated_cost: dashboard.estimated_cost, has_usage: true },
      '/households/1/dashboard': dashboard,
    };
    const fetchMock = vi.fn(async (url) => {
      const path = new URL(url).pathname.replace('/api', '');
      return {
        ok: true,
        status: 200,
        json: async () => responses[path] ?? null,
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('energeia_token', 'test-token');

    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector('.page-intro h1')?.textContent).toBe('Home'));
    await waitFor(() => expect(container.querySelector('.metric-card-primary strong')?.textContent).toContain('75.2'));
    expect(document.body.querySelectorAll('.mobile-nav-item')).toHaveLength(6);

    const menuButton = container.querySelector('.menu-toggle');
    expect(menuButton?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menuButton);
    expect(menuButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.sidebar')?.classList.contains('sidebar-open')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menuButton?.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    for (const [navLabel, heading] of [
      ['Appliances', 'Appliances'],
      ['Usage', 'Usage & Bills'],
      ['Insights', 'Energy Tips'],
      ['Planner', 'What-if Planner'],
      ['Account', 'Account settings'],
      ['Home', 'Home'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: navLabel }));
      await waitFor(() => expect(container.querySelector('.page-intro h1')?.textContent).toBe(heading));
      expect(document.documentElement.dataset.theme).toBe('dark');
      if (navLabel === 'Appliances') {
        const names = () => [...container.querySelectorAll('.appliance-name h3')].map((item) => item.textContent);
        expect(names()).toEqual(['Desk fan', 'Air conditioner']);
        fireEvent.click(screen.getByRole('button', { name: /Wattage: high to low/ }));
        expect(names()).toEqual(['Air conditioner', 'Desk fan']);
        fireEvent.click(screen.getByRole('button', { name: /Wattage: high to low/ }));
        await screen.findByRole('button', { name: /Wattage: low to high/ });
        expect(names()).toEqual(['Desk fan', 'Air conditioner']);
      }
    }
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/me'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/calculate'))).toHaveLength(1);
  });
});
