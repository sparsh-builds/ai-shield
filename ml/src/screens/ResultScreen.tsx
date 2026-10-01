import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {sendFeedback} from '../api';
import {RiskLevel, RootStackParamList} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const COLORS: Record<RiskLevel, {bg: string; fg: string}> = {
  HIGH: {bg: '#FDECEA', fg: '#B3261E'},
  MEDIUM: {bg: '#FFF4E5', fg: '#B26A00'},
  LOW: {bg: '#E6F4EA', fg: '#0B6B2E'},
};

export default function ResultScreen({route, navigation}: Props) {
  const {email, result} = route.params;
  const c = COLORS[result.riskLevel] ?? COLORS.MEDIUM;
  const [fb, setFb] = useState<'' | 'yes' | 'no'>('');

  const give = async (correct: boolean) => {
    setFb(correct ? 'yes' : 'no');
    try {
      await sendFeedback(email.id, correct);
    } catch {}
  };

  return (
    <ScrollView contentContainerStyle={{padding: 16}} style={{backgroundColor: '#fff'}}>
      {result.mock && (
        <Text style={s.mock}>DEMO MODE: placeholder rules, not the trained ML model yet.</Text>
      )}
      <View style={[s.card, {backgroundColor: c.bg}]}>
        <Text style={[s.level, {color: c.fg}]}>{result.riskLevel} RISK</Text>
        <Text style={[s.score, {color: c.fg}]}>{result.riskScore}/100</Text>
        <Text style={{color: c.fg, fontWeight: '600'}}>
          {result.category}  |  Scam probability {(result.scamProbability * 100).toFixed(0)}%
        </Text>
      </View>

      <Text style={s.h}>Why?</Text>
      {result.reasons.map(r => (
        <Text key={r} style={s.li}>• {r}</Text>
      ))}

      <Text style={s.h}>Recommended action</Text>
      <Text style={s.li}>{result.recommendedAction}</Text>

      <Text style={s.small}>Email: {email.subject}</Text>
      {result.modelVersion && <Text style={s.small}>Model: {result.modelVersion}</Text>}

      <Text style={s.h}>Was this result correct?</Text>
      {fb ? (
        <Text style={s.li}>Thanks for your feedback.</Text>
      ) : (
        <View style={{flexDirection: 'row', gap: 10}}>
          <Pressable style={s.fbBtn} onPress={() => give(true)}><Text style={s.fbText}>Yes</Text></Pressable>
          <Pressable style={s.fbBtn} onPress={() => give(false)}><Text style={s.fbText}>No</Text></Pressable>
        </View>
      )}

      <Pressable style={s.back} onPress={() => navigation.popToTop()}>
        <Text style={{color: '#1F3A6E', fontWeight: '700'}}>Back to inbox</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  mock: {backgroundColor: '#FFF8E1', color: '#8A6100', padding: 8, borderRadius: 6, marginBottom: 10, fontSize: 12},
  card: {padding: 20, borderRadius: 14, alignItems: 'center'},
  level: {fontSize: 22, fontWeight: '800'},
  score: {fontSize: 48, fontWeight: '900', marginVertical: 4},
  h: {marginTop: 20, fontWeight: '800', fontSize: 16, color: '#1F3A6E'},
  li: {marginTop: 6, color: '#222', lineHeight: 21},
  small: {marginTop: 10, color: '#777', fontSize: 12},
  fbBtn: {borderWidth: 1, borderColor: '#1F3A6E', paddingVertical: 8, paddingHorizontal: 22, borderRadius: 8, marginTop: 8},
  fbText: {color: '#1F3A6E', fontWeight: '700'},
  back: {marginTop: 26, alignItems: 'center', padding: 12},
});
