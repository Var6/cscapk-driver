import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { fetchHistory, formatINR, type ActiveTrip } from '../../lib/trips';
import { colors, spacing, radius } from '../../lib/theme';

/** Completed and cancelled trips. The active one lives on the dashboard. */
export default function Trips() {
  const [trips, setTrips] = useState<ActiveTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchHistory();
      setTrips(res.trips);
    } catch {
      setTrips([]);
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>My Trips</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>🚖</Text>
            <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>No completed trips yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.customerName}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  {new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{formatINR(item.totalFare)}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' }}>{item.status}</Text>
              </View>
            </View>

            <View style={{ marginTop: spacing.sm, gap: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>🟢 {item.pickup}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>🔴 {item.dropoff}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {item.meteredKm ? `${item.meteredKm.toFixed(1)} km metered` : '—'}
                {item.source === 'offline' ? ' · offline' : ''}
              </Text>
              {item.flagged && (
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.warning }}>⚠ Under review</Text>
              )}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
