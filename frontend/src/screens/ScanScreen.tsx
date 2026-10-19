import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { scanSms, scanUrl } from '../api';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../utils/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;
type Mode = 'SMS' | 'URL';

export default function ScanScreen({ navigation }: Props) {
  const [mode, setMode] = useState<Mode>('SMS');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const paste = async () => {
    const content = await Clipboard.getString();
    if (content) {
      setText(content);
    }
  };

  const onScan = async () => {
    const value = text.trim();
    if (!value) {
      Alert.alert('Khaali hai', mode === 'SMS' ? 'SMS paste karo.' : 'URL paste karo.');
      return;
    }

    setBusy(true);
    try {
      const result = mode === 'SMS' ? await scanSms(value) : await scanUrl(value);
      navigation.navigate('Result', { result, kind: mode, preview: value });
    } catch (e: any) {
      Alert.alert('Scan fail', e?.message ?? 'Kuch galat ho gaya');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
        <View style={styles.tabs}>
          {(['SMS', 'URL'] as Mode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.tab, mode === m && styles.tabActive]}
              onPress={() => {
                setMode(m);
                setText('');
              }}>
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[styles.input, mode === 'SMS' && { height: 160, textAlignVertical: 'top' }]}
          value={text}
          onChangeText={setText}
          placeholder={mode === 'SMS' ? 'Yahan SMS paste karo...' : 'https://example.com/...'}
          placeholderTextColor={colors.textMuted}
          multiline={mode === 'SMS'}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={mode === 'URL' ? 'url' : 'default'}
        />

        <View style={styles.row}>
          <TouchableOpacity style={styles.secondary} onPress={paste}>
            <Text style={styles.secondaryText}>📋 Paste</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setText('')}>
            <Text style={styles.secondaryText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.scanBtn} onPress={onScan} disabled={busy} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanText}>🔍 Scan karo</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tip: kisi bhi shak wale message ya link ko copy karke yahan paste karo. Link par click mat karo.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textMuted, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  secondary: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text },
  scanBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  scanText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.lg, lineHeight: 18 },
});
