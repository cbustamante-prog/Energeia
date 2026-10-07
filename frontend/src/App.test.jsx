import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Energeia', () => {
  it('welcomes new visitors with the sign-in form', async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Good to see you.' })).toBeTruthy();
    expect(container.querySelector('.brand-image')?.getAttribute('src')).toBe('/energeia-logo.png');
  });

  it('lets a visitor switch to account registration', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create your account' }));

    expect(await screen.findByRole('heading', { name: 'Let’s get started.' })).toBeTruthy();
    expect(screen.getByText('Your name')).toBeTruthy();
  });
});
