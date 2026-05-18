import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { colors, spacing, radius } from './theme';

export function Speedometer({ compact = false }: { compact?: boolean }) {
  const [kmh, setKmh] = useState<number | null>(null);
  const [topKmh, setTopKmh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('Location permission denied'); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
        (loc) => {
          // speed is m/s; can be null/negative when stationary.
          const mps = loc.coords.speed ?? 0;
          const v = Math.max(0, mps) * 3.6;
          setKmh(v);
          setTopKmh((t) => (v > t ? v : t));
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  if (error) {
    return (
      <View style={{ padding: spacing.md, backgroundColor: '#fee2e2', borderRadius: radius.md }}>
        <Text style={{ color: '#991b1b' }}>{error}</Text>
      </View>
    );
  }

  if (kmh == null) {
    return (
      <View style={{ padding: spacing.md, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Acquiring GPS…</Text>
      </View>
    );
  }

  const display = Math.round(kmh);
  const tone = display > 80 ? colors.accent : display > 60 ? '#f59e0b' : colors.success;

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tone }}>{display}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700' }}>km/h</Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Speed</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: 4 }}>
        <Text style={{ fontSize: 64, fontWeight: '900', color: tone, lineHeight: 70 }}>{display}</Text>
        <Text style={{ fontSize: 16, color: colors.textMuted, fontWeight: '700' }}>km/h</Text>
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.xs }}>
        Peak this trip: {Math.round(topKmh)} km/h
      </Text>
    </View>
  );
}
