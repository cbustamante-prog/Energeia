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
