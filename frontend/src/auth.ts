import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GMAIL_SCOPE, GOOGLE_WEB_CLIENT_ID } from './config';

export function configureGoogle() {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: [GMAIL_SCOPE],
    offlineAccess: false,
  });
}

export async function isSignedIn(): Promise<boolean> {
  try {
    return await GoogleSignin.isSignedIn();
  } catch {
    return false;
  }
}

export async function signIn(): Promise<void> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('Sign-in cancel ho gaya.');
    }
    if (e?.code === statusCodes.IN_PROGRESS) {
      throw new Error('Sign-in pehle se chal raha hai.');
    }
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services available nahi hai.');
    }
    throw new Error(e?.message ?? 'Sign-in fail ho gaya.');
  }
}

export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}

export async function getAccessToken(): Promise<string> {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

export async function getUserEmail(): Promise<string | null> {
  try {
    const user = await GoogleSignin.getCurrentUser();
    return user?.user.email ?? null;
  } catch {
    return null;
  }
}
