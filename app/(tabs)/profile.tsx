import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, spacing, radius } from '../../lib/theme';

export default function Profile() {
  const { driver, user, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will be marked offline.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgSoft }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>

        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }}>
            <Text style={{ color: 'white', fontSize: 30, fontWeight: '900' }}>
              {(driver?.full_name || user?.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{driver?.full_name ?? '—'}</Text>
          <Text style={{ color: colors.textMuted }}>{user?.email}</Text>
          {driver && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pill text={`⭐ ${driver.rating.toFixed(1)}`} />
              <Pill text={`${driver.trips_count} trips`} />
            </View>
          )}
        </View>

        <Card title="Contact">
          <Row label="Phone" value={driver?.phone ?? '—'} />
          <Row label="Email" value={user?.email ?? '—'} />
        </Card>

        <Card title="Vehicle & licence">
          <Row label="Licence #" value={driver?.license_no ?? '—'} />
          <Row label="Vehicle plate" value={driver?.vehicle_plate ?? 'Not assigned'} />
        </Card>

        <Card title="Compensation">
          <Row label="Base salary" value={`₹${(driver?.base_salary ?? 0).toLocaleString('en-IN')} / month`} />
          <Row label="Incentive" value={`₹${driver?.per_km_rate ?? 0} / km`} />
        </Card>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => ({
            marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg,
            borderWidth: 1, borderColor: colors.error, alignItems: 'center', opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.error, fontWeight: '800' }}>Sign Out</Text>
        </Pressable>

        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg }}>
          To update your details, contact CSC Travels admin.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.sm, letterSpacing: 1 }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'white', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </View>
  );
}
