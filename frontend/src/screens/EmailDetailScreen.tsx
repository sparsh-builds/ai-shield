import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {analyzeEmail} from '../api';
import {getEmail} from '../gmail';
import {EmailFull, RootStackParamList} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailDetail'>;

export default function EmailDetailScreen({route, navigation}: Props) {
  const [email, setEmail] = useState<EmailFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getEmail(route.params.id)
      .then(setEmail)
      .catch(e => setError(e?.message ?? 'Could not load email.'))
      .finally(() => setLoading(false));
  }, [route.params.id]);

  const onAnalyze = async () => {
    if (!email) return;
    setAnalyzing(true);
    try {
      const result = await analyzeEmail(email);
      navigation.navigate('Result', {email, result});
    } catch (e: any) {
      Alert.alert('Analysis failed', e?.message ?? 'Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={{marginTop: 40}} />;
  if (error || !email) return <Text style={s.err}>{error || 'Email not found.'}</Text>;

  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}>
      <ScrollView contentContainerStyle={{padding: 16}}>
        <Text style={s.subject}>{email.subject}</Text>
        <Text style={s.meta}>From: {email.from}</Text>
        <Text style={s.meta}>{email.date}</Text>
        <Text style={s.body}>
          {email.body.length > 3000 ? email.body.slice(0, 3000) + '\n… (preview truncated)' : email.body || '(empty body)'}
        </Text>
        <Text style={s.h}>Links found ({email.urls.length})</Text>
        {email.urls.length === 0 && <Text style={s.meta}>No links in this email.</Text>}
        {email.urls.slice(0, 15).map(u => (
          <Text key={u} style={s.url} numberOfLines={2}>• {u}</Text>
        ))}
      </ScrollView>
      <Pressable style={[s.btn, analyzing && {opacity: 0.6}]} disabled={analyzing} onPress={onAnalyze}>
        {analyzing ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Analyze with AI Shield</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  err: {color: '#B3261E', padding: 20, textAlign: 'center'},
  subject: {fontSize: 20, fontWeight: '800', color: '#1F3A6E'},
  meta: {color: '#666', marginTop: 4},
  body: {marginTop: 14, color: '#222', lineHeight: 21},
  h: {marginTop: 18, fontWeight: '700', color: '#333'},
  url: {color: '#B3261E', marginTop: 4},
  btn: {backgroundColor: '#1F3A6E', margin: 14, padding: 15, borderRadius: 10, alignItems: 'center'},
  btnText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
