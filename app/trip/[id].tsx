import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { acceptTrip, completeTrip, getTrip, startTrip, VEHICLE_EMOJI, type Trip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

type PayMethod = 'cash' | 'upi' | 'card' | 'wallet';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { driver, setStatus, refresh } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');

  async function load() {
    if (!id) return;
    setLoading(true);
    try { setTrip(await getTrip(id)); }
    catch (e) { Alert.alert('Could not load trip', String(e)); }
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => { load(); }, [id]));

  if (loading || !trip) {
    return <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  const isMine = trip.driver_id === driver?.id;
  const inProgress = isMine && !!trip.actual_start_at && !trip.actual_end_at;
  const canAccept = !trip.driver_id && trip.status === 'pending' && driver?.status === 'available';
  const canStart = isMine && trip.status === 'confirmed' && !trip.actual_start_at;
  const canComplete = inProgress;

  async function onAccept() {
    if (!driver || !trip) return;
    setWorking(true);
    try {
      await acceptTrip(trip.id, driver.id);
      await load();
      Alert.alert('Trip accepted', 'It is now in your trips list.');
    } catch (e: any) {
      Alert.alert('Could not accept', e.message ?? 'Try again');
    } finally { setWorking(false); }
  }

  async function onStart() {
    if (!trip) return;
    const odo = parseFloat(startOdo);
    if (!Number.isFinite(odo) || odo < 0) {
      Alert.alert('Enter the starting odometer reading.'); return;
    }
    setWorking(true);
    try {
      await startTrip(trip.id, odo);
      await setStatus('on_trip');
      await load();
    } catch (e: any) {
      Alert.alert('Could not start', e.message ?? 'Try again');
    } finally { setWorking(false); }
  }

  async function onComplete() {
    if (!trip) return;
    const odo = parseFloat(endOdo);
    if (!Number.isFinite(odo) || odo <= (trip.start_odometer ?? 0)) {
      Alert.alert('Enter a valid end odometer (greater than start).'); return;
    }
    const distance = odo - (trip.start_odometer ?? 0);
    // Re-estimate fare on actual km, preserving any discount already applied at booking.
    const ratePerKm = trip.trip_type?.includes('outstation') ? 12 : 20;
    const vehicleMult = trip.vehicle_type === 'bus' ? 1.8 : trip.vehicle_type === 'traveler' ? 1.3 : 1.0;
    const preDiscount = Math.round(distance * ratePerKm * vehicleMult);
    const finalFare = trip.final_fare ?? preDiscount; // honour any pre-set discounted fare

    setWorking(true);
    try {
      await completeTrip(trip.id, { endOdometer: odo, paymentMethod: payMethod, finalFare });
      await setStatus('available');
      await refresh();
      Alert.alert('Trip completed', `Collected ₹${finalFare.toLocaleString('en-IN')} via ${payMethod}.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not complete', e.message ?? 'Try again');
    } finally { setWorking(false); }
  }

  function openMaps() {
    if (!trip) return;
    const lat = trip.pickup_lat, lng = trip.pickup_lng;
    const url = lat && lng
      ? (Platform.OS === 'ios'
          ? `http://maps.apple.com/?daddr=${lat},${lng}`
          : `google.navigation:q=${lat},${lng}`)
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.pickup)}`;
    Linking.openURL(url).catch(() => {});
  }

  function callCustomer() {
    if (!trip) return;
    Linking.openURL(`tel:${trip.phone}`).catch(() => {});
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Pressable onPress={() => router.back()}><Text style={{ color: colors.textMuted, fontSize: 16 }}>← Back</Text></Pressable>
          <Text style={{ fontWeight: '800', color: colors.text }}>Trip details</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Customer */}
        <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Customer</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
              {VEHICLE_EMOJI[trip.vehicle_type]} {trip.customer_name}
            </Text>
            <Pressable onPress={callCustomer} style={({ pressed }) => ({ backgroundColor: colors.success, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: 'white', fontWeight: '700' }}>📞 Call</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textMuted, marginTop: 2 }}>{trip.phone} · {trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}</Text>
        </View>

        {/* Route */}
        <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.sm }}>Route</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text>🟢</Text>
            <Text style={{ flex: 1, color: colors.text }}>{trip.pickup}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            <Text>🔴</Text>
            <Text style={{ flex: 1, color: colors.text }}>{trip.drop_location}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.textMuted }}>{trip.distance_km ? `${trip.distance_km} km` : '—'} · {trip.trip_type}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Pickup: {new Date(trip.pickup_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
          </View>
          <Pressable onPress={openMaps} style={({ pressed }) => ({ marginTop: spacing.md, backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ color: 'white', fontWeight: '700' }}>🧭 Navigate to pickup</Text>
          </Pressable>
        </View>

        {trip.notes ? (
          <View style={{ backgroundColor: '#fef9c3', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#fde047', marginBottom: spacing.md }}>
            <Text style={{ color: '#854d0e', fontWeight: '700', marginBottom: 2 }}>Notes</Text>
            <Text style={{ color: '#713f12' }}>{trip.notes}</Text>
          </View>
        ) : null}

        {/* Fare */}
        <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Fare</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 }}>
            ₹{(trip.final_fare ?? trip.estimated_fare ?? 0).toLocaleString('en-IN')}
          </Text>
          {trip.payment_status === 'paid' && trip.payment_method && (
            <Text style={{ color: colors.success, fontWeight: '700' }}>✓ Paid via {trip.payment_method}</Text>
          )}
        </View>

        {/* Actions */}
        {canAccept && (
          <Pressable disabled={working} onPress={onAccept} style={btn(colors.accent)}>
            {working ? <ActivityIndicator color="white" /> : <Text style={btnText}>Accept Trip</Text>}
          </Pressable>
        )}

        {canStart && (
          <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.sm }}>Start trip</Text>
            <Text style={{ color: colors.text, marginBottom: spacing.xs }}>Odometer reading (km)</Text>
            <TextInput
              value={startOdo} onChangeText={setStartOdo}
              keyboardType="numeric" placeholder="e.g. 45230"
              placeholderTextColor={colors.textMuted}
              style={input}
            />
            <Pressable disabled={working} onPress={onStart} style={[btn(colors.primary), { marginTop: spacing.md, marginBottom: 0 }]}>
              {working ? <ActivityIndicator color="white" /> : <Text style={btnText}>Start Trip</Text>}
            </Pressable>
          </View>
        )}

        {canComplete && (
          <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.sm }}>Complete trip</Text>
            <Text style={{ color: colors.text, marginBottom: spacing.xs }}>End odometer (km) · started at {trip.start_odometer}</Text>
            <TextInput value={endOdo} onChangeText={setEndOdo} keyboardType="numeric" placeholder="e.g. 45260" placeholderTextColor={colors.textMuted} style={input} />

            <Text style={{ color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs }}>Payment method</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(['cash', 'upi', 'card', 'wallet'] as PayMethod[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPayMethod(m)}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
                    borderWidth: 2, borderColor: payMethod === m ? colors.accent : colors.border,
                    backgroundColor: payMethod === m ? '#fff7ed' : 'white',
                    alignItems: 'center', opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontWeight: '700', color: payMethod === m ? colors.accent : colors.text, textTransform: 'uppercase', fontSize: 12 }}>{m}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable disabled={working} onPress={onComplete} style={[btn(colors.success), { marginTop: spacing.lg, marginBottom: 0 }]}>
              {working ? <ActivityIndicator color="white" /> : <Text style={btnText}>Complete & Collect Payment</Text>}
            </Pressable>
          </View>
        )}

        {!isMine && !canAccept && (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.md }}>
            {driver?.status !== 'available' ? 'Go online from dashboard to accept trips.' : 'This trip has already been taken.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const btn = (bg: string) => ({
  backgroundColor: bg, padding: spacing.lg, borderRadius: radius.lg,
  alignItems: 'center', marginBottom: spacing.md,
}) as const;
const btnText = { color: 'white', fontWeight: '800', fontSize: 16 } as const;
const input = {
  borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
  padding: spacing.md, fontSize: 18, color: colors.text, fontWeight: '700' as const, backgroundColor: 'white',
};
