import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('API errors', () => {
  it('explains FastAPI input validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        detail: [{ loc: ['body', 'email'], msg: 'Enter a valid email address.', type: 'value_error' }],
      }), { status: 422, headers: { 'Content-Type': 'application/json' } }),
    ));

    await expect(request('/auth/login', { method: 'POST', body: {} }))
      .rejects.toThrow('Enter a valid email address.');
  });

  it('uses the server message for ordinary API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'That email and password do not match.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(request('/auth/login', { method: 'POST', body: {} }))
      .rejects.toThrow('That email and password do not match.');
  });
});


describe('session and response reliability', () => {
  it('clears an expired session and notifies the app', async () => {
    localStorage.setItem('energeia_token', 'expired');
    const listener = vi.fn();
    window.addEventListener('energeia:session-expired', listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Expired"}', { status: 401 })));
    await expect(request('/households')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('energeia_token')).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('energeia:session-expired', listener);
  });

  it('does not expire a newer session after an older request fails', async () => {
    localStorage.setItem('energeia_token', 'old');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      localStorage.setItem('energeia_token', 'new');
      return new Response('{"detail":"Expired"}', { status: 401 });
    }));
    await expect(request('/households')).rejects.toThrow('Expired');
    expect(localStorage.getItem('energeia_token')).toBe('new');
  });

  it('keeps the session when the current password is wrong', async () => {
    localStorage.setItem('energeia_token', 'valid');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Your current password is incorrect.'}), { status: 401 })));
    await expect(request('/auth/password/change', { method: 'POST', body: {} })).rejects.toThrow('current password is incorrect');
    expect(localStorage.getItem('energeia_token')).toBe('valid');
  });

  it('rejects invalid successful responses instead of rendering null data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>')));
    await expect(request('/households')).rejects.toThrow('invalid response');
  });
});
