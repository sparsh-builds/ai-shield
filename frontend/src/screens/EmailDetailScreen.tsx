import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { scanEmail } from '../api';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../utils/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailDetail'>;

export default function EmailDetailScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [scanning, setScanning] = useState(false);

  const onScan = async () => {
    setScanning(true);
    try {
      const result = await scanEmail(email.from, email.subject, email.body || email.snippet);
      navigation.navigate('Result', {
        result,
        kind: 'Email',
        preview: email.subject,
      });
    } catch (e: any) {
      Alert.alert('Scan fail', e?.message ?? 'Kuch galat ho gaya');
    } finally {
      setScanning(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.subject}>{email.subject}</Text>
        <Text style={styles.meta}>From: {email.from}</Text>
        {!!email.date && <Text style={styles.meta}>{email.date}</Text>}
        <View style={styles.divider} />
        <Text style={styles.body} selectable>
          {email.body || email.snippet}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.scanBtn} onPress={onScan} disabled={scanning} activeOpacity={0.85}>
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.scanText}>🔍 Is email ko scan karo</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  subject: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: spacing.sm },
  meta: { color: colors.textMuted, fontSize: 13, marginBottom: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.header,
  },
  scanBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  scanText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
