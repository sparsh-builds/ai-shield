import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  NativeModules,
  Alert,
} from 'react-native';
import { scanEmail, SecurityAnalysisResult } from './src/api';

const { ShieldBridge } = NativeModules;

export default function App() {
  const [loading, setLoading] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<SecurityAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bubbleActive, setBubbleActive] = useState<boolean>(false);

  const runAudit = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await scanEmail({
        id: 'msg_001',
        subject: 'Security Alert: Account Access Restricted',
        sender: 'HDFC Security Desk <alert@hdfc-update.xyz>',
        body: 'Immediate action required. Please unlock your portal via: http://192.168.1.1/login',
        urls: [],
      });
      setAnalysis(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Engine connection failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  const handleToggleBubble = async () => {
    if (!ShieldBridge) {
      Alert.alert('Module Missing', 'ShieldBridge native module link nahi hua hai.');
      return;
    }

    try {
      const hasOverlay = await ShieldBridge.checkOverlayPermission();
      if (!hasOverlay) {
        Alert.alert(
          'Permission Chahiye',
          'Screen par bubble dikhane ke liye "Display over other apps" permission allow karein.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => ShieldBridge.requestOverlayPermission() },
          ]
        );
        return;
      }

      if (!bubbleActive) {
        ShieldBridge.startFloatingBubble();
        setBubbleActive(true);
        Alert.alert('AI Shield Active', 'Floating bubble chalu ho gaya hai. Ab Gmail ya SMS me jakar bubble tap karein.');
      } else {
        ShieldBridge.stopFloatingBubble();
        setBubbleActive(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Bubble switch karne me issue aaya');
    }
  };

  const handleOpenAccessibility = () => {
    if (ShieldBridge) {
      ShieldBridge.openAccessibilitySettings();
    } else {
      Alert.alert('Error', 'ShieldBridge module not found');
    }
  };

  const getThreatColor = (level?: string): string => {
    if (level === 'HIGH') return '#FF2A6D';
    if (level === 'MEDIUM') return '#FFB800';
    return '#05D9E8';
  };

  const threatColor = getThreatColor(analysis?.riskLevel);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0D14" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Navbar */}
        <View style={styles.navBar}>
          <Text style={styles.brandTitle}>AI SHIELD</Text>
          <Text style={[styles.statusBadge, { 
            backgroundColor: bubbleActive ? '#103B2B' : '#102528',
            color: bubbleActive ? '#00F5D4' : '#05D9E8' 
          }]}>
            {bubbleActive ? 'BUBBLE ON' : 'ACTIVE GUARD'}
          </Text>
        </View>

        {/* Floating Scanner Control Panel */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ON-SCREEN AUTOMATIC SCANNER</Text>
          <Text style={styles.cardDesc}>
            Bina copy-paste kiye screen par hi scan chalane ke liye permissions enable karein aur bubble switch karein.
          </Text>

          <TouchableOpacity
            style={[styles.btn, bubbleActive ? styles.btnDanger : styles.btnPrimary]}
            onPress={handleToggleBubble}
          >
            <Text style={styles.btnText}>
              {bubbleActive ? 'DISABLE FLOATING BUBBLE' : 'ENABLE FLOATING BUBBLE'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
            onPress={handleOpenAccessibility}
          >
            <Text style={styles.btnTextSecondary}>ENABLE ACCESSIBILITY SERVICE</Text>
          </TouchableOpacity>
        </View>

        {/* Risk Meter Visualizer */}
        <View style={[styles.shieldOuter, { borderColor: threatColor, marginTop: 25 }]}>
          <View style={styles.shieldInner}>
            {loading ? (
              <ActivityIndicator size="large" color={threatColor} />
            ) : (
              <>
                <Text style={[styles.riskFigure, { color: threatColor }]}>
                  {analysis ? analysis.riskScore : '--'}
                </Text>
                <Text style={styles.riskDenominator}>/ 100</Text>
                <Text style={[styles.riskLevelTag, { color: threatColor }]}>
                  {analysis?.riskLevel || 'STANDBY'}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Manual Test Scan Trigger */}
        <TouchableOpacity
          style={[styles.actionTrigger, { borderColor: threatColor }]}
          onPress={runAudit}
          disabled={loading}
        >
          <Text style={styles.triggerText}>
            {loading ? 'ANALYZING...' : 'RUN MANUAL TEST AUDIT'}
          </Text>
        </TouchableOpacity>

        {errorMessage ? (
          <View style={styles.alertBanner}>
            <Text style={styles.alertMessage}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Results Details */}
        {analysis ? (
          <View style={styles.telemetryCard}>
            <Text style={styles.sectionHeading}>FLAGGED INDICATORS & REASONS</Text>
            {analysis.reasons.map((item, index) => (
              <View key={`reason-${index}`} style={styles.indicatorRow}>
                <Text style={styles.indicatorBullet}>✦</Text>
                <Text style={styles.indicatorText}>{item}</Text>
              </View>
            ))}

            {analysis.sortedThreatUrls && analysis.sortedThreatUrls.length > 0 ? (
              <>
                <Text style={[styles.sectionHeading, { marginTop: 18 }]}>ISOLATED TARGET URLS</Text>
                {analysis.sortedThreatUrls.map((threat, idx) => (
                  <View key={`url-${idx}`} style={styles.urlCard}>
                    <Text style={styles.urlAddress}>{threat.url}</Text>
                    <Text style={styles.urlRiskRating}>Level: {threat.threatLevel}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0D14' },
  container: { padding: 18, alignItems: 'center' },
  navBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandTitle: { fontSize: 22, fontWeight: '900', color: '#05D9E8', letterSpacing: 2 },
  statusBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  card: { width: '100%', backgroundColor: '#141724', borderRadius: 10, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#05D9E8', letterSpacing: 1, marginBottom: 6 },
  cardDesc: { fontSize: 11, color: '#A0A5BA', lineHeight: 16, marginBottom: 14 },
  btn: { width: '100%', paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#05D9E8' },
  btnDanger: { backgroundColor: '#FF2A6D' },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#6A6F84' },
  btnText: { color: '#0B0D14', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  btnTextSecondary: { color: '#D4D7E5', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  shieldOuter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  shieldInner: {
    width: 146,
    height: 146,
    borderRadius: 73,
    backgroundColor: '#10131E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskFigure: { fontSize: 48, fontWeight: '900' },
  riskDenominator: { fontSize: 11, color: '#6A6F84', marginTop: -6 },
  riskLevelTag: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  actionTrigger: {
    width: '100%',
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 8,
    backgroundColor: '#141724',
    alignItems: 'center',
    marginBottom: 16,
  },
  triggerText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1.2, fontSize: 11 },
  alertBanner: {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#2B121C',
    marginBottom: 15,
  },
  alertMessage: { color: '#FF2A6D', fontSize: 12, textAlign: 'center' },
  telemetryCard: { width: '100%', backgroundColor: '#141724', borderRadius: 10, padding: 16 },
  sectionHeading: { fontSize: 11, fontWeight: '800', color: '#6A6F84', letterSpacing: 1, marginBottom: 12 },
  indicatorRow: { flexDirection: 'row', marginBottom: 8 },
  indicatorBullet: { color: '#FF2A6D', marginRight: 8, fontSize: 12 },
  indicatorText: { flex: 1, color: '#D4D7E5', fontSize: 12, lineHeight: 17 },
  urlCard: {
    backgroundColor: '#1C2032',
    padding: 10,
    borderRadius: 6,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB800',
  },
  urlAddress: { color: '#05D9E8', fontSize: 11 },
  urlRiskRating: { color: '#FFB800', fontSize: 10, fontWeight: '700', marginTop: 4 },
});