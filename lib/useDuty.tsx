import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { pingLocation } from './trips';
import { useAuth } from './auth';

/**
 * Duty state and the location heartbeat.
 *
 * One timer for the whole app. It does two jobs at once, which is why it lives
 * here rather than inside a screen:
 *
 *   - Dispatch only offers rides to drivers whose position is fresh, so the
 *     heartbeat is what keeps a driver visible.
 *   - While a trip is running, each ping is what the server accumulates into
 *     the GPS trail that the odometer reading is checked against.
 *
 * The second point is the reason the interval tightens during a trip: a sparse
 * trail is itself a flag at completion, so an honest driver needs a dense one.
 * It is also why pings continue while the app is backgrounded — a driver who
 * switches away to navigate should not accrue a suspicious gap.
 */

const IDLE_INTERVAL_MS = 20_000;
const ON_TRIP_INTERVAL_MS = 10_000;

interface DutyCtx {
  onDuty: boolean;
  /** Last known position, or null before the first fix. */
  position: { lat: number; lng: number } | null;
  permission: 'granted' | 'denied' | 'unknown';
  /** Distance the server has tracked for the running trip, km. */
  trackedKm: number | null;
  activeTripId: string | null;
  error: string | null;
  toggleDuty: (next: boolean) => Promise<void>;
  /** Forces a ping now — used right after starting or ending a trip. */
  pingNow: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
}

const Ctx = createContext<DutyCtx>({
  onDuty: false,
  position: null,
  permission: 'unknown',
  trackedKm: null,
  activeTripId: null,
  error: null,
  toggleDuty: async () => {},
  pingNow: async () => {},
  requestPermission: async () => false,
});

export function DutyProvider({ children }: { children: ReactNode }) {
  const { driver, patchDriver } = useAuth();

  const [onDuty, setOnDuty] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [permission, setPermission] = useState<DutyCtx['permission']>('unknown');
  const [trackedKm, setTrackedKm] = useState<number | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mirrors of state for the timer, which closes over its first render.
  const onDutyRef = useRef(false);
  const activeRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onDutyRef.current = onDuty; }, [onDuty]);
  useEffect(() => { activeRef.current = activeTripId; }, [activeTripId]);

  // Adopt whatever duty state the server already has for this driver, so a
  // restart mid-shift does not silently drop them off duty.
  useEffect(() => {
    if (driver) setOnDuty(driver.onDuty);
  }, [driver?.id]);

  const requestPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    setPermission(granted ? 'granted' : 'denied');
    if (!granted) setError('Location permission is required to receive rides.');
    return granted;
  }, []);

  const pingNow = useCallback(async () => {
    if (!driver) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');

      const fix = await Location.getCurrentPositionAsync({
        // Highest accuracy the platform will give — this feeds the distance
        // trail that a driver's meter reading is measured against.
        accuracy: Location.Accuracy.High,
      });

      const at = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setPosition(at);

      const res = await pingLocation(at.lat, at.lng, onDutyRef.current);
      setActiveTripId(res.activeTripId);
      setTrackedKm(res.gpsKm);
      setError(null);
    } catch (e: any) {
      // Never surface a transient ping failure as a hard error — the driver
      // can do nothing about it and the next tick usually recovers.
      if (e?.status === 401) setError('Session expired. Please sign in again.');
    }
  }, [driver]);

  // The heartbeat. setTimeout rather than setInterval so a slow ping cannot
  // stack up overlapping requests on bad mobile data.
  useEffect(() => {
    if (!driver) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (onDutyRef.current || activeRef.current) await pingNow();
      if (cancelled) return;
      timer.current = setTimeout(tick, activeRef.current ? ON_TRIP_INTERVAL_MS : IDLE_INTERVAL_MS);
    };

    tick();

    // Fire immediately on foreground so the driver is visible to dispatch the
    // moment they pick the phone up, instead of up to 20s later.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && (onDutyRef.current || activeRef.current)) pingNow();
    });

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      sub.remove();
    };
  }, [driver?.id, pingNow]);

  const toggleDuty = useCallback(async (next: boolean) => {
    if (next) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    setOnDuty(next);
    onDutyRef.current = next;
    patchDriver({ onDuty: next });
    await pingNow();
  }, [pingNow, requestPermission, patchDriver]);

  return (
    <Ctx.Provider
      value={{ onDuty, position, permission, trackedKm, activeTripId, error, toggleDuty, pingNow, requestPermission }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useDuty = () => useContext(Ctx);
