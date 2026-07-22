import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator,
  Alert, Linking, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDuty } from '../../lib/useDuty';
import {
  completeTrip, fetchActiveTrip, formatINR, startTrip,
  type ActiveTrip, type Integrity,
} from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

type Payment = 'cash' | 'upi' | 'card' | 'wallet';
const PAYMENTS: Payment[] = ['cash', 'upi', 'card', 'wallet'];

/**
 * The trip screen — and the only place odometer readings are entered.
 *
 * The live "GPS tracked" figure is shown to the driver on purpose. The whole
 * anti-cheat scheme rests on the driver knowing the phone is measuring the same
 * journey the meter is, so a padded closing reading is visibly contradicted
 * before they submit it rather than quietly flagged afterwards.
 */
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { position, trackedKm, pingNow } = useDuty();

  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [payment, setPayment] = useState<Payment>('cash');
  const [toll, setToll] = useState('');
  const [parking, setParking] = useState('');
  const [result, setResult] = useState<{ fare: number; km: number; integrity: Integrity } | null>(null);

  const load = useCallback(async () => {
    try {
      setTrip(await fetchActiveTrip());
    } catch (e: any) {
      Alert.alert('Could not load trip', e?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the tracked-km readout live while the trip runs.
  useEffect(() => {
    if (trip?.status !== 'ongoing') return;
    const t = setInterval(() => { pingNow(); }, 10000);
    return () => clearInterval(t);
  }, [trip?.status, pingNow]);

  async function onStart() {
    const value = Number(startOdo);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter the odometer reading', 'Type the number showing on the meter right now.');
      return;
    }

    // Confirm explicitly: the server writes this once and will not take another.
    Alert.alert(
      'Confirm start reading',
      `Odometer: ${value.toLocaleString('en-IN')} km\n\nThis is recorded now and cannot be changed later. Check the meter before confirming.`,
      [
        { text: 'Re-check', style: 'cancel' },
        {
          text: 'Confirm & start',
          onPress: async () => {
            setBusy(true);
            try {
              await startTrip(trip!.id, value, position ?? undefined);
              await pingNow();
              await load();
            } catch (e: any) {
              Alert.alert('Could not start trip', e?.message ?? 'Try again');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function onComplete() {
    const value = Number(endOdo);
    const start = trip?.startOdometer ?? 0;

    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter the closing odometer reading');
      return;
    }
    // Catch the obvious mistake on-device so the driver is not bounced by the
    // server for a typo. The server re-checks regardless.
    if (value <= start) {
      Alert.alert(
        'Reading looks wrong',
        `The closing reading (${value.toLocaleString('en-IN')}) must be higher than the opening reading (${start.toLocaleString('en-IN')}).`,
      );
      return;
    }

    const meterKm = value - start;
    const gps = trackedKm ?? trip?.gpsKm ?? 0;
    const gap = Math.abs(meterKm - gps);

    const submit = async () => {
      setBusy(true);
      try {
        const res = await completeTrip(trip!.id, {
          endOdometer: value,
          paymentMethod: payment,
          tollAmount: Number(toll) || 0,
          parkingAmount: Number(parking) || 0,
          lat: position?.lat,
          lng: position?.lng,
        });
        setResult({
          fare: res.trip.totalFare,
          km: res.trip.meteredKm,
          integrity: res.trip.integrity,
        });
      } catch (e: any) {
        Alert.alert('Could not close the trip', e?.message ?? 'Try again');
      } finally {
        setBusy(false);
      }
    };

    // Give a last chance to correct an honest mis-read before it is filed.
    if (gap > 5 && gps > 0 && gap / Math.max(gps, 1) > 0.2) {
      Alert.alert(
        'Check the reading',
        `Meter shows ${meterKm.toFixed(1)} km but your phone tracked ${gps.toFixed(1)} km.\n\n` +
          'If this is correct you can continue — the trip will be marked for office review.',
        [
          { text: 'Re-check meter', style: 'cancel' },
          { text: 'It is correct', onPress: submit },
        ],
      );
      return;
    }

    submit();
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Completion summary — the driver sees the same integrity verdict the office does.
  if (result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.sm }}>
              Trip completed
            </Text>
          </View>

          <Card>
            <Row label="Distance billed" value={`${result.km.toFixed(1)} km`} />
            <Row label="GPS tracked" value={`${result.integrity.gpsKm.toFixed(1)} km`} />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
            <Row label="Total fare" value={formatINR(result.fare)} big />
          </Card>

          {result.integrity.flagged && (
            <View style={{ backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.lg }}>
              <Text style={{ fontWeight: '800', color: '#92400e' }}>Marked for office review</Text>
              {result.integrity.flagReasons.map((r, i) => (
                <Text key={i} style={{ color: '#92400e', fontSize: 12, marginTop: 4 }}>• {r}</Text>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={{ backgroundColor: colors.primary, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Back to dashboard</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Text style={{ fontSize: 40 }}>🚖</Text>
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' }}>
          You have no active trip.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.accent, fontWeight: '800' }}>Back to dashboard</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const ongoing = trip.status === 'ongoing';
  const gps = trackedKm ?? trip.gpsKm ?? 0;
  const liveMeterKm = Number(endOdo) > 0 && trip.startOdometer
    ? Number(endOdo) - trip.startOdometer
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
              {ongoing ? 'Trip in progress' : 'Start trip'}
            </Text>
            <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>

          {/* Customer */}
          <Card>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{trip.customerName}</Text>
            {trip.otp && (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                Pickup OTP: <Text style={{ fontWeight: '800', color: colors.text }}>{trip.otp}</Text>
              </Text>
            )}
            <View style={{ marginTop: spacing.md, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>🟢 {trip.pickup}</Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>🔴 {trip.dropoff}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => Linking.openURL(`tel:${trip.customerPhone}`)}
                style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '700', color: colors.text }}>📞 Call</Text>
              </Pressable>
              {trip.pickupLat != null && trip.pickupLng != null && (
                <Pressable
                  onPress={() => Linking.openURL(
                    Platform.OS === 'ios'
                      ? `maps://?daddr=${trip.pickupLat},${trip.pickupLng}`
                      : `google.navigation:q=${trip.pickupLat},${trip.pickupLng}`,
                  )}
                  style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                >
                  <Text style={{ fontWeight: '700', color: colors.text }}>🧭 Navigate</Text>
                </Pressable>
              )}
            </View>
          </Card>

          {/* Odometer */}
          {!ongoing ? (
            <Card>
              <SectionTitle>Opening odometer</SectionTitle>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
                Enter the reading on the meter right now. It is recorded once and cannot be edited afterwards.
              </Text>
              <TextInput
                value={startOdo}
                onChangeText={setStartOdo}
                keyboardType="number-pad"
                placeholder="e.g. 45210"
                placeholderTextColor={colors.textMuted}
                style={odoInput}
              />
              <Pressable
                onPress={onStart}
                disabled={busy}
                style={({ pressed }) => ({
                  backgroundColor: busy ? '#94a3b8' : colors.success,
                  padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center',
                  marginTop: spacing.md, opacity: pressed ? 0.85 : 1,
                })}
              >
                {busy
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Start trip</Text>}
              </Pressable>
            </Card>
          ) : (
            <>
              <Card>
                <SectionTitle>Live</SectionTitle>
                <Row label="Opening odometer" value={`${(trip.startOdometer ?? 0).toLocaleString('en-IN')} km`} />
                <Row label="GPS tracked so far" value={`${gps.toFixed(1)} km`} />
                {liveMeterKm !== null && liveMeterKm > 0 && (
                  <Row label="Meter difference" value={`${liveMeterKm.toFixed(1)} km`} />
                )}
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.sm }}>
                  Your phone is measuring this journey. The closing reading is compared against it.
                </Text>
              </Card>

              <Card>
                <SectionTitle>Closing odometer</SectionTitle>
                <TextInput
                  value={endOdo}
                  onChangeText={setEndOdo}
                  keyboardType="number-pad"
                  placeholder={`higher than ${(trip.startOdometer ?? 0).toLocaleString('en-IN')}`}
                  placeholderTextColor={colors.textMuted}
                  style={odoInput}
                />

                <SectionTitle>Payment</SectionTitle>
                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {PAYMENTS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setPayment(p)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
                        borderWidth: 2, borderColor: payment === p ? colors.primary : colors.border,
                        backgroundColor: payment === p ? colors.primaryLight : 'white',
                      }}
                    >
                      <Text style={{ fontWeight: '700', fontSize: 12, color: colors.text, textTransform: 'uppercase' }}>{p}</Text>
                    </Pressable>
                  ))}
                </View>

                <SectionTitle>Extras paid on actuals</SectionTitle>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Toll ₹</Text>
                    <TextInput value={toll} onChangeText={setToll} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textMuted} style={smallInput} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Parking ₹</Text>
                    <TextInput value={parking} onChangeText={setParking} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textMuted} style={smallInput} />
                  </View>
                </View>

                <Pressable
                  onPress={onComplete}
                  disabled={busy}
                  style={({ pressed }) => ({
                    backgroundColor: busy ? '#94a3b8' : colors.accent,
                    padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center',
                    marginTop: spacing.lg, opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {busy
                    ? <ActivityIndicator color="white" />
                    : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>End trip & calculate fare</Text>}
                </Pressable>
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
      {children}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: '800', color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.md,
    }}>
      {children}
    </Text>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: big ? 15 : 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: big ? 20 : 14 }}>{value}</Text>
    </View>
  );
}

const odoInput = {
  backgroundColor: colors.bgSoft,
  borderRadius: radius.md,
  borderWidth: 2,
  borderColor: colors.border,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  fontSize: 26,
  fontWeight: '800',
  color: colors.text,
  letterSpacing: 2,
  textAlign: 'center',
} as const;

const smallInput = {
  backgroundColor: colors.bgSoft,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  fontSize: 16,
  color: colors.text,
} as const;
