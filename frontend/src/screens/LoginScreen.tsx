import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {explainAuthError, restoreSession, signInWithGoogle} from '../auth';
import {RootStackParamList} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({navigation}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const u = await restoreSession();
      if (u) navigation.replace('Inbox');
      else setLoading(false);
    })();
  }, [navigation]);

  const onSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const u = await signInWithGoogle();
      if (u) navigation.replace('Inbox');
      else setLoading(false);
    } catch (e: any) {
      setError(explainAuthError(e));
      setLoading(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.logo}>🛡️</Text>
      <Text style={s.title}>AI Shield</Text>
      <Text style={s.sub}>
        Check if an email is phishing or a scam. We only request read-only access to your Gmail and
        analyze only the email you select.
      </Text>
      {loading ? (
        <ActivityIndicator size="large" style={{marginTop: 24}} />
      ) : (
        <Pressable style={s.btn} onPress={onSignIn}>
          <Text style={s.btnText}>Sign in with Google</Text>
        </Pressable>
      )}
      {!!error && <Text style={s.err}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#fff'},
  logo: {fontSize: 64},
  title: {fontSize: 30, fontWeight: '800', color: '#1F3A6E', marginTop: 8},
  sub: {textAlign: 'center', color: '#555', marginTop: 12, lineHeight: 21},
  btn: {marginTop: 28, backgroundColor: '#1F3A6E', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10},
  btnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  err: {color: '#B3261E', marginTop: 16, textAlign: 'center'},
});
