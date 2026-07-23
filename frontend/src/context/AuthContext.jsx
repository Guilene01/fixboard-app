import { createContext, useContext, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setToken, clearToken, getToken } from '../api/client';

const USER_KEY = 'fixboard_user';

const AuthContext = createContext(null);

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? loadStoredUser() : null));

  const persist = useCallback((token, user) => {
    setToken(token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUser(user);
  }, []);

  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials);
      persist(data.token, data.user);
      return data.user;
    },
    [persist]
  );

  const signup = useCallback(
    async (details) => {
      const data = await authApi.signup(details);
      persist(data.token, data.user);
      return data.user;
    },
    [persist]
  );

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
