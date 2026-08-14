import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useDuty } from '../../lib/useDuty';
import { fetchHistory, formatINR, type ActiveTrip, type HistorySummary } from '../../lib/trips';
import {
  durationMs, formatClock, formatDay, formatHours, formatTime, listShifts, type Shift,
} from '../../lib/shift';
import { colors, spacing, radius } from '../../lib/theme';

type Tab = 'earnings' | 'hours';

/**
 * What the driver is owed, and the hours behind it.
 *
 * Pay here has three parts and they are kept visibly separate, because they are
 * settled differently: fares are money the driver has *collected* and will hand
 * over, duty hours are what the office pays them *for*, and the per-km figure
 * is an incentive on top. Rolling those into one number would read as take-home
 * and be wrong in every direction.
 */
export default function Earnings() {
  const { driver } = useAuth();
  const { shift, hoursToday, hoursWeek, hoursMonth, refreshHours } = useDuty();

  const [tab, setTab] = useState<Tab>('earnings');
  const [trips, setTrips] = useState<ActiveTrip[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Ticks the running-shift clock.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [shift?.clientId]);

  const load = useCallback(async () => {
    try {
      const res = await fetchHistory();
      setTrips(res.trips);
      setSummary(res.summary);
    } catch {
      setTrips([]);
      setSummary(null);
    }

    // Hours come off the device, so they survive a dead network.
    if (driver) {
      await refreshHours();
      setShifts(await listShifts(driver.id));
    }

    setLoading(false);
    setRefreshing(false);
  }, [driver?.id, refreshHours]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const completed = trips.filter((t) => t.status === 'completed');
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const today = completed.filter((t) => new Date(t.createdAt) >= startOfToday);

  const sum = (rows: ActiveTrip[]) => rows.reduce((s, t) => s + (t.totalFare ?? 0), 0);
  const km = (rows: ActiveTrip[]) => rows.reduce((s, t) => s + (t.meteredKm ?? 0), 0);

  const rate = driver?.hourlyRate ?? 0;
  const incentive = km(completed) * (driver?.perKmRate ?? 0);
  const unsynced = shifts.filter((s) => !s.syncedAt).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Earnings</Text>
        <Segmented tab={tab} onChange={setTab} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
      >
        {/* The live shift is worth seeing on both tabs. */}
        {shift && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            backgroundColor: '#dcfce7', borderRadius: radius.lg, padding: spacing.md,
          }}>
            <Text style={{ fontSize: 18 }}>🟢</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: '#166534', fontSize: 13 }}>
                On duty since {formatTime(shift.startedAt)}
              </Text>
              <Text style={{ color: '#166534', fontSize: 12 }}>
                {formatClock(durationMs(shift, now))} on the clock
              </Text>
            </View>
          </View>
        )}

        {tab === 'earnings' ? (
          <>
            <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg }}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Fares collected today
              </Text>
              <Text style={{ color: 'white', fontSize: 34, fontWeight: '800', marginTop: 4 }}>
                {formatINR(sum(today))}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                {today.length} trip{today.length === 1 ? '' : 's'} · {km(today).toFixed(1)} km · {formatHours(hoursToday)} on duty
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Stat label="Total trips" value={String(summary?.count ?? completed.length)} />
              <Stat label="Total km" value={`${(summary?.totalKm ?? km(completed)).toFixed(0)}`} />
              <Stat label="Hours this month" value={formatHours(hoursMonth)} />
            </View>

            <Card title="Fares collected (last 50 trips)">
              <Row label="Total" value={formatINR(summary?.totalFare ?? sum(completed))} />
              <Note>This is money taken from customers, not your take-home.</Note>
            </Card>

            <Card title="Your pay">
              <Row label="Monthly base salary" value={formatINR(driver?.baseSalary ?? 0)} />

              {rate > 0 ? (
                <>
                  <Row label={`Duty hours today (₹${rate}/hr)`} value={formatINR(hoursToday * rate)} />
                  <Row label="This week" value={`${formatHours(hoursWeek)} · ${formatINR(hoursWeek * rate)}`} />
                  <Row label="This month" value={`${formatHours(hoursMonth)} · ${formatINR(hoursMonth * rate)}`} />
                </>
              ) : (
                <>
                  <Row label="Duty hours today" value={formatHours(hoursToday)} />
                  <Row label="This week" value={formatHours(hoursWeek)} />
                  <Row label="This month" value={formatHours(hoursMonth)} />
                </>
              )}

              <Row label={`Per-km incentive (₹${driver?.perKmRate ?? 0}/km)`} value={formatINR(incentive)} />
              <Note>
                {rate > 0
                  ? 'Indicative only — payroll is settled by the office against the hours it has received.'
                  : 'Your hourly rate is set by the office. Hours are being recorded either way — see the Hours tab.'}
              </Note>
            </Card>

            {!!summary?.flagged && (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.lg }}>
                <Text style={{ fontWeight: '800', color: '#92400e' }}>
                  {summary.flagged} trip{summary.flagged === 1 ? '' : 's'} under office review
                </Text>
                <Text style={{ color: '#92400e', fontSize: 12, marginTop: 4 }}>
                  The odometer reading did not match the distance your phone tracked. The office will
                  confirm these before payout.
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Stat label="Today" value={formatHours(hoursToday)} />
              <Stat label="This week" value={formatHours(hoursWeek)} />
              <Stat label="This month" value={formatHours(hoursMonth)} />
            </View>

            {rate > 0 && (
              <Card title="Duty pay this month">
                <Row label={`${formatHours(hoursMonth)} × ₹${rate}/hr`} value={formatINR(hoursMonth * rate)} big />
              </Card>
            )}

            {unsynced > 0 && (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.md }}>
                <Text style={{ color: '#92400e', fontSize: 12 }}>
                  {unsynced} shift{unsynced === 1 ? '' : 's'} not yet sent to the office. They are saved
                  on this phone and upload automatically once you have signal.
                </Text>
              </View>
            )}

            <Card title="Shift history">
              {shifts.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  No shifts recorded yet. Your hours start counting the moment you go online.
                </Text>
              ) : (
                shifts.map((s, i) => (
                  <ShiftRow key={s.clientId} shift={s} now={now} first={i === 0} />
                ))
              )}
            </Card>

            <Note>
              Hours are recorded on this phone when you go on and off duty, and sent to the office.
              A shift left open is capped at 16 hours.
            </Note>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Segmented({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: 3 }}>
      {(['earnings', 'hours'] as Tab[]).map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(t)}
          style={{
            flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center',
            backgroundColor: tab === t ? 'white' : 'transparent',
          }}
        >
          <Text style={{
            fontWeight: '800', fontSize: 13,
            color: tab === t ? colors.text : colors.textMuted,
          }}>
            {t === 'earnings' ? 'Earnings' : 'Hours'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ShiftRow({ shift, now, first }: { shift: Shift; now: number; first: boolean }) {
  const running = !shift.endedAt;
  const hours = durationMs(shift, now) / 3_600_000;

  return (
    <View style={{
      paddingVertical: spacing.sm,
      borderTopWidth: first ? 0 : 1, borderTopColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
          {formatDay(shift.startedAt)}
        </Text>
        <Text style={{
          color: running ? colors.success : colors.text,
          fontWeight: '800', fontSize: 14,
        }}>
          {running ? formatClock(durationMs(shift, now)) : formatHours(hours)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {formatTime(shift.startedAt)} → {shift.endedAt ? formatTime(shift.endedAt) : 'now'}
        </Text>
        {shift.autoClosed && (
          <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '800' }}>AUTO-CLOSED 16H</Text>
        )}
        {!shift.syncedAt && !shift.autoClosed && (
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>NOT SENT</Text>
        )}
      </View>

      {shift.autoClosed && (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
          You did not go off duty. Ask the office to correct this if you worked longer.
        </Text>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: big ? 20 : 14 }}>{value}</Text>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{children}</Text>;
}
