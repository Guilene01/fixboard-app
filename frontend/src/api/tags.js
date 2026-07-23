import request from './client';

export function listTags() {
  return request('/tags');
}
