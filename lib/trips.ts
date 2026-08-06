import { api } from './api';

/** Ride dispatch, trip lifecycle and offline rides — all via CSCBilling. */

export interface Offer {
  id: string;
  tripNumber: string | null;
  customerName: string;
  pickup: string;
  dropoff: string;
  pickupLat: number | null;
  pickupLng: number | null;
  estimatedKm: number;
  estimatedFare: number;
  tripKind: string | null;
  scheduledAt: string | null;
  distanceToPickupKm: number;
  expiresAt: string | null;
  /** True while this driver is inside the exclusive nearest-first window. */
  exclusive: boolean;
}

export interface ActiveTrip {
  id: string;
  tripNumber: string | null;
  status: 'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled';
  source: 'app' | 'offline' | 'staff';
  customerName: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  estimatedKm: number;
  estimatedFare: number;
  tripKind: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  meteredKm: number | null;
  gpsKm: number;
  totalFare: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  /** Whether this ride carries handoff codes. The codes themselves never reach
   *  the driver — the driver must ask the rider for them. */
  hasOtp: boolean;
  flagged: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface Integrity {
  odometerKm: number;
  gpsKm: number;
  variancePct: number;
  flagged: boolean;
  flagReasons: string[];
}

export async function pingLocation(lat: number, lng: number, onDuty?: boolean) {
  return api<{ success: true; onDuty: boolean; activeTripId: string | null; gpsKm: number | null }>(
    '/api/driver/location',
    { method: 'POST', body: { lat, lng, ...(onDuty === undefined ? {} : { onDuty }) } },
  );
}

export async function fetchOffers(lat: number, lng: number) {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return api<{ success: true; offers: Offer[]; offDuty?: boolean }>(`/api/driver/offers?${qs}`);
}

export async function acceptOffer(id: string) {
  return api<{ success: true; trip: { id: string; hasOtp: boolean; customerPhone: string } }>(
    `/api/driver/offers/${id}/accept`,
    { method: 'POST' },
  );
}

/** Straight-line km — used to decide whether the driver is at the destination. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Matches the server's AT_DESTINATION_KM in the complete route. */
export const AT_DESTINATION_KM = 1.2;

export async function declineOffer(id: string) {
  return api<{ success: true }>(`/api/driver/offers/${id}/decline`, { method: 'POST' });
}

export async function fetchActiveTrip() {
  const res = await api<{ success: true; trip: ActiveTrip | null }>('/api/driver/trips?status=active');
  return res.trip;
}

export interface HistorySummary {
  count: number;
  totalFare: number;
  totalKm: number;
  flagged: number;
}

export async function fetchHistory() {
  return api<{ success: true; trips: ActiveTrip[]; summary: HistorySummary }>(
    '/api/driver/trips?status=history',
  );
}

export async function startTrip(
  id: string,
  startOdometer: number,
  opts?: { otp?: string; lat?: number; lng?: number },
) {
  const { otp, ...at } = opts ?? {};
  return api<{ success: true; trip: { startOdometer: number } }>(`/api/driver/trips/${id}/start`, {
    method: 'POST',
    body: { startOdometer, ...(otp ? { otp } : {}), ...at },
  });
}

export interface CompleteInput {
  endOdometer: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'wallet';
  /** Required only when ending before the destination. */
  endOtp?: string;
  vehicleClass?: string;
  tollAmount?: number;
  parkingAmount?: number;
  nightStays?: number;
  lat?: number;
  lng?: number;
}

export async function completeTrip(id: string, input: CompleteInput) {
  return api<{
    success: true;
    trip: { meteredKm: number; totalFare: number; integrity: Integrity };
  }>(`/api/driver/trips/${id}/complete`, { method: 'POST', body: input });
}

export interface OfflineTripInput {
  customerName: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  startOdometer: number;
  tripKind?: string;
  riderTier?: 'public' | 'member' | 'official';
  lat?: number;
  lng?: number;
}

/**
 * Opens an off-app ride. Note this STARTS the trip — the closing reading is
 * taken later through completeTrip, so the GPS trail can be compared against
 * the meter exactly as it is for a dispatched ride.
 */
export async function startOfflineTrip(input: OfflineTripInput) {
  return api<{ success: true; trip: ActiveTrip & { startOdometer: number } }>(
    '/api/driver/offline-trip',
    { method: 'POST', body: input },
  );
}

export const formatINR = (n: number) =>
  '₹' + Math.round(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
