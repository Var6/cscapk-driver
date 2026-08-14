import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useDuty } from './useDuty';
import { colors, spacing, radius } from './theme';

/**
 * Speed readout.
 *
 * Reads the fix the duty provider is already watching rather than opening a
 * second GPS stream of its own. Two navigation-accuracy subscriptions on one
 * device is a measurable battery cost for a driver who is out for ten hours,
 * and both would be reporting the same journey.
 */
export function Speedometer({ compact = false }: { compact?: boolean }) {
  const { speedKmh, permission } = useDuty();
  const [topKmh, setTopKmh] = useState(0);

  useEffect(() => {
    setTopKmh((t) => (speedKmh > t ? speedKmh : t));
  }, [speedKmh]);

  if (permission === 'denied') {
    return (
      <View style={{ padding: spacing.md, backgroundColor: '#fee2e2', borderRadius: radius.md }}>
        <Text style={{ color: '#991b1b' }}>Location permission denied</Text>
      </View>
    );
  }

  const display = Math.round(speedKmh);
  const tone = display > 80 ? colors.error : display > 60 ? colors.warning : colors.success;

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tone, fontVariant: ['tabular-nums'] }}>
          {display}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700' }}>km/h</Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: 'white', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Speed</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: 4 }}>
        <Text style={{ fontSize: 64, fontWeight: '900', color: tone, lineHeight: 70, fontVariant: ['tabular-nums'] }}>
          {display}
        </Text>
        <Text style={{ fontSize: 16, color: colors.textMuted, fontWeight: '700' }}>km/h</Text>
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.xs }}>
        Peak this trip: {Math.round(topKmh)} km/h
      </Text>
    </View>
  );
}
