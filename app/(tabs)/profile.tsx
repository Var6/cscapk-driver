import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { useDuty } from '../../lib/useDuty';
import { colors, spacing, radius } from '../../lib/theme';

export default function Profile() {
  const { driver, signOut } = useAuth();
  const { onDuty, permission } = useDuty();

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will be taken off duty and stop receiving rides.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>

        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
          }}>
            <Text style={{ color: 'white', fontSize: 30, fontWeight: '900' }}>
              {(driver?.name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{driver?.name ?? '—'}</Text>
          <Text style={{ color: colors.textMuted }}>{driver?.phone ?? ''}</Text>
          {driver && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pill text={`⭐ ${(driver.rating ?? 0).toFixed(1)}`} />
              <Pill text={`${driver.trips ?? 0} trips`} />
              <Pill text={onDuty ? '🟢 On duty' : '⚪ Off duty'} />
            </View>
          )}
        </View>

        <Card title="Driver">
          <Row label="Name" value={driver?.name ?? '—'} />
          <Row label="Phone" value={driver?.phone ?? '—'} />
          <Row label="Email" value={driver?.email ?? '—'} />
          <Row label="Licence" value={driver?.license ?? '—'} />
        </Card>

        <Card title="Vehicle">
          <Row label="Assigned vehicle" value={driver?.vehicle ?? 'Not assigned'} />
          {!driver?.vehicle && !driver?.vehicleId && (
            <Text style={{ fontSize: 12, color: colors.warning, marginTop: 4 }}>
              Offline rides need an assigned vehicle. Ask the office to set one.
            </Text>
          )}
        </Card>

        <Card title="Pay">
          <Row label="Base salary" value={`₹${(driver?.baseSalary ?? 0).toLocaleString('en-IN')}`} />
          <Row label="Per-km incentive" value={`₹${driver?.perKmRate ?? 0}/km`} />
        </Card>

        <Card title="Location">
          <Row
            label="Permission"
            value={permission === 'granted' ? 'Granted' : permission === 'denied' ? 'Denied' : 'Not asked'}
          />
          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
            Rides are dispatched to the nearest driver, and your trip distance is checked against the
            route your phone records. Both need location on.
          </Text>
        </Card>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => ({
            marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg,
            borderWidth: 1, borderColor: colors.border, alignItems: 'center',
            backgroundColor: 'white', opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.error, fontWeight: '700' }}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'white', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{text}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg,
      marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.sm, letterSpacing: 0.8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
