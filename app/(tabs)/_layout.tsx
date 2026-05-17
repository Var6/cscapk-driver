import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { colors } from '../../lib/theme';

function TabIcon({ emoji }: { emoji: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 60 }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, paddingTop: 6, height: 64 },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: () => <TabIcon emoji="🏠" /> }} />
      <Tabs.Screen name="trips"    options={{ title: 'Trips',     tabBarIcon: () => <TabIcon emoji="🚖" /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings',  tabBarIcon: () => <TabIcon emoji="💰" /> }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',   tabBarIcon: () => <TabIcon emoji="👤" /> }} />
    </Tabs>
  );
}
