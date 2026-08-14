import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useDuty } from '../../lib/useDuty';
import { DriverMap, type MapPin } from '../../lib/DriverMap';
import {
  acceptOffer, declineOffer, fetchActiveTrip, fetchHistory, fetchOffers, formatINR,
  type ActiveTrip, type Offer,
} from '../../lib/trips';
import { durationMs, formatClock, formatHours } from '../../lib/shift';
import { colors, spacing, radius } from '../../lib/theme';

/** How often the offer feed refreshes while on duty. */
const POLL_MS = 5000;

/**
 * The driver's home — a map with the job laid over it.
 *
 * This screen used to be a scrolling list of addresses, which asked the driver
 * to work out where a pickup was from its text. Dispatch here is nearest-first,
 * so "how far is this from me" is the whole decision, and it is a question a
 * map answers instantly and a street name does not.
 *
 * The sheet at the bottom is deliberately the only thing competing with the
 * map: one state, one action. Off duty it offers a single button; on duty it
 * shows the shift clock and whatever work is waiting; on a trip it collapses to
 * a bar that gets the driver back to the trip screen.
 */
export default function Dashboard() {
  const { driver } = useAuth();
  const {
    onDuty, position, heading, permission, toggleDuty, pingNow, shift, hoursToday,
  } = useDuty();
  const router = useRouter();
  const { height } = useWindowDimensions();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [active, setActive] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [todayFare, setTodayFare] = useState(0);
  const [todayTrips, setTodayTrips] = useState(0);
  const [switching, setSwitching] = useState(false);

  // Re-render once a second so the offer countdowns and the shift clock tick.
  const [now, setNow] = useState(Date.now());
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

  // Today's takings, for the header. Fetched on focus rather than on the poll —
  // it changes once a trip, not once every five seconds.
  const loadToday = useCallback(async () => {
    try {
      const res = await fetchHistory();
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const today = res.trips.filter(
        (t) => t.status === 'completed' && new Date(t.createdAt) >= midnight,
      );
      setTodayFare(today.reduce((s, t) => s + (t.totalFare ?? 0), 0));
      setTodayTrips(today.length);
    } catch {
      // Header figures are not worth an error state.
    }
  }, []);

  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));

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

  async function onGo(next: boolean) {
    setSwitching(true);
    try {
      await toggleDuty(next);
      await load();
    } finally {
      setSwitching(false);
    }
  }

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

  // What the map shows: the live trip if there is one, otherwise every pickup
  // currently on offer, so distance is read rather than guessed.
  const pins: MapPin[] = [];
  if (active) {
    if (active.pickupLat != null && active.pickupLng != null) {
      pins.push({ id: 'pickup', at: { lat: active.pickupLat, lng: active.pickupLng }, kind: 'pickup', label: 'Pickup' });
    }
    if (active.dropLat != null && active.dropLng != null) {
      pins.push({ id: 'drop', at: { lat: active.dropLat, lng: active.dropLng }, kind: 'drop', label: 'Drop' });
    }
  } else {
    for (const o of offers) {
      if (o.pickupLat != null && o.pickupLng != null) {
        pins.push({
          id: o.id,
          at: { lat: o.pickupLat, lng: o.pickupLng },
          kind: 'offer',
          label: formatINR(o.estimatedFare),
        });
      }
    }
  }

  const target = active
    ? active.status === 'ongoing'
      ? (active.dropLat != null && active.dropLng != null ? { lat: active.dropLat, lng: active.dropLng } : null)
      : (active.pickupLat != null && active.pickupLng != null ? { lat: active.pickupLat, lng: active.pickupLng } : null)
    : null;

  // Frame the driver and the job together, once per leg. Recomputing this on
  // every GPS tick would re-zoom the map a few times a second.
  const [fit, setFit] = useState<{ lat: number; lng: number }[] | undefined>();
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      fittedFor.current = null;
      setFit(undefined);
      return;
    }
    if (!position || !target) return;
    const leg = `${active.id}:${active.status}`;
    if (fittedFor.current === leg) return;
    fittedFor.current = leg;
    setFit([position, target]);
  }, [active?.id, active?.status, position, target?.lat, target?.lng]);

  const sheetMax = Math.round(height * 0.56);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <DriverMap
        position={position}
        heading={heading}
        pins={pins}
        guideTo={target}
        fit={fit}
        follow={!active}
      >
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <Header
              name={driver?.name ?? 'Driver'}
              onDuty={onDuty}
              todayFare={todayFare}
              todayTrips={todayTrips}
              hoursToday={hoursToday}
              onPress={() => router.push('/(tabs)/earnings')}
            />

            {permission === 'denied' && (
              <Banner
                tone="error"
                text="Location is off. Rides go to the nearest driver, so you will not receive any until you enable it in Settings."
              />
            )}
            {notice && <Banner tone="warn" text={notice} />}
          </View>
        </SafeAreaView>
      </DriverMap>

      {/* Sheet */}
      <View style={{
        backgroundColor: 'white',
        borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
        shadowOffset: { width: 0, height: -3 }, elevation: 12,
        maxHeight: sheetMax,
      }}>
        <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>

        <SafeAreaView edges={['bottom']}>
          {loading ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : active ? (
            <ActiveTripBar trip={active} onPress={() => router.push(`/trip/${active.id}`)} />
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => { setRefreshing(true); load(); loadToday(); }}
                  tintColor={colors.primary}
                />
              }
            >
              {!onDuty ? (
                <OffDuty busy={switching} onGo={() => onGo(true)} />
              ) : (
                <>
                  <OnDutyStrip
                    shiftMs={shift ? durationMs(shift, now) : 0}
                    offers={offers.length}
                    busy={switching}
                    onStop={() => onGo(false)}
                  />

                  {offers.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                      <ActivityIndicator color={colors.success} />
                      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' }}>
                        Looking for rides near you. Requests appear here automatically.
                      </Text>
                    </View>
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
          )}
        </SafeAreaView>
      </View>
    </View>
  );
}

