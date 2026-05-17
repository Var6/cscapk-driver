import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type DriverStatus = 'available' | 'on_trip' | 'offline';

export interface Driver {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  license_no: string | null;
  status: DriverStatus;
  vehicle_plate: string | null;
  base_salary: number;
  per_km_rate: number;
  rating: number;
  trips_count: number;
  active: boolean;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  driver: Driver | null;
  loading: boolean;
  driverNotFound: boolean;
  refresh: () => Promise<void>;
  setStatus: (s: DriverStatus) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, user: null, driver: null, loading: true, driverNotFound: false,
  refresh: async () => {}, setStatus: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [driverNotFound, setDriverNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadDriver(userId: string) {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) console.warn('driver load failed', error);
    setDriver((data as Driver) ?? null);
    setDriverNotFound(!data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadDriver(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) loadDriver(s.user.id);
      else { setDriver(null); setDriverNotFound(false); }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        driver,
        loading,
        driverNotFound,
        refresh: async () => { if (session?.user) await loadDriver(session.user.id); },
        setStatus: async (s) => {
          if (!session?.user) return;
          await supabase.from('drivers').update({ status: s }).eq('id', session.user.id);
          await loadDriver(session.user.id);
        },
        signOut: async () => {
          if (session?.user) {
            await supabase.from('drivers').update({ status: 'offline' }).eq('id', session.user.id);
          }
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
