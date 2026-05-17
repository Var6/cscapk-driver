import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors, spacing, radius } from '../../lib/theme';

export default function DriverLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, justifyContent: 'center' }}>

          <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
            <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
              <Text style={{ color: 'white', fontSize: 36 }}>🚖</Text>
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: 'white' }}>Driver Sign In</Text>
            <Text style={{ color: '#cbd5e1', marginTop: 4, textAlign: 'center' }}>CSC Travels • Partner Portal</Text>
          </View>

          <Label>Email</Label>
          <TextInput
            value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address"
            placeholder="driver@example.com" placeholderTextColor="#64748b"
            style={inputStyle}
          />

          <Label>Password</Label>
          <TextInput
            value={password} onChangeText={setPassword} secureTextEntry
            placeholder="••••••••" placeholderTextColor="#64748b"
            style={inputStyle}
          />

          {error ? (
            <View style={{ backgroundColor: '#7f1d1d', padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md }}>
              <Text style={{ color: '#fecaca' }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onLogin}
            disabled={loading || !email || !password}
            style={({ pressed }) => ({
              backgroundColor: loading || !email || !password ? '#475569' : colors.accent,
              padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center',
              opacity: pressed ? 0.85 : 1, marginTop: spacing.xl,
            })}
          >
            {loading ? <ActivityIndicator color="white" /> : (
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Sign In</Text>
            )}
          </Pressable>

          <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: spacing.xl, fontSize: 13 }}>
            New drivers are onboarded by CSC Travels admin. {'\n'}Contact dispatch for credentials.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md }}>{children}</Text>;
}

const inputStyle = {
  borderWidth: 1, borderColor: '#334155', borderRadius: radius.md,
  padding: spacing.md, fontSize: 16, color: 'white', backgroundColor: '#1e293b',
};
