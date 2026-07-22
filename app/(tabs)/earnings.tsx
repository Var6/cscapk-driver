import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { fetchHistory, formatINR, type ActiveTrip, type HistorySummary } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

export default function Earnings() {
  const { driver } = useAuth();
  const [trips, setTrips] = useState<ActiveTrip[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchHistory();
      setTrips(res.trips);
      setSummary(res.summary);
    } catch {
      setTrips([]);
      setSummary(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  // Incentive only — the monthly base salary is settled by payroll, not here.
  const incentive = km(completed) * (driver?.perKmRate ?? 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Earnings</Text>

        <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg }}>
          <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Fares collected today
          </Text>
          <Text style={{ color: 'white', fontSize: 34, fontWeight: '800', marginTop: 4 }}>
            {formatINR(sum(today))}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            {today.length} trip{today.length === 1 ? '' : 's'} · {km(today).toFixed(1)} km
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Stat label="Total trips" value={String(summary?.count ?? completed.length)} />
          <Stat label="Total km" value={`${(summary?.totalKm ?? km(completed)).toFixed(0)}`} />
        </View>

        <Card title="Fares collected (last 50 trips)">
          <Row label="Total" value={formatINR(summary?.totalFare ?? sum(completed))} />
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
            This is money taken from customers, not your take-home.
          </Text>
        </Card>

        <Card title="Your pay">
          <Row label="Monthly base salary" value={formatINR(driver?.baseSalary ?? 0)} />
          <Row label={`Per-km incentive (₹${driver?.perKmRate ?? 0}/km)`} value={formatINR(incentive)} />
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
            Indicative only — payroll is settled by the office.
          </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{value}</Text>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
