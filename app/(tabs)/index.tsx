import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, type DriverStatus } from '../../lib/auth';
import { listAvailableTrips, listMyTrips, VEHICLE_EMOJI, type Trip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

const STATUS_META: Record<DriverStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Available',  color: '#065f46', bg: '#d1fae5' },
  on_trip:   { label: 'On a trip',  color: '#1e40af', bg: '#dbeafe' },
  offline:   { label: 'Offline',    color: '#374151', bg: '#e5e7eb' },
};

export default function Dashboard() {
  const { driver, driverNotFound, setStatus, refresh } = useAuth();
  const router = useRouter();
  const [available, setAvailable] = useState<Trip[]>([]);
  const [mine, setMine] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!driver) { setLoading(false); return; }
    try {
      const [a, m] = await Promise.all([listAvailableTrips(), listMyTrips(driver.id)]);
      setAvailable(a);
      setMine(m);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [driver?.id]));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTrips = mine.filter((t) => t.actual_end_at && new Date(t.actual_end_at) >= today);
  const todayEarnings = todayTrips.reduce((sum, t) => sum + (t.final_fare ?? 0), 0);
  const todayKm = todayTrips.reduce((sum, t) => {
    if (t.start_odometer != null && t.end_odometer != null) return sum + (t.end_odometer - t.start_odometer);
    return sum + (t.distance_km ?? 0);
  }, 0);
  const activeTrip = mine.find((t) => t.status === 'confirmed' && t.actual_start_at && !t.actual_end_at);

  if (driverNotFound) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, padding: spacing.xl, justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: spacing.md }}>
          Driver profile not set up
        </Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
          Your account is signed in, but no driver record was found. Contact CSC Travels admin to be added to the fleet.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgSoft }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const meta = driver ? STATUS_META[driver.status] : STATUS_META.offline;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={{ backgroundColor: colors.primary, padding: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <Text style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Welcome back</Text>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginTop: 2 }}>{driver?.full_name ?? '—'}</Text>
          <Text style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>{driver?.vehicle_plate ?? 'No vehicle assigned'}</Text>

          {/* Status toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: radius.pill, padding: 4, marginTop: spacing.lg }}>
            {(['available', 'offline'] as DriverStatus[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                disabled={driver?.status === 'on_trip'}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill,
                  backgroundColor: driver?.status === s ? colors.accent : 'transparent',
                  alignItems: 'center', opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: driver?.status === s ? 'white' : '#94a3b8', fontWeight: '700' }}>
                  {s === 'available' ? '🟢 Go Online' : '⚫ Go Offline'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: meta.bg, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill }}>
            <Text style={{ color: meta.color, fontWeight: '700', fontSize: 12 }}>{meta.label}</Text>
          </View>
        </View>

        {/* Today's stats */}
        <View style={{ flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: -16, gap: spacing.sm }}>
          <Stat label="Today's trips" value={todayTrips.length.toString()} />
          <Stat label="Today's KM" value={todayKm.toFixed(1)} />
          <Stat label="Earnings" value={`₹${todayEarnings.toLocaleString('en-IN')}`} />
        </View>

        {/* Active trip card */}
        {activeTrip && (
          <Pressable
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: activeTrip.id } })}
            style={({ pressed }) => ({
              margin: spacing.lg, padding: spacing.lg, borderRadius: radius.lg,
              backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 14, opacity: 0.9 }}>
              {VEHICLE_EMOJI[activeTrip.vehicle_type]} TRIP IN PROGRESS
            </Text>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 18, marginTop: 4 }}>
              {activeTrip.customer_name}
            </Text>
            <Text style={{ color: 'white', opacity: 0.95, marginTop: 4 }} numberOfLines={1}>
              {activeTrip.pickup} → {activeTrip.drop_location}
            </Text>
            <Text style={{ color: 'white', fontWeight: '700', marginTop: spacing.sm, textAlign: 'right' }}>
              Tap to complete →
            </Text>
          </Pressable>
        )}

        {/* My upcoming */}
        <Section title="My Trips">
          {mine.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.id !== activeTrip?.id).length === 0 ? (
            <Empty text="No assigned trips" />
          ) : (
            mine
              .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.id !== activeTrip?.id)
              .map((t) => <TripCard key={t.id} trip={t} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })} />)
          )}
        </Section>

        {/* Available */}
        <Section title="Available Trips">
          {driver?.status !== 'available' ? (
            <Empty text="Go online to see available trips" />
          ) : available.length === 0 ? (
            <Empty text="No available trips right now" />
          ) : (
            available.map((t) => <TripCard key={t.id} trip={t} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })} />)
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>{title}</Text>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: spacing.xl, backgroundColor: 'white', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
      <Text style={{ color: colors.textMuted }}>{text}</Text>
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md,
        marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>
          {VEHICLE_EMOJI[trip.vehicle_type]} {trip.customer_name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {new Date(trip.pickup_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>🟢 {trip.pickup}</Text>
      <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>🔴 {trip.drop_location}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {trip.distance_km ? `${trip.distance_km} km` : '— km'} · {trip.passengers} pax
        </Text>
        <Text style={{ fontWeight: '800', color: colors.accent }}>
          {trip.estimated_fare ? `₹${trip.estimated_fare.toLocaleString('en-IN')}` : '—'}
        </Text>
      </View>
    </Pressable>
  );
}