function Header({ name, onDuty, todayFare, todayTrips, hoursToday, onPress }: {
  name: string; onDuty: boolean; todayFare: number; todayTrips: number;
  hoursToday: number; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.9 : 1,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 }, elevation: 4,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: onDuty ? colors.success : colors.textMuted }}>
          {onDuty ? '● ONLINE' : '○ OFFLINE'}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{formatINR(todayFare)}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted }}>
          {todayTrips} trip{todayTrips === 1 ? '' : 's'} · {formatHours(hoursToday)} today
        </Text>
      </View>
    </Pressable>
  );
}

function Banner({ tone, text }: { tone: 'error' | 'warn'; text: string }) {
  const bg = tone === 'error' ? '#fee2e2' : '#fef3c7';
  const fg = tone === 'error' ? '#991b1b' : '#92400e';
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: spacing.sm }}>
      <Text style={{ color: fg, fontSize: 12 }}>{text}</Text>
    </View>
  );
}

/** The single action available off duty. Payroll starts counting on this tap. */
function OffDuty({ busy, onGo }: { busy: boolean; onGo: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>You are offline</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
        Go online to start receiving rides. Your duty hours are recorded from the moment you tap.
      </Text>
      <Pressable
        onPress={onGo}
        disabled={busy}
        style={({ pressed }) => ({
          width: 128, height: 128, borderRadius: 64,
          backgroundColor: busy ? '#94a3b8' : colors.success,
          alignItems: 'center', justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: colors.success, shadowOpacity: 0.4, shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 }, elevation: 8,
        })}
      >
        {busy
          ? <ActivityIndicator color="white" size="large" />
          : <Text style={{ color: 'white', fontWeight: '900', fontSize: 30, letterSpacing: 1 }}>GO</Text>}
      </Pressable>
    </View>
  );
}

/** On-duty status line: the live payroll clock, and the way back off duty. */
function OnDutyStrip({ shiftMs, offers, busy, onStop }: {
  shiftMs: number; offers: number; busy: boolean; onStop: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
          ON DUTY · THIS SHIFT
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {formatClock(shiftMs)}
        </Text>
        <Text style={{ color: '#94a3b8', fontSize: 11 }}>
          {offers > 0 ? `${offers} ride request${offers === 1 ? '' : 's'} waiting` : 'Counting towards your hourly pay'}
        </Text>
      </View>

      <Pressable
        onPress={onStop}
        disabled={busy}
        style={({ pressed }) => ({
          paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
          borderWidth: 1.5, borderColor: '#64748b', opacity: pressed ? 0.7 : 1,
        })}
      >
        {busy
          ? <ActivityIndicator color="white" />
          : <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>GO{'\n'}OFFLINE</Text>}
      </Pressable>
    </View>
  );
}

function ActiveTripBar({ trip, onPress }: { trip: ActiveTrip; onPress: () => void }) {
  const ongoing = trip.status === 'ongoing';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ padding: spacing.lg, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', color: colors.accent, fontSize: 11, letterSpacing: 0.8 }}>
          {ongoing ? '● TRIP IN PROGRESS' : '● RIDE ACCEPTED'}
        </Text>
        {trip.source === 'offline' && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted }}>OFFLINE RIDE</Text>
        )}
      </View>

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 4 }}>
        {trip.customerName}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
        {ongoing ? `🔴 ${trip.dropoff}` : `🟢 ${trip.pickup}`}
      </Text>

      <View style={{
        backgroundColor: colors.accent, borderRadius: radius.lg, padding: spacing.lg,
        alignItems: 'center', marginTop: spacing.md,
      }}>
        <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
          {ongoing ? 'Open trip to end ride' : 'Open trip to start ride'}
        </Text>
      </View>
    </Pressable>
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
      borderWidth: offer.exclusive ? 2 : 1,
      borderColor: offer.exclusive ? colors.success : colors.border,
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
