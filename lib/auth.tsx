import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  license: string | null;
  /** Set by the office from the console. */
  status: 'available' | 'on-trip' | 'offline';
  /** Set by the driver from this app — the duty toggle on the home screen. */
  onDuty: boolean;
  vehicle: string | null;
  vehicleId: string | null;
  rating: number;
  trips: number;
  baseSalary: number;
  perKmRate: number;
}

interface AuthCtx {
  driver: Driver | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Optimistic local patch, so the duty switch does not lag a round-trip. */
  patchDriver: (patch: Partial<Driver>) => void;
}

const Ctx = createContext<AuthCtx>({
  driver: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
  patchDriver: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ driver: Driver }>('/api/driver/auth/me');
      setDriver(res.driver);
    } catch (e: any) {
      // Only a rejected token signs the driver out. A network blip must not —
      // drivers work in patchy coverage and being logged out mid-trip is worse
      // than a stale profile.
      if (e?.status === 401) {
        await setToken(null);
        setDriver(null);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn: AuthCtx['signIn'] = async (identifier, password) => {
    const res = await api<{ token: string; driver: Driver }>('/api/driver/auth/login', {
      method: 'POST',
      auth: false,
      body: { identifier, password },
    });
    await setToken(res.token);
    setDriver(res.driver);
  };

  const signOut = async () => {
    // Best-effort: drop off duty so dispatch stops offering rides to a phone
    // that is no longer watching. Failure here must not block signing out.
    try {
      await api('/api/driver/location', {
        method: 'POST',
        body: { lat: 0, lng: 0, onDuty: false },
      });
    } catch {}
    await setToken(null);
    setDriver(null);
  };

  return (
    <Ctx.Provider
      value={{
        driver,
        loading,
        signIn,
        signOut,
        refresh,
        patchDriver: (patch) => setDriver((d) => (d ? { ...d, ...patch } : d)),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
