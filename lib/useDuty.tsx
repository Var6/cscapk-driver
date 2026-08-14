import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { pingLocation } from './trips';
import { useAuth } from './auth';
import {
  endShift, flush, hoursBetween, listShifts, openShift, startOfMonth, startOfToday,
  startOfWeek, startShift, type Shift,
} from './shift';

/**
 * Duty state, the location heartbeat, and the payroll clock.
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
 *
 * Alongside that, a *watcher* runs whenever the driver is on duty or on a trip.
 * The heartbeat is for the server; the watcher is for the map. A marker that
 * only moved every twenty seconds would jump between blocks, which is the
 * difference between a map that looks alive and one that looks broken.
 *
 * Going on and off duty also opens and closes a shift record, because payroll
 * is settled by the hour. See shift.ts.
 */

const IDLE_INTERVAL_MS = 20_000;
const ON_TRIP_INTERVAL_MS = 10_000;

/** Points kept for the on-screen breadcrumb. Enough for a long city ride. */
const MAX_TRAIL_POINTS = 400;

interface DutyCtx {
  onDuty: boolean;
  /** Last known position, or null before the first fix. */
  position: { lat: number; lng: number } | null;
  /** Degrees from north — points the car marker the way it is travelling. */
  heading: number | null;
  speedKmh: number;
  /** Where the driver has been since the current trip started. */
  trail: { lat: number; lng: number }[];
  permission: 'granted' | 'denied' | 'unknown';
  /** Distance the server has tracked for the running trip, km. */
  trackedKm: number | null;
  activeTripId: string | null;
  error: string | null;
  /** The shift currently being worked, or null when off duty. */
  shift: Shift | null;
  hoursToday: number;
  hoursWeek: number;
  hoursMonth: number;
  toggleDuty: (next: boolean) => Promise<void>;
  /** Forces a ping now — used right after starting or ending a trip. */
  pingNow: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  /** Re-reads the payroll ledger — for the earnings screen. */
  refreshHours: () => Promise<void>;
}

const Ctx = createContext<DutyCtx>({
  onDuty: false,
  position: null,
  heading: null,
  speedKmh: 0,
  trail: [],
  permission: 'unknown',
  trackedKm: null,
  activeTripId: null,
  error: null,
  shift: null,
  hoursToday: 0,
  hoursWeek: 0,
  hoursMonth: 0,
  toggleDuty: async () => {},
  pingNow: async () => {},
  requestPermission: async () => false,
  refreshHours: async () => {},
});

export function DutyProvider({ children }: { children: ReactNode }) {
  const { driver, patchDriver } = useAuth();

  const [onDuty, setOnDuty] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [trail, setTrail] = useState<{ lat: number; lng: number }[]>([]);
  const [permission, setPermission] = useState<DutyCtx['permission']>('unknown');
  const [trackedKm, setTrackedKm] = useState<number | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shift, setShift] = useState<Shift | null>(null);
  const [hoursToday, setHoursToday] = useState(0);
  const [hoursWeek, setHoursWeek] = useState(0);
  const [hoursMonth, setHoursMonth] = useState(0);

  // Mirrors of state for the timer, which closes over its first render.
  const onDutyRef = useRef(false);
  const activeRef = useRef<string | null>(null);
  const positionRef = useRef<{ lat: number; lng: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onDutyRef.current = onDuty; }, [onDuty]);
  useEffect(() => { activeRef.current = activeTripId; }, [activeTripId]);
  useEffect(() => { positionRef.current = position; }, [position]);

  const refreshHours = useCallback(async () => {
    if (!driver) return;
    const shifts = await listShifts(driver.id);
    setShift(shifts.find((s) => !s.endedAt) ?? null);
    setHoursToday(hoursBetween(shifts, startOfToday()));
    setHoursWeek(hoursBetween(shifts, startOfWeek()));
    setHoursMonth(hoursBetween(shifts, startOfMonth()));
  }, [driver?.id]);

  // Adopt whatever duty state the server already has for this driver, so a
  // restart mid-shift does not silently drop them off duty — and reconcile the
  // payroll ledger against it. The server is authoritative on *whether* the
  // driver is on duty (the office can force them off); the local ledger is
  // authoritative on *when*, because that is where the toggle happened.
  useEffect(() => {
    if (!driver) return;
    setOnDuty(driver.onDuty);

    (async () => {
      const running = await openShift(driver.id);
      if (driver.onDuty && !running) await startShift(driver.id, positionRef.current);
      if (!driver.onDuty && running) await endShift(driver.id, positionRef.current);
      await refreshHours();
      await flush(driver.id);
    })();
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

      // Prefer the watcher's fix. It is already at navigation accuracy and
      // seconds old, so asking the GPS again would only cost battery.
      let at = positionRef.current;
      if (!at) {
        const fix = await Location.getCurrentPositionAsync({
          // Highest accuracy the platform will give — this feeds the distance
          // trail that a driver's meter reading is measured against.
          accuracy: Location.Accuracy.High,
        });
        at = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        setPosition(at);
      }

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

  // The live watcher, for the map. Runs only while there is something to watch,
  // because a GPS stream left running off duty is the fastest way to empty a
  // driver's battery before their shift ends.
  useEffect(() => {
    if (!driver || (!onDuty && !activeTripId)) return;

    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: activeTripId ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
          timeInterval: activeTripId ? 2000 : 5000,
          distanceInterval: activeTripId ? 5 : 15,
        },
        (loc) => {
          const at = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setPosition(at);
          // Heading is null when stationary; holding the last one stops the
          // car marker from snapping back to north at every red light.
          if (loc.coords.heading != null && loc.coords.heading >= 0) setHeading(loc.coords.heading);
          setSpeedKmh(Math.max(0, loc.coords.speed ?? 0) * 3.6);

          // Breadcrumb, drawn only during a trip.
          if (activeRef.current) {
            setTrail((prev) => {
              const next = prev.length >= MAX_TRAIL_POINTS ? prev.slice(1) : prev.slice();
              next.push(at);
              return next;
            });
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [driver?.id, onDuty, activeTripId]);

  // A fresh trip gets a fresh breadcrumb.
  useEffect(() => { setTrail([]); }, [activeTripId]);

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
    // moment they pick the phone up, instead of up to 20s later. The same
    // moment is a good one to retry any duty hours that failed to upload.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (onDutyRef.current || activeRef.current) pingNow();
      flush(driver.id);
      refreshHours();
    });

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      sub.remove();
    };
  }, [driver?.id, pingNow, refreshHours]);

  // Recount the ledger every minute while a shift runs, so the hours on the
  // dashboard climb during the shift instead of jumping when it ends.
  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => { refreshHours(); }, 60_000);
    return () => clearInterval(t);
  }, [shift?.clientId, refreshHours]);

  const toggleDuty = useCallback(async (next: boolean) => {
    if (!driver) return;

    if (next) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    setOnDuty(next);
    onDutyRef.current = next;
    patchDriver({ onDuty: next });

    // Ping first when clocking in, so the shift is stamped with a real position
    // rather than whatever stale fix was lying around.
    await pingNow();

    if (next) await startShift(driver.id, positionRef.current);
    else await endShift(driver.id, positionRef.current);

    await refreshHours();
  }, [driver, pingNow, requestPermission, patchDriver, refreshHours]);

  return (
    <Ctx.Provider
      value={{
        onDuty, position, heading, speedKmh, trail, permission, trackedKm, activeTripId, error,
        shift, hoursToday, hoursWeek, hoursMonth,
        toggleDuty, pingNow, requestPermission, refreshHours,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useDuty = () => useContext(Ctx);
