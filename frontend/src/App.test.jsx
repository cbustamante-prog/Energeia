import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('Energeia', () => {
  it('welcomes new visitors with the sign-in form', async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(container.querySelector('.brand-image')?.getAttribute('src')).toBe('/energeia-logo.png');
  });

  it('lets a visitor switch to account registration', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create your account' }));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByText('Your name')).toBeTruthy();
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
      '/auth/me': { user_id: 1, full_name: 'Alex Rivera', email: 'alex@example.com' },
      '/households': [household],
      '/rates': [{ rate_id: 1, provider_name: 'Sample Utility', rate_per_kwh: 11.25 }],
      '/households/1/appliances': [],
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
    expect(container.querySelectorAll('.mobile-nav-item')).toHaveLength(5);

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
      ['Home', 'Home'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: navLabel }));
      await waitFor(() => expect(container.querySelector('.page-intro h1')?.textContent).toBe(heading));
      expect(document.documentElement.dataset.theme).toBe('dark');
    }
  });
});
