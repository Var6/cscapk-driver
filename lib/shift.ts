import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

/**
 * Duty hours — the payroll ledger.
 *
 * Payroll is settled per hour, so "on duty" cannot just be a boolean the way it
 * was: the office needs to know *when* the driver went on and off, not only
 * that they currently are. Every duty toggle therefore opens or closes a shift
 * record here.
 *
 * The ledger is written to the device first and pushed to CSCBilling second.
 * That order matters — drivers go on duty in basements and villages with no
 * signal, and an hour that failed to upload is still an hour worked. Records
 * carry a client-generated id so the server can upsert them idempotently when
 * they do arrive; a shift is pushed once when it opens and again when it
 * closes, and the same id lands on the same row both times.
 *
 * Device time is what gets recorded. A driver who moves their clock could move
 * their hours with it, which is why the server copy is the one payroll should
 * settle against — it stamps its own received-at, and the two can be compared.
 */

export interface Shift {
  /** Generated on-device. The server upserts on this. */
  clientId: string;
  startedAt: string;
  endedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  /** Closed by the cap below rather than by the driver going off duty. */
  autoClosed: boolean;
  /** Null until CSCBilling has acknowledged this record in its current state. */
  syncedAt: string | null;
}

/**
 * A shift left open past this is capped rather than left to run.
 *
 * A driver who forgets to go off duty at night would otherwise bill the office
 * for the hours they spent asleep. Capping is the conservative direction of
 * error — the driver can have the balance corrected by the office, whereas an
 * inflated figure that is paid out silently cannot be recovered.
 */
const MAX_SHIFT_MS = 16 * 60 * 60 * 1000;

/** Shorter than this is a mis-tap, not a shift. */
const MIN_SHIFT_MS = 60 * 1000;

/** Local history horizon. The server keeps the long-term record. */
const KEEP_DAYS = 120;

const keyFor = (driverId: string) => `cscdriver.shifts.${driverId}`;

/**
 * Set once the server answers 404, so a build running against a CSCBilling that
 * has no duty-session route yet stops re-posting on every toggle. Hours keep
 * accruing locally regardless; they upload as soon as the route exists and the
 * app is restarted.
 */
let endpointMissing = false;

