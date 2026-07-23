import request from './client';

export function signup({ name, email, password }) {
  return request('/auth/signup', { method: 'POST', body: { name, email, password }, auth: false });
}

export function login({ email, password }) {
  return request('/auth/login', { method: 'POST', body: { email, password }, auth: false });
}
