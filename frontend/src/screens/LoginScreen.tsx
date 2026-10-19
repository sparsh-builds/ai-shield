import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { signIn } from '../auth';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../utils/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    setBusy(true);
    try {
      await signIn();
      navigation.replace('Inbox');
    } catch (e: any) {
      Alert.alert('Login fail', e?.message ?? 'Kuch galat ho gaya');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🛡️</Text>
      <Text style={styles.title}>PhishGuard</Text>
      <Text style={styles.subtitle}>
        Email, SMS aur links ko scan karke phishing aur spam pehchaano.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onLogin} disabled={busy} activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Google se Sign in karo</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Scan')} style={styles.skip}>
        <Text style={styles.skipText}>Bina login ke SMS / URL scan karo</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Hum sirf read-only access lete hain. Aapki emails kabhi modify ya delete nahi hongi.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logo: { fontSize: 72, marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 32, fontWeight: '800' },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    minWidth: 260,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { marginTop: spacing.md, padding: spacing.sm },
  skipText: { color: colors.primary, fontSize: 14 },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