function newId(driverId: string) {
  return `${driverId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function read(driverId: string): Promise<Shift[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(driverId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(driverId: string, shifts: Shift[]) {
  try {
    await AsyncStorage.setItem(keyFor(driverId), JSON.stringify(shifts));
  } catch (e) {
    console.warn('Could not persist duty hours', e);
  }
}

/** Applies the runaway cap and drops records past the local horizon. */
function normalize(shifts: Shift[]): Shift[] {
  const now = Date.now();
  const horizon = now - KEEP_DAYS * 24 * 60 * 60 * 1000;

  return shifts
    .map((s) => {
      if (s.endedAt) return s;
      const started = new Date(s.startedAt).getTime();
      if (now - started <= MAX_SHIFT_MS) return s;
      return {
        ...s,
        endedAt: new Date(started + MAX_SHIFT_MS).toISOString(),
        autoClosed: true,
        // Re-sync: the server was last told this shift was still open.
        syncedAt: null,
      };
    })
    .filter((s) => new Date(s.startedAt).getTime() >= horizon)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/** Best-effort upload. Never throws — a failed push is retried on the next one. */
async function push(driverId: string, shift: Shift): Promise<boolean> {
  if (endpointMissing) return false;
  try {
    await api('/api/driver/duty-sessions', {
      method: 'POST',
      body: {
        clientId: shift.clientId,
        startedAt: shift.startedAt,
        endedAt: shift.endedAt,
        startLat: shift.startLat,
        startLng: shift.startLng,
        endLat: shift.endLat,
        endLng: shift.endLng,
        autoClosed: shift.autoClosed,
      },
    });
    return true;
  } catch (e: any) {
    if (e?.status === 404) {
      endpointMissing = true;
      console.warn(
        'CSCBilling has no /api/driver/duty-sessions route — duty hours are being kept on the device only.',
      );
    }
    return false;
  }
}

/** Uploads anything the server has not acknowledged in its current state. */
export async function flush(driverId: string): Promise<void> {
  const shifts = normalize(await read(driverId));
  const pending = shifts.filter((s) => !s.syncedAt);
  if (pending.length === 0) return;

  let changed = false;
  for (const s of pending) {
    if (await push(driverId, s)) {
      s.syncedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await write(driverId, shifts);
}

/**
 * Reads only. The cap and the pruning are applied to the returned copy but not
 * written back — this runs on a timer while a shift is open, and a write from
 * here could land on top of a clock-out that is being saved at the same moment.
 * normalize() is deterministic, so every reader sees the same thing regardless,
 * and the mutating calls below persist it.
 */
export async function listShifts(driverId: string): Promise<Shift[]> {
  return normalize(await read(driverId));
}

/** The shift currently running, if any. */
export async function openShift(driverId: string): Promise<Shift | null> {
  const shifts = await listShifts(driverId);
  return shifts.find((s) => !s.endedAt) ?? null;
}

/**
 * Goes on duty. Idempotent — a driver who toggles twice, or an app that
 * restarts mid-shift, keeps the original clock-in rather than resetting it.
 */
export async function startShift(
  driverId: string,
  at?: { lat: number; lng: number } | null,
): Promise<Shift> {
  const shifts = normalize(await read(driverId));

  const running = shifts.find((s) => !s.endedAt);
  if (running) return running;

  const shift: Shift = {
    clientId: newId(driverId),
    startedAt: new Date().toISOString(),
    endedAt: null,
    startLat: at?.lat ?? null,
    startLng: at?.lng ?? null,
    endLat: null,
    endLng: null,
    autoClosed: false,
    syncedAt: null,
  };

  const next = [shift, ...shifts];
  await write(driverId, next);

  if (await push(driverId, shift)) {
    shift.syncedAt = new Date().toISOString();
    await write(driverId, next);
  }
  return shift;
}

/** Goes off duty. Returns the closed shift, or null if none was running. */
export async function endShift(
  driverId: string,
  at?: { lat: number; lng: number } | null,
): Promise<Shift | null> {
  const shifts = normalize(await read(driverId));

  const running = shifts.find((s) => !s.endedAt);
  if (!running) return null;

  const started = new Date(running.startedAt).getTime();

  // A toggle that was clearly a mis-tap is dropped rather than filed as a
  // one-second shift that the office then has to read past.
  if (Date.now() - started < MIN_SHIFT_MS) {
    const kept = shifts.filter((s) => s.clientId !== running.clientId);
    await write(driverId, kept);
    return null;
  }

  running.endedAt = new Date().toISOString();
  running.endLat = at?.lat ?? null;
  running.endLng = at?.lng ?? null;
  running.syncedAt = null;
  await write(driverId, shifts);

  if (await push(driverId, running)) {
    running.syncedAt = new Date().toISOString();
    await write(driverId, shifts);
  }
  return running;
}

/** Milliseconds worked. An open shift counts up to now, subject to the cap. */
export function durationMs(shift: Shift, now = Date.now()): number {
  const start = new Date(shift.startedAt).getTime();
  const end = shift.endedAt ? new Date(shift.endedAt).getTime() : now;
  return Math.max(0, Math.min(end - start, MAX_SHIFT_MS));
}

/** Hours worked between two instants, counting only the overlapping part. */
export function hoursBetween(shifts: Shift[], from: number, to = Date.now()): number {
  let ms = 0;
  for (const s of shifts) {
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Math.min(Date.now(), start + MAX_SHIFT_MS);
    // A night shift straddles midnight, so clip rather than test containment.
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap > 0) ms += overlap;
  }
  return ms / 3_600_000;
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Monday-based, matching how the office reads a working week. */
export const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

export const startOfMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
};

/** "7h 05m" — the form a driver reads on a payslip. */
export function formatHours(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** "6:12:45" — a running shift clock. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export { MAX_SHIFT_MS };
