import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator,
  Alert, Linking, Platform, KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDuty } from '../../lib/useDuty';
import { DriverMap, type LatLng, type MapPin } from '../../lib/DriverMap';
import { Speedometer } from '../../lib/Speedometer';
import {
  completeTrip, fetchActiveTrip, formatINR, startTrip, haversineKm, AT_DESTINATION_KM,
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
  const { position, heading, trail, trackedKm, pingNow } = useDuty();
  const { height } = useWindowDimensions();

  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [startOtp, setStartOtp] = useState('');
  const [endOtp, setEndOtp] = useState('');
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

  // Frame the driver and the leg they are driving — once per leg, so the camera
  // is not re-zoomed on every GPS tick. Picking up and dropping off are two
  // separate legs, and each gets its own framing.
  const [fit, setFit] = useState<LatLng[] | undefined>();
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!trip || !position) return;
    const to = trip.status === 'ongoing'
      ? (trip.dropLat != null && trip.dropLng != null ? { lat: trip.dropLat, lng: trip.dropLng } : null)
      : (trip.pickupLat != null && trip.pickupLng != null ? { lat: trip.pickupLat, lng: trip.pickupLng } : null);
    if (!to) return;

    const leg = `${trip.id}:${trip.status}`;
    if (fittedFor.current === leg) return;
    fittedFor.current = leg;
    setFit([position, to]);
  }, [trip?.id, trip?.status, position]);

  async function onStart() {
    const value = Number(startOdo);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter the odometer reading', 'Type the number showing on the meter right now.');
      return;
    }
    // App/web rides carry a start OTP the rider reads out. No OTP on offline rides.
    if (trip?.hasOtp && startOtp.replace(/\D/g, '').length < 4) {
      Alert.alert('Ask the rider for their start OTP', 'Enter the 4-digit code the rider shows you to begin the ride.');
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
              await startTrip(trip!.id, value, {
                otp: trip?.hasOtp ? startOtp.replace(/\D/g, '') : undefined,
                lat: position?.lat,
                lng: position?.lng,
              });
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

    // Ending before the destination needs the rider's end OTP. If we can see we
    // are at the drop, no code is needed.
    if (needEndOtp && endOtp.replace(/\D/g, '').length < 4) {
      Alert.alert(
        'Ending before the destination',
        'You are not yet at the drop point. To end the ride here, ask the rider for their end OTP and enter it.',
      );
      return;
    }

    const submit = async () => {
      setBusy(true);
      try {
        const res = await completeTrip(trip!.id, {
          endOdometer: value,
          paymentMethod: payment,
          endOtp: needEndOtp ? endOtp.replace(/\D/g, '') : undefined,
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

  // Distance from the driver to the booked drop, if both points are known.
  const distanceToDropKm =
    position && trip.dropLat != null && trip.dropLng != null
      ? haversineKm(position, { lat: trip.dropLat, lng: trip.dropLng })
      : null;
  const atDestination = distanceToDropKm != null && distanceToDropKm <= AT_DESTINATION_KM;
  // Ending early on an app/web ride needs the rider's end OTP.
  const needEndOtp = ongoing && trip.hasOtp && !atDestination;

  // Navigate to the pickup before the ride starts, to the drop once it's running.
  const navTarget = ongoing
    ? (trip.dropLat != null && trip.dropLng != null ? { lat: trip.dropLat, lng: trip.dropLng, label: 'destination' } : null)
    : (trip.pickupLat != null && trip.pickupLng != null ? { lat: trip.pickupLat, lng: trip.pickupLng, label: 'pickup' } : null);

  // Pickup and drop are both shown throughout, so the driver can always see the
  // shape of the whole job, not only the leg they are on.
  const pins: MapPin[] = [];
  if (trip.pickupLat != null && trip.pickupLng != null) {
    pins.push({ id: 'pickup', at: { lat: trip.pickupLat, lng: trip.pickupLng }, kind: 'pickup', label: 'Pickup' });
  }
  if (trip.dropLat != null && trip.dropLng != null) {
    pins.push({ id: 'drop', at: { lat: trip.dropLat, lng: trip.dropLng }, kind: 'drop', label: 'Drop' });
  }

  const openNavigation = () => {
    if (!navTarget) return;
    Linking.openURL(
      Platform.OS === 'ios'
        ? `maps://?daddr=${navTarget.lat},${navTarget.lng}`
        : `google.navigation:q=${navTarget.lat},${navTarget.lng}`,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <DriverMap
        position={position}
        heading={heading}
        pins={pins}
        trail={trail}
        guideTo={navTarget ? { lat: navTarget.lat, lng: navTarget.lng } : null}
        fit={fit}
        style={{ height: Math.round(height * 0.38) }}
      >
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm }}>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              hitSlop={10}
              style={{
                width: 42, height: 42, borderRadius: 21, backgroundColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: colors.border, elevation: 3,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>✕</Text>
            </Pressable>

            <View style={{
              backgroundColor: ongoing ? colors.accent : colors.primary,
              borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8,
            }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>
                {ongoing ? '● Trip in progress' : '● Heading to pickup'}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <View style={{
          position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md,
          flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        }}>
          <View style={{
            backgroundColor: 'white', borderRadius: radius.md,
            paddingHorizontal: spacing.md, paddingVertical: 6,
            borderWidth: 1, borderColor: colors.border, elevation: 3,
          }}>
            <Speedometer compact />
          </View>

          {navTarget && (
            <Pressable
              onPress={openNavigation}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: colors.primary, borderRadius: radius.pill,
                paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                opacity: pressed ? 0.85 : 1, elevation: 4,
              })}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>
                🧭 Navigate to {navTarget.label}
              </Text>
            </Pressable>
          )}
        </View>
      </DriverMap>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>

          {/* Customer */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{trip.customerName}</Text>
              <Pressable
                onPress={() => Linking.openURL(`tel:${trip.customerPhone}`)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
                  borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }}>📞 Call</Text>
              </Pressable>
            </View>
            <View style={{ marginTop: spacing.md, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>🟢 {trip.pickup}</Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>🔴 {trip.dropoff}</Text>
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

              {trip.hasOtp && (
                <>
                  <SectionTitle>Rider&apos;s start OTP</SectionTitle>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
                    Ask the rider for the 4-digit code shown in their app and enter it. This confirms
                    the right passenger is in the car.
                  </Text>
                  <TextInput
                    value={startOtp}
                    onChangeText={(t) => setStartOtp(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    placeholder="• • • •"
                    placeholderTextColor={colors.textMuted}
                    maxLength={4}
                    style={otpInput}
                  />
                </>
              )}

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
                {distanceToDropKm != null && (
                  <Row
                    label="Distance to destination"
                    value={atDestination ? 'At destination ✓' : `${distanceToDropKm.toFixed(1)} km away`}
                  />
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

                {needEndOtp && (
                  <View style={{ backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
                    <Text style={{ fontWeight: '800', color: '#92400e', fontSize: 13 }}>
                      Ending before the destination
                    </Text>
                    <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
                      {distanceToDropKm != null
                        ? `You are ${distanceToDropKm.toFixed(1)} km from the drop. `
                        : 'Your location is not confirmed at the drop. '}
                      Ask the rider for their end OTP to close the ride here.
                    </Text>
                    <TextInput
                      value={endOtp}
                      onChangeText={(t) => setEndOtp(t.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="number-pad"
                      placeholder="• • • •"
                      placeholderTextColor="#b45309"
                      maxLength={4}
                      style={[otpInput, { marginTop: spacing.sm, borderColor: '#f59e0b' }]}
                    />
                  </View>
                )}

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
    </View>
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

const otpInput = {
  backgroundColor: 'white',
  borderRadius: radius.md,
  borderWidth: 2,
  borderColor: colors.border,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  fontSize: 30,
  fontWeight: '800',
  color: colors.text,
  letterSpacing: 12,
  textAlign: 'center',
} as const;
