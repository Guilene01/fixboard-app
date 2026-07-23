import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getUnreadCount } from '../api/notifications';
import { useAuth } from './AuthContext';

const POLL_INTERVAL_MS = 20000;

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { count } = await getUnreadCount();
      setUnreadCount(count);
    } catch {
      // transient network errors shouldn't crash the badge
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshUnreadCount]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
