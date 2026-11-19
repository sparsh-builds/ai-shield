import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { ShieldBridge } = NativeModules;
const BACKEND_URL = 'https://ai-shield-backend-6o9v.onrender.com';

interface ThreatUrl {
  url: string;
  hostname: string;
  riskScore: number;
  threatLevel: string;
  indicators: string[];
}

interface AuditResult {
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  mlProbability: number;
  reasons: string[];
  sortedThreatUrls: ThreatUrl[];
  modelVersion?: string;
}

const PRESETS = [
  {
    label: 'Phishing Demo',
    mode: 'email' as const,
    sender: 'HDFC Security <alert@hdfc-update.xyz>',
    subject: 'Urgent: Account Suspended - KYC Required',
    text: 'Immediate action required. Your account is blocked. Verify PAN via http://192.168.1.1/login',
  },
  {
    label: 'Smishing Demo',
    mode: 'sms' as const,
    sender: '',
    subject: '',
    text: 'Dear Customer, your KYC has expired! Update immediately at bit.ly/kyc-verify or SIM will be blocked.',
  },
  {
    label: 'Safe Notice',
    mode: 'email' as const,
    sender: 'IIT Bombay Techfest <team@techfest.org>',
    subject: 'Weekend Workshop Schedule',
    text: 'Quick update from the Techfest team; we have uploaded the weekend workshop schedule on ca.techfest.org.',
  },
];

