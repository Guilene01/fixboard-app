import { API_URL } from '../api/client';

export function assetUrl(path) {
  if (!path) return path;
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}
