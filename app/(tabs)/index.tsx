import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useDuty } from '../../lib/useDuty';
import {
  acceptOffer, declineOffer, fetchActiveTrip, fetchOffers, formatINR,
  type ActiveTrip, type Offer,
} from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

/** How often the offer feed refreshes while on duty. */
const POLL_MS = 5000;

export default function Dashboard() {
  const { driver } = useAuth();
  const { onDuty, position, permission, toggleDuty, pingNow } = useDuty();
  const router = useRouter();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [active, setActive] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-render once a second so the offer countdowns actually tick.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const trip = await fetchActiveTrip();
      setActive(trip);

      // A driver already on a ride should not be shown more work.
      if (trip || !onDuty || !position) {
        setOffers([]);
        return;
      }

      const res = await fetchOffers(position.lat, position.lng);
      setOffers(res.offers);
      setNotice(null);
    } catch (e: any) {
      // status 0 is a network blip — the next tick usually recovers.
      if (e?.status !== 0) setNotice(e?.message ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onDuty, position]);

  // Poll while the screen is mounted. Chained timeout rather than an interval,
  // so a slow response cannot stack requests up on bad mobile data.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      await loadRef.current();
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  async function onAccept(offer: Offer) {
    setBusyId(offer.id);
    try {
      const res = await acceptOffer(offer.id);
      await pingNow();
      await load();
      Alert.alert(
        'Ride accepted',
        `${offer.customerName}\n${offer.pickup}\n\n` +
          (res.trip.hasOtp ? 'Ask the rider for their start OTP at pickup.\n' : '') +
          `Phone: ${res.trip.customerPhone}`,
        [{ text: 'Open trip', onPress: () => router.push(`/trip/${res.trip.id}`) }],
      );
    } catch (e: any) {
      // 409 is the normal race outcome — another driver got there first.
      Alert.alert(e?.status === 409 ? 'Already taken' : 'Could not accept', e?.message ?? 'Try again');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function onDecline(offer: Offer) {
    setBusyId(offer.id);
    // Drop it locally straight away — the server will not re-offer it.
    setOffers((list) => list.filter((o) => o.id !== offer.id));
    try {
      await declineOffer(offer.id);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Duty */}
        <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg }}>
          <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {driver?.name ?? 'Driver'}
          </Text>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: '800', marginTop: 2 }}>
            {driver?.vehicle ? `Vehicle ${driver.vehicle}` : 'No vehicle assigned'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                {onDuty ? '🟢 On duty' : '⚪ Off duty'}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                {onDuty ? 'You are receiving ride requests' : 'Go on duty to start receiving rides'}
              </Text>
            </View>
            <Switch
              value={onDuty}
              onValueChange={toggleDuty}
              trackColor={{ false: '#334155', true: colors.success }}
              thumbColor="#ffffff"
            />
          </View>

          {permission === 'denied' && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }}>
              <Text style={{ color: '#fca5a5', fontSize: 12 }}>
                Location permission is off. Rides go to the nearest driver, so you will not receive
                any until you enable it in Settings.
              </Text>
            </View>
          )}
        </View>

        {notice && (
          <View style={{ backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md }}>
            <Text style={{ color: '#92400e', fontSize: 13 }}>{notice}</Text>
          </View>
        )}

        {/* An active trip takes over — nothing else matters mid-ride. */}
        {active ? (
          <Pressable
            onPress={() => router.push(`/trip/${active.id}`)}
            style={({ pressed }) => ({
              backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg,
              borderWidth: 2, borderColor: colors.accent, opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', color: colors.accent, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {active.status === 'ongoing' ? '● Trip in progress' : '● Ride accepted'}
              </Text>
              {active.source === 'offline' && (
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted }}>OFFLINE RIDE</Text>
              )}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 6 }}>
              {active.customerName}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>🟢 {active.pickup}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>🔴 {active.dropoff}</Text>
            <Text style={{ marginTop: spacing.sm, color: colors.accent, fontWeight: '800' }}>
              {active.status === 'ongoing' ? 'Tap to end trip →' : 'Tap to start trip →'}
            </Text>
          </Pressable>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Ride requests</Text>
              {onDuty && <Text style={{ fontSize: 12, color: colors.textMuted }}>Nearest first</Text>}
            </View>

            {!onDuty ? (
              <Empty text="You are off duty. Turn on the switch above to start receiving rides." />
            ) : offers.length === 0 ? (
              <Empty text="No ride requests right now. New rides near you will appear here automatically." />
            ) : (
              offers.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  busy={busyId === o.id}
                  onAccept={() => onAccept(o)}
                  onDecline={() => onDecline(o)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OfferCard({ offer, busy, onAccept, onDecline }: {
  offer: Offer; busy: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const secondsLeft = offer.expiresAt
    ? Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 1000))
    : null;

  return (
    <View style={{
      backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg,
      borderWidth: 1, borderColor: offer.exclusive ? colors.success : colors.border,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.success }}>
            {offer.distanceToPickupKm} km away
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 }}>
            {offer.customerName}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
            {formatINR(offer.estimatedFare)}
          </Text>
          {offer.estimatedKm > 0 && (
            <Text style={{ fontSize: 11, color: colors.textMuted }}>~{offer.estimatedKm.toFixed(1)} km trip</Text>
          )}
        </View>
      </View>

      {offer.exclusive && (
        <View style={{
          backgroundColor: '#dcfce7', borderRadius: radius.sm,
          paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6,
        }}>
          <Text style={{ color: '#166534', fontSize: 10, fontWeight: '800' }}>
            OFFERED TO YOU FIRST{secondsLeft !== null ? ` · ${secondsLeft}s` : ''}
          </Text>
        </View>
      )}

      <View style={{ marginTop: spacing.md, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={2}>🟢 {offer.pickup}</Text>
        <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={2}>🔴 {offer.dropoff}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        <Pressable
          onPress={onDecline}
          disabled={busy}
          style={({ pressed }) => ({
            flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
            borderWidth: 1, borderColor: colors.border, alignItems: 'center', opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Decline</Text>
        </Pressable>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          style={({ pressed }) => ({
            flex: 2, paddingVertical: spacing.md, borderRadius: radius.md,
            backgroundColor: busy ? '#94a3b8' : colors.success, alignItems: 'center', opacity: pressed ? 0.85 : 1,
          })}
        >
          {busy
            ? <ActivityIndicator color="white" />
            : <Text style={{ color: 'white', fontWeight: '800' }}>Accept ride</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={{
      backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.xl,
      alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    }}>
      <Text style={{ fontSize: 32 }}>🚖</Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, fontSize: 13 }}>{text}</Text>
    </View>
  );
}
