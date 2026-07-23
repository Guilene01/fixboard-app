export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'fixboard_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || 'Something went wrong', res.status);
  }

  return data;
}

// Multipart uploads: no Content-Type header (the browser sets the
// multipart boundary itself) and the body is a FormData, not JSON.
export async function uploadRequest(path, formData) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401 && token) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || 'Upload failed', res.status);
  }

  return data;
}

export default request;
