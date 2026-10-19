import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, verdictColor, verdictLabel } from '../theme';
import { playPhishingAlert, playSafeTone } from '../utils/sound';
import { RootStackParamList } from '../utils/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const ICONS: Record<string, string> = {
  safe: '✅',
  suspicious: '⚠️',
  spam: '🚫',
  phishing: '🚨',
};

export default function ResultScreen({ route, navigation }: Props) {
  const { result, kind, preview } = route.params;
  const color = verdictColor(result.verdict);
  const percent = Math.round(result.confidence * 100);

  useEffect(() => {
    if (result.verdict === 'phishing' || result.verdict === 'spam') {
      playPhishingAlert();
    } else if (result.verdict === 'safe') {
      playSafeTone();
    }
  }, [result.verdict]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.badge, { borderColor: color }]}>
        <Text style={styles.icon}>{ICONS[result.verdict] ?? '❔'}</Text>
        <Text style={[styles.verdict, { color }]}>{verdictLabel(result.verdict)}</Text>
        <Text style={styles.kind}>{kind} scan</Text>
      </View>

      <Text style={styles.label}>Confidence</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.percent}>{percent}%</Text>

      <Text style={styles.label}>Scanned content</Text>
      <View style={styles.card}>
        <Text style={styles.preview} numberOfLines={4}>
          {preview}
        </Text>
      </View>

      <Text style={styles.label}>Kyun?</Text>
      <View style={styles.card}>
        {result.reasons.length === 0 ? (
          <Text style={styles.reason}>Koi khaas wajah nahi mili.</Text>
        ) : (
          result.reasons.map((r, i) => (
            <Text key={i} style={styles.reason}>
              •  {r}
            </Text>
          ))
        )}
      </View>

      {result.verdict !== 'safe' && (
        <View style={[styles.warning, { borderColor: color }]}>
          <Text style={styles.warningText}>
            Links par click na karo, personal info, OTP ya password share na karo.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
        <Text style={styles.btnText}>Wapas jao</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  badge: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 56 },
  verdict: { fontSize: 32, fontWeight: '900', marginTop: spacing.sm },
  kind: { color: colors.textMuted, marginTop: 4 },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  barBg: { height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  percent: { color: colors.text, fontWeight: '700', marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preview: { color: colors.text, fontSize: 14, lineHeight: 20 },
  reason: { color: colors.text, fontSize: 14, lineHeight: 22 },
  warning: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: '#2A1215',
  },
  warningText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
