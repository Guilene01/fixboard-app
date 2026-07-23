import request from './client';

export function getUnreadCount() {
  return request('/notifications/unread-count');
}

export function markNotificationsRead() {
  return request('/notifications/read', { method: 'PATCH' });
}
