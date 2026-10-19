import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import InboxScreen from './src/screens/InboxScreen';
import EmailDetailScreen from './src/screens/EmailDetailScreen';
import ResultScreen from './src/screens/ResultScreen';
import ScanScreen from './src/screens/ScanScreen';
import { configureGoogle, isSignedIn } from './src/auth';
import { colors } from './src/theme';
import { RootStackParamList } from './src/utils/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    configureGoogle();
    isSignedIn()
      .then(setLoggedIn)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={colors.header} />
      <Stack.Navigator
        initialRouteName={loggedIn ? 'Inbox' : 'Login'}
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Inbox" component={InboxScreen} options={{ title: 'Inbox' }} />
        <Stack.Screen name="EmailDetail" component={EmailDetailScreen} options={{ title: 'Email' }} />
        <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'Scan Result' }} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan SMS / URL' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
