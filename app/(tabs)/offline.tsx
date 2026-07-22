import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useDuty } from '../../lib/useDuty';
import { fetchActiveTrip, startOfflineTrip, type ActiveTrip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

type Tier = 'public' | 'member' | 'official';
const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: 'public', label: 'Regular', hint: 'No discount' },
  { id: 'member', label: 'Co-op Member', hint: '10% off' },
  { id: 'official', label: 'Official', hint: '25% off' },
];

const TRIP_KINDS = [
  { id: 'city_one_way', label: 'City one-way' },
  { id: 'city_round_trip', label: 'City round trip' },
  { id: 'outstation_one_way', label: 'Outstation' },
];

/**
 * Offline rides — a ride picked up off-app (street hail, phone call) entered so
 * it lands in billing instead of staying cash-in-pocket.
 *
 * This screen only opens the ride. The closing reading is taken later on the
 * trip screen, exactly like a dispatched ride. That is deliberate: a single
 * form filled in afterwards would let a driver type any two numbers with
 * nothing to check them against. Opening the ride at pickup starts the phone's
 * GPS trail, so the meter has to agree with a journey that was actually driven.
 */
export default function OfflineRide() {
  const { driver } = useAuth();
  const { position, permission, requestPermission } = useDuty();
  const router = useRouter();

  const [active, setActive] = useState<ActiveTrip | null>(null);
  const [checking, setChecking] = useState(true);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [startOdo, setStartOdo] = useState('');
  const [tripKind, setTripKind] = useState('city_one_way');
  const [tier, setTier] = useState<Tier>('public');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      setActive(await fetchActiveTrip());
    } catch {
      setActive(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);
  useFocusEffect(useCallback(() => { check(); }, [check]));

  async function onStart() {
    const odo = Number(startOdo);

    if (!customerName.trim()) return Alert.alert('Enter the customer name');
    if (!/^[6-9]\d{9}$/.test(customerPhone.replace(/\s+/g, ''))) {
      return Alert.alert('Enter a valid 10-digit mobile number');
    }
    if (!pickup.trim() || !dropoff.trim()) return Alert.alert('Enter pickup and drop locations');
    if (!Number.isFinite(odo) || odo <= 0) {
      return Alert.alert('Enter the odometer reading', 'Type the number showing on the meter right now.');
    }

    // Without a fix there is no trail to check the meter against, and the trip
    // gets flagged at close. Better to say so now than to surprise them later.
    if (permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          'Location is required',
          'Offline rides are checked against your phone\'s GPS trail. Enable location to record this ride.',
        );
        return;
      }
    }

    Alert.alert(
      'Confirm start reading',
      `Odometer: ${odo.toLocaleString('en-IN')} km\n\nThis is recorded now and cannot be changed later. Check the meter before confirming.`,
      [
        { text: 'Re-check', style: 'cancel' },
        {
          text: 'Confirm & start',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await startOfflineTrip({
                customerName: customerName.trim(),
                customerPhone: customerPhone.replace(/\s+/g, ''),
                pickup: pickup.trim(),
                dropoff: dropoff.trim(),
                startOdometer: odo,
                tripKind,
                riderTier: tier,
                lat: position?.lat,
                lng: position?.lng,
              });

              setCustomerName(''); setCustomerPhone('');
              setPickup(''); setDropoff(''); setStartOdo('');

              router.push(`/trip/${res.trip.id}`);
            } catch (e: any) {
              Alert.alert('Could not start the ride', e?.message ?? 'Try again');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (checking) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // One ride at a time — the same rule the server enforces.
  if (active) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, padding: spacing.lg, justifyContent: 'center' }}>
        <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
          <Text style={{ fontSize: 36 }}>🚕</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.sm, textAlign: 'center' }}>
            You already have a trip running
          </Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, fontSize: 13 }}>
            Finish {active.customerName}&apos;s ride before starting an offline one.
          </Text>
          <Pressable
            onPress={() => router.push(`/trip/${active.id}`)}
            style={{ backgroundColor: colors.accent, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.lg, marginTop: spacing.lg }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Open current trip</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const noVehicle = !driver?.vehicle && !driver?.vehicleId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">

          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Offline Ride</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              A ride you picked up directly — record it so it reaches billing.
            </Text>
          </View>

          {noVehicle && (
            <View style={{ backgroundColor: '#fee2e2', borderRadius: radius.md, padding: spacing.md }}>
              <Text style={{ color: '#991b1b', fontSize: 13, fontWeight: '700' }}>No vehicle assigned</Text>
              <Text style={{ color: '#991b1b', fontSize: 12, marginTop: 2 }}>
                Ask the office to assign your vehicle before recording offline rides.
              </Text>
            </View>
          )}

          <Card>
            <SectionTitle>Customer</SectionTitle>
            <Field label="Name" value={customerName} onChange={setCustomerName} placeholder="Ramesh Kumar" />
            <Field
              label="Mobile number" value={customerPhone} onChange={setCustomerPhone}
              placeholder="9876543210" keyboardType="phone-pad"
            />
          </Card>

          <Card>
            <SectionTitle>Journey</SectionTitle>
            <Field label="Pickup" value={pickup} onChange={setPickup} placeholder="Boring Road, Patna" />
            <Field label="Drop" value={dropoff} onChange={setDropoff} placeholder="Patna Junction" />

            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.md, marginBottom: 6 }}>Trip type</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              {TRIP_KINDS.map((k) => (
                <Chip key={k.id} label={k.label} selected={tripKind === k.id} onPress={() => setTripKind(k.id)} />
              ))}
            </View>

            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.md, marginBottom: 6 }}>Fare category</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {TIERS.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTier(t.id)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center',
                    borderWidth: 2, borderColor: tier === t.id ? colors.primary : colors.border,
                    backgroundColor: tier === t.id ? colors.primaryLight : 'white',
                  }}
                >
                  <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 11, color: colors.text }}>{t.label}</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{t.hint}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card>
            <SectionTitle>Opening odometer</SectionTitle>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
              Enter the reading showing on the meter right now. It is recorded once and cannot be
              edited. Your closing reading is taken at the end of the ride and checked against the
              distance your phone tracks.
            </Text>
            <TextInput
              value={startOdo}
              onChangeText={setStartOdo}
              keyboardType="number-pad"
              placeholder="e.g. 45210"
              placeholderTextColor={colors.textMuted}
              style={odoInput}
            />
          </Card>

          <Pressable
            onPress={onStart}
            disabled={busy || noVehicle}
            style={({ pressed }) => ({
              backgroundColor: busy || noVehicle ? '#94a3b8' : colors.success,
              padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center', opacity: pressed ? 0.85 : 1,
            })}
          >
            {busy
              ? <ActivityIndicator color="white" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Start offline ride</Text>}
          </Pressable>
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
    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm }}>
      {children}
    </Text>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: {
  label: string; value: string; onChange: (s: string) => void;
  placeholder: string; keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        style={{
          backgroundColor: colors.bgSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15, color: colors.text,
        }}
      />
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
        borderWidth: 2, borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primaryLight : 'white',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
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
