import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {signOut} from '../auth';
import {listInbox} from '../gmail';
import {EmailSummary, RootStackParamList} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Inbox'>;

export default function InboxScreen({navigation}: Props) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setEmails(await listInbox(20));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load inbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={async () => {
            await signOut();
            navigation.replace('Login');
          }}>
          <Text style={{color: '#1F3A6E', fontWeight: '600'}}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  if (loading) return <ActivityIndicator size="large" style={{marginTop: 40}} />;

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.err}>{error}</Text>
        <Pressable style={s.retry} onPress={() => load()}>
          <Text style={{color: '#fff', fontWeight: '700'}}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={emails}
      keyExtractor={e => e.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      ListEmptyComponent={<Text style={s.empty}>No emails found in your inbox.</Text>}
      renderItem={({item}) => (
        <Pressable style={s.row} onPress={() => navigation.navigate('EmailDetail', {id: item.id})}>
          <Text style={s.from} numberOfLines={1}>{item.from}</Text>
          <Text style={s.subject} numberOfLines={1}>{item.subject}</Text>
          <Text style={s.snippet} numberOfLines={2}>{item.snippet}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  err: {color: '#B3261E', textAlign: 'center'},
  retry: {marginTop: 14, backgroundColor: '#1F3A6E', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 8},
  empty: {textAlign: 'center', marginTop: 40, color: '#666'},
  row: {padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', backgroundColor: '#fff'},
  from: {fontWeight: '700', color: '#222'},
  subject: {marginTop: 2, color: '#1F3A6E', fontWeight: '600'},
  snippet: {marginTop: 2, color: '#666'},
});