export default function App() {
  const [bubbleActive, setBubbleActive] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const [scanMode, setScanMode] = useState<'email' | 'sms'>('email');
  const [sender, setSender] = useState(PRESETS[0].sender);
  const [subject, setSubject] = useState(PRESETS[0].subject);
  const [bodyText, setBodyText] = useState(PRESETS[0].text);
  const [result, setResult] = useState<AuditResult | null>(null);

  useEffect(() => {
    checkServerHealth();
    runAudit(PRESETS[0].mode, PRESETS[0].sender, PRESETS[0].subject, PRESETS[0].text);
  }, []);

  const checkServerHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      setServerOnline(res.ok);
    } catch {
      setServerOnline(false);
    }
  };

  const toggleFloatingBubble = async () => {
    if (!ShieldBridge) {
      Alert.alert('Native Bridge Error', 'ShieldBridge native module is not linked.');
      return;
    }

    if (bubbleActive) {
      ShieldBridge.stopFloatingBubble();
      setBubbleActive(false);
      return;
    }

    const hasPermission = await ShieldBridge.checkOverlayPermission();
    if (!hasPermission) {
      Alert.alert(
        'Overlay Permission Required',
        'Enable "Display over other apps" for AI Shield, then tap Enable Bubble again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => ShieldBridge.requestOverlayPermission() },
        ]
      );
      return;
    }

    ShieldBridge.startFloatingBubble();
    setBubbleActive(true);
  };

  const openAccessibility = () => {
    if (!ShieldBridge) return;
    Alert.alert(
      'Enable Screen Reader Service',
      'Go to Downloaded Apps -> AI Shield -> Turn ON Accessibility Service to allow live Gmail & SMS scanning.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Accessibility', onPress: () => ShieldBridge.openAccessibilitySettings() },
      ]
    );
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setScanMode(preset.mode);
    setSender(preset.sender);
    setSubject(preset.subject);
    setBodyText(preset.text);
    runAudit(preset.mode, preset.sender, preset.subject, preset.text);
  };

  const runAudit = async (
    mode: 'email' | 'sms' = scanMode,
    customSender: string = sender,
    customSubject: string = subject,
    customBody: string = bodyText
  ) => {
    if (!customBody.trim()) {
      Alert.alert('Empty Input', 'Enter email or SMS content to analyze.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'email' ? `${BACKEND_URL}/predict/email` : `${BACKEND_URL}/predict/sms`;
      const payload =
        mode === 'email'
          ? { id: 'manual_audit', sender: customSender, subject: customSubject, body: customBody }
          : { id: 'manual_sms', text: customBody };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AuditResult = await response.json();
      setResult(data);
      setServerOnline(true);
    } catch (err: any) {
      Alert.alert('Engine Connection Error', err?.message || 'Unable to reach AI Shield ML Engine.');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#FF2A6D';
    if (score >= 35) return '#FFB800';
    return '#00F5A0';
  };

  const scoreColor = result ? getScoreColor(result.riskScore) : '#05D9E8';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0E17" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>AI SHIELD</Text>
            <Text style={styles.brandSub}>Real-Time Phishing & Smishing Defense</Text>
          </View>
          <View style={styles.statusGroup}>
            <View style={[styles.badge, { borderColor: serverOnline ? '#00F5A0' : '#FFB800' }]}>
              <Text style={[styles.badgeText, { color: serverOnline ? '#00F5A0' : '#FFB800' }]}>
                {serverOnline ? 'ML ONLINE' : 'WAKING'}
              </Text>
            </View>
            {bubbleActive && (
              <View style={[styles.badge, { borderColor: '#05D9E8', marginTop: 4 }]}>
                <Text style={[styles.badgeText, { color: '#05D9E8' }]}>BUBBLE ON</Text>
              </View>
            )}
          </View>
        </View>

        {/* Live Overlay Control Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ON-SCREEN OVERLAY SCANNER</Text>
          <Text style={styles.helperText}>
            Activate the floating scanner bubble to audit Gmail & SMS threads directly on-screen without copy-pasting.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: bubbleActive ? '#FF2A6D' : '#05D9E8' }]}
            onPress={toggleFloatingBubble}
          >
            <Text style={[styles.primaryBtnText, { color: bubbleActive ? '#FFFFFF' : '#0A0E17' }]}>
              {bubbleActive ? 'DISABLE FLOATING BUBBLE' : 'ENABLE FLOATING BUBBLE'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={openAccessibility}>
            <Text style={styles.secondaryBtnText}>CONFIGURE ACCESSIBILITY SERVICE</Text>
          </TouchableOpacity>
        </View>

        {/* Risk Meter */}
        <View style={styles.gaugeCard}>
          <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
            {loading ? (
              <ActivityIndicator size="large" color="#05D9E8" />
            ) : (
              <>
                <Text style={[styles.scoreNumber, { color: scoreColor }]}>
                  {result ? result.riskScore : '--'}
                </Text>
                <Text style={styles.scoreMax}>/ 100</Text>
                <Text style={[styles.riskTier, { color: scoreColor }]}>
                  {result ? result.category : 'READY'}
                </Text>
              </>
            )}
          </View>

          {result && (
            <Text style={styles.metaLine}>
              ML Confidence: {(result.mlProbability * 100).toFixed(1)}% • Engine: {result.modelVersion || 'v3.0'}
            </Text>
          )}
        </View>

        {/* Reasons & Threat Breakdown */}
        {result && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>THREAT INTELLIGENCE REPORT</Text>
            {result.reasons.map((reason, idx) => (
              <View key={idx} style={styles.reasonRow}>
                <Text style={[styles.bullet, { color: scoreColor }]}>◆</Text>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}

            {result.sortedThreatUrls && result.sortedThreatUrls.length > 0 && (
              <View style={styles.urlBox}>
                <Text style={styles.urlHeader}>EXTRACTED URL ANALYSIS ({result.sortedThreatUrls.length})</Text>
                {result.sortedThreatUrls.map((u, idx) => (
                  <View key={idx} style={styles.urlItem}>
                    <Text style={styles.urlText} numberOfLines={1}>
                      {u.url}
                    </Text>
                    <Text style={[styles.urlBadge, { color: getScoreColor(u.riskScore) }]}>
                      {u.threatLevel} ({u.riskScore}/100)
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Interactive Demo Sandbox */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>INTERACTIVE SANDBOX & PRESETS</Text>

          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p.label} style={styles.presetChip} onPress={() => applyPreset(p)}>
                <Text style={styles.presetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, scanMode === 'email' && styles.modeBtnActive]}
              onPress={() => setScanMode('email')}
            >
              <Text style={[styles.modeText, scanMode === 'email' && styles.modeTextActive]}>EMAIL MODE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, scanMode === 'sms' && styles.modeBtnActive]}
              onPress={() => setScanMode('sms')}
            >
              <Text style={[styles.modeText, scanMode === 'sms' && styles.modeTextActive]}>SMS MODE</Text>
            </TouchableOpacity>
          </View>

          {scanMode === 'email' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Sender (e.g. alert@hdfc-update.xyz)"
                placeholderTextColor="#64748B"
                value={sender}
                onChangeText={setSender}
              />
              <TextInput
                style={styles.input}
                placeholder="Subject"
                placeholderTextColor="#64748B"
                value={subject}
                onChangeText={setSubject}
              />
            </>
          )}

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Paste suspicious email or SMS body here..."
            placeholderTextColor="#64748B"
            multiline
            value={bodyText}
            onChangeText={setBodyText}
          />

          <TouchableOpacity style={styles.auditBtn} onPress={() => runAudit()}>
            <Text style={styles.auditBtnText}>RUN DEEP THREAT AUDIT</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  scrollContent: { padding: 18, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  brandTitle: { fontSize: 24, fontWeight: '800', color: '#05D9E8', letterSpacing: 1.5 },
  brandSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  statusGroup: { alignItems: 'flex-end' },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#111827',
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#05D9E8',
    letterSpacing: 1,
    marginBottom: 8,
  },
  helperText: { fontSize: 13, color: '#CBD5E1', lineHeight: 19, marginBottom: 14 },
  primaryBtn: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  secondaryBtn: {
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  gaugeCard: { alignItems: 'center', marginVertical: 10 },
  scoreRing: {
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  scoreNumber: { fontSize: 48, fontWeight: '900' },
  scoreMax: { fontSize: 13, color: '#64748B', marginTop: -4 },
  riskTier: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, marginTop: 4 },
  metaLine: { fontSize: 11, color: '#94A3B8', marginTop: 10 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet: { fontSize: 12, marginRight: 8, marginTop: 2 },
  reasonText: { flex: 1, fontSize: 13, color: '#F1F5F9', lineHeight: 19 },
  urlBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  urlHeader: { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 6 },
  urlItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0A0E17',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  urlText: { flex: 1, fontSize: 12, color: '#CBD5E1', marginRight: 8 },
  urlBadge: { fontSize: 11, fontWeight: '700' },
  presetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  presetChip: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  presetText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  modeRow: { flexDirection: 'row', marginBottom: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#1E293B',
  },
  modeBtnActive: { borderBottomColor: '#05D9E8' },
  modeText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  modeTextActive: { color: '#05D9E8' },
  input: {
    backgroundColor: '#0A0E17',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 10,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  auditBtn: {
    borderWidth: 1,
    borderColor: '#05D9E8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  auditBtnText: { color: '#05D9E8', fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
});