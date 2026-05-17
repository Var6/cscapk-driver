import { supabase } from './supabase';

export interface Trip {
  id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  pickup: string;
  drop_location: string;
  pickup_at: string;
  vehicle_type: 'car' | 'bus' | 'traveler';
  trip_type: string;
  passengers: number;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  distance_km: number | null;
  estimated_fare: number | null;
  final_fare: number | null;
  driver_id: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  payment_method: 'cash' | 'upi' | 'card' | 'wallet' | null;
  payment_status: 'pending' | 'paid';
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_lat: number | null;
  drop_lng: number | null;
  created_at: string;
}

const ALL_COLS = '*';

export async function listAvailableTrips() {
  const { data, error } = await supabase
    .from('bookings')
    .select(ALL_COLS)
    .is('driver_id', null)
    .eq('status', 'pending')
    .order('pickup_at', { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data as Trip[]) ?? [];
}

export async function listMyTrips(driverId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select(ALL_COLS)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as Trip[]) ?? [];
}

export async function getTrip(id: string) {
  const { data, error } = await supabase
    .from('bookings').select(ALL_COLS).eq('id', id).single();
  if (error) throw error;
  return data as Trip;
}

export async function acceptTrip(id: string, driverId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ driver_id: driverId, status: 'confirmed' })
    .eq('id', id)
    .is('driver_id', null)
    .eq('status', 'pending')
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function startTrip(id: string, startOdometer: number) {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed', // remain confirmed until completed; trip_in_progress denoted by actual_start_at
      start_odometer: startOdometer,
      actual_start_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export interface CompleteInput {
  endOdometer: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'wallet';
  finalFare: number;
}

export async function completeTrip(id: string, input: CompleteInput) {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      end_odometer: input.endOdometer,
      actual_end_at: new Date().toISOString(),
      payment_method: input.paymentMethod,
      payment_status: 'paid',
      final_fare: input.finalFare,
    })
    .eq('id', id);
  if (error) throw error;
}

export const VEHICLE_EMOJI: Record<Trip['vehicle_type'], string> = {
  car: '🚗', bus: '🚌', traveler: '🚐',
};
