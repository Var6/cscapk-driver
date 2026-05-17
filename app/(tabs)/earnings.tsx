import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { listMyTrips, type Trip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

export default function Earnings() {
  const { driver } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!driver) { setLoading(false); return; }
    const data = await listMyTrips(driver.id);
    setTrips(data);
    setLoading(false);
    setRefreshing(false);
  }
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [driver?.id]));

  const stats = useMemo(() => {
    const completed = trips.filter((t) => t.status === 'completed');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const filterByDate = (from: Date) => completed.filter((t) => t.actual_end_at && new Date(t.actual_end_at) >= from);

    const totalKmFor = (rows: Trip[]) => rows.reduce((s, t) => {
      if (t.start_odometer != null && t.end_odometer != null) return s + (t.end_odometer - t.start_odometer);
      return s + (t.distance_km ?? 0);
    }, 0);
    const earningsFor = (rows: Trip[]) => rows.reduce((s, t) => s + (t.final_fare ?? 0), 0);

    const day = filterByDate(today);
    const week = filterByDate(weekStart);
    const month = filterByDate(monthStart);

    const incentive = (km: number) => Math.round(km * (driver?.per_km_rate ?? 0));

    return {
      day:   { trips: day.length,   km: totalKmFor(day),   earnings: earningsFor(day),   incentive: incentive(totalKmFor(day))   },
      week:  { trips: week.length,  km: totalKmFor(week),  earnings: earningsFor(week),  incentive: incentive(totalKmFor(week))  },
      month: { trips: month.length, km: totalKmFor(month), earnings: earningsFor(month), incentive: incentive(totalKmFor(month)) },
    };
  }, [trips, driver?.per_km_rate]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgSoft }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}>Earnings</Text>

        <Card label="Today"      data={stats.day}   />
        <Card label="This week"  data={stats.week}  />
        <Card label="This month" data={stats.month} />

        <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
            Compensation rates
          </Text>
          <Row label="Base salary (monthly)" value={`₹${(driver?.base_salary ?? 0).toLocaleString('en-IN')}`} />
          <Row label="Incentive per KM" value={`₹${driver?.per_km_rate ?? 0}/km`} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
            Final monthly payout = base + km incentive + adjustments by admin.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ label, data }: { label: string; data: { trips: number; km: number; earnings: number; incentive: number } }) {
  return (
    <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>{label}</Text>
      <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text }}>
        ₹{data.earnings.toLocaleString('en-IN')}
      </Text>
      <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>customer fare collected</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
        <Mini label="Trips" value={data.trips.toString()} />
        <Mini label="KM" value={data.km.toFixed(1)} />
        <Mini label="Incentive" value={`₹${data.incentive.toLocaleString('en-IN')}`} />
      </View>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
