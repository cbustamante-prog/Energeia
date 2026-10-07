const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function request(path, options = {}) {
  const token = localStorage.getItem('energeia_token');
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
    });
  } catch {
    throw new Error('Cannot reach the Energeia API. Start the FastAPI server and check your connection.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const validationMessages = Array.isArray(detail)
      ? detail.map((issue) => issue?.msg).filter((message) => typeof message === 'string')
      : [];
    throw new Error(
      typeof detail === 'string'
        ? detail
        : validationMessages.length
          ? validationMessages.join(' ')
          : 'The server could not complete your request.',
    );
  }
  return data;
}

export const fmtMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const fmtKwh = (value) => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
