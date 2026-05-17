import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { listMyTrips, VEHICLE_EMOJI, type Trip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

type Filter = 'all' | 'active' | 'completed' | 'cancelled';

export default function Trips() {
  const { driver } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  async function load() {
    if (!driver) { setLoading(false); return; }
    const data = await listMyTrips(driver.id);
    setTrips(data);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [driver?.id]));

  const filtered = useMemo(() => {
    if (filter === 'all') return trips;
    if (filter === 'active') return trips.filter((t) => t.status === 'pending' || t.status === 'confirmed');
    return trips.filter((t) => t.status === filter);
  }, [trips, filter]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgSoft }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>My Trips</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.xs, marginBottom: spacing.sm }}>
        {(['all', 'active', 'completed', 'cancelled'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill,
              backgroundColor: filter === f ? colors.primary : 'white',
              borderWidth: 1, borderColor: filter === f ? colors.primary : colors.border,
              alignItems: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: filter === f ? 'white' : colors.text, fontWeight: '700', fontSize: 12 }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>No trips here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md,
              borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                {VEHICLE_EMOJI[item.vehicle_type]} {item.customer_name}
              </Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {new Date(item.pickup_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <Text style={{ color: colors.text, fontSize: 13, marginTop: spacing.xs }} numberOfLines={1}>🟢 {item.pickup}</Text>
            <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>🔴 {item.drop_location}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.distance_km ? `${item.distance_km} km` : '—'} · {item.payment_status === 'paid' ? '✓ paid' : '○ unpaid'}
              </Text>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                ₹{(item.final_fare ?? item.estimated_fare ?? 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: Trip['status'] }) {
  const palette: Record<Trip['status'], { bg: string; fg: string }> = {
    pending:   { bg: '#fef3c7', fg: '#92400e' },
    confirmed: { bg: '#dbeafe', fg: '#1e40af' },
    completed: { bg: '#d1fae5', fg: '#065f46' },
    cancelled: { bg: '#e5e7eb', fg: '#374151' },
  };
  const p = palette[status];
  return (
    <View style={{ backgroundColor: p.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
      <Text style={{ color: p.fg, fontWeight: '700', fontSize: 10, textTransform: 'uppercase' }}>{status}</Text>
    </View>
  );
}
