import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, spacing, radius } from '../../lib/theme';

/**
 * Sign-in is by phone, not email — that is the identifier drivers actually
 * know, and the one the office issues credentials against. Email still works
 * if the driver row has one; the server accepts either.
 *
 * There is no "create account" here on purpose: a driver row implies an
 * employment relationship and a verified licence, so the office issues
 * credentials with scripts/set-driver-password.mjs.
 */
export default function DriverLogin() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (loading) return;
    setError('');

    if (!identifier.trim() || !password) {
      setError('Enter your phone number and password.');
      return;
    }

    setLoading(true);
    try {
      await signIn(identifier.trim(), password);
      // The root Gate redirects once the driver lands in context.
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, justifyContent: 'center' }}>

          <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
            <View style={{
              width: 80, height: 80, borderRadius: 24, backgroundColor: colors.accent,
              alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
            }}>
              <Text style={{ color: 'white', fontSize: 36 }}>🚖</Text>
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: 'white' }}>Driver Sign In</Text>
            <Text style={{ color: '#cbd5e1', marginTop: 4, textAlign: 'center' }}>
              CSC Travels • Partner Portal
            </Text>
          </View>

          <Label>Phone number</Label>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="phone-pad"
            placeholder="9876543210"
            placeholderTextColor="#64748b"
            style={inputStyle}
          />

          <Label>Password</Label>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#64748b"
            style={inputStyle}
            onSubmitEditing={onLogin}
            returnKeyType="go"
          />

          {error ? (
            <View style={{
              backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: radius.md,
              padding: spacing.md, marginTop: spacing.md,
            }}>
              <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onLogin}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: colors.accent,
              padding: spacing.lg,
              borderRadius: radius.lg,
              alignItems: 'center',
              marginTop: spacing.xl,
              opacity: pressed || loading ? 0.8 : 1,
            })}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Sign In</Text>}
          </Pressable>

          <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: spacing.xl }}>
            No login yet? Ask the office to issue your driver app password.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      color: '#94a3b8', fontSize: 12, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: spacing.md,
    }}>
      {children}
    </Text>
  );
}

const inputStyle = {
  backgroundColor: '#1e293b',
  borderRadius: radius.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  color: 'white',
  fontSize: 16,
} as const;
