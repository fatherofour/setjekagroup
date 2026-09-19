'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface LoginResponse extends TokenPair {
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => void;
  authedFetch: <T>(
    path: string,
    options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; formData?: FormData },
  ) => Promise<T>;
}

const ACCESS_KEY = 'setjeka_access_token';
const REFRESH_KEY = 'setjeka_refresh_token';
const USER_KEY = 'setjeka_user';

type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage {
  return kind === 'local' ? localStorage : sessionStorage;
}

function clearStorage(kind: StorageKind) {
  const store = getStorage(kind);
  store.removeItem(ACCESS_KEY);
  store.removeItem(REFRESH_KEY);
  store.removeItem(USER_KEY);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [storageKind, setStorageKind] = useState<StorageKind>('local');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      // Session storage is per-tab, so a "not remembered" login in this tab
      // takes priority over a "remembered" one sitting in localStorage.
      for (const kind of ['session', 'local'] as const) {
        const store = getStorage(kind);
        const storedAccess = store.getItem(ACCESS_KEY);
        const storedRefresh = store.getItem(REFRESH_KEY);
        const storedUser = store.getItem(USER_KEY);
        if (storedAccess && storedRefresh && storedUser) {
          setStorageKind(kind);
          setAccessToken(storedAccess);
          setRefreshToken(storedRefresh);
          setUser(JSON.parse(storedUser));
          break;
        }
      }
    } catch {
      // localStorage/sessionStorage unavailable (private mode, etc.) - fall through to logged-out state
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((tokens: TokenPair, nextUser: AuthUser, kind: StorageKind) => {
    clearStorage(kind === 'local' ? 'session' : 'local');
    const store = getStorage(kind);
    store.setItem(ACCESS_KEY, tokens.accessToken);
    store.setItem(REFRESH_KEY, tokens.refreshToken);
    store.setItem(USER_KEY, JSON.stringify(nextUser));
    setStorageKind(kind);
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearStorage('local');
    clearStorage('session');
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password, rememberMe },
      });
      persist(res, res.user, rememberMe ? 'local' : 'session');
    },
    [persist],
  );

  const authedFetch = useCallback(
    async <T,>(
      path: string,
      options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; formData?: FormData } = {},
    ): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...options, accessToken });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401 && refreshToken) {
          const refreshed = await apiFetch<TokenPair>('/auth/refresh', { method: 'POST', body: { refreshToken } }).catch(() => null);
          if (refreshed && user) {
            persist(refreshed, user, storageKind);
            return apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
          }
        }
        if (err instanceof ApiError && err.status === 401) logout();
        throw err;
      }
    },
    [accessToken, refreshToken, user, storageKind, persist, logout],
  );

  const value = useMemo(
    () => ({ user, accessToken, loading, login, logout, authedFetch }),
    [user, accessToken, loading, login, logout, authedFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
