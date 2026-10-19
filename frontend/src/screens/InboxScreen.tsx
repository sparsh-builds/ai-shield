import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { fetchInbox } from '../gmail';
import { signOut } from '../auth';
import { colors, radius, spacing } from '../theme';
import { Email, RootStackParamList } from '../utils/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Inbox'>;

export default function InboxScreen({ navigation }: Props) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setEmails(await fetchInbox());
    } catch (e: any) {
      setError(e?.message ?? 'Emails load nahi ho paye');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (emails.length === 0) {
        load();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Scan')}>
            <Text style={styles.headerBtn}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Logout', 'Sign out karna hai?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    navigation.replace('Login');
                  },
                },
              ])
            }>
            <Text style={styles.headerBtn}>Logout</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => load()}>
          <Text style={styles.retryText}>Dobara try karo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={emails}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
      }
      ListEmptyComponent={<Text style={styles.empty}>Inbox khaali hai</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('EmailDetail', { email: item })}>
          <Text style={styles.from} numberOfLines={1}>
            {item.from}
          </Text>
          <Text style={styles.subject} numberOfLines={1}>
            {item.subject}
          </Text>
          <Text style={styles.snippet} numberOfLines={2}>
            {item.snippet}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  headerBtn: { color: '#fff', fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  from: { color: colors.textMuted, fontSize: 12 },
  subject: { color: colors.text, fontSize: 16, fontWeight: '700', marginVertical: 2 },
  snippet: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  errorText: { color: colors.phishing, textAlign: 'center', marginBottom: spacing.md },
  retry: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  retryText: { color: '#fff', fontWeight: '700' },
});
