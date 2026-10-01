import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {configureGoogle} from './src/auth';
import {RootStackParamList} from './src/types';
import LoginScreen from './src/screens/LoginScreen';
import InboxScreen from './src/screens/InboxScreen';
import EmailDetailScreen from './src/screens/EmailDetailScreen';
import ResultScreen from './src/screens/ResultScreen';

configureGoogle();

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
        <Stack.Screen name="Inbox" component={InboxScreen} options={{title: 'Inbox', headerBackVisible: false}} />
        <Stack.Screen name="EmailDetail" component={EmailDetailScreen} options={{title: 'Email'}} />
        <Stack.Screen name="Result" component={ResultScreen} options={{title: 'Risk Result'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
