import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {WEB_CLIENT_ID} from './config';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export type AppUser = {email: string; name?: string | null; photo?: string | null};

export function configureGoogle() {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    scopes: [GMAIL_SCOPE], // read-only Gmail access
  });
}

// The response shape differs between library versions, so handle both.
function toUser(res: any): AppUser | null {
  if (!res || res.type === 'cancelled' || res.type === 'noSavedCredentialFound') {
    return null;
  }
  const u = res.data?.user ?? res.user;
  if (!u?.email) return null;
  return {email: u.email, name: u.name, photo: u.photo};
}

export async function signInWithGoogle(): Promise<AppUser | null> {
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const res: any = await GoogleSignin.signIn();
  return toUser(res);
}

export async function restoreSession(): Promise<AppUser | null> {
  try {
    const res: any = await GoogleSignin.signInSilently();
    return toUser(res);
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string> {
  const {accessToken} = await GoogleSignin.getTokens();
  return accessToken;
}

export async function clearAccessToken(token: string) {
  try {
    await GoogleSignin.clearCachedAccessToken(token);
  } catch {}
}

export async function signOut() {
  try {
    await GoogleSignin.signOut();
  } catch {}
}

export function explainAuthError(e: any): string {
  switch (e?.code) {
    case statusCodes.SIGN_IN_CANCELLED:
      return 'Sign-in cancelled.';
    case statusCodes.IN_PROGRESS:
      return 'Sign-in already in progress.';
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play Services not available. Use an emulator/phone with Google Play.';
    case '10':
    case 'DEVELOPER_ERROR':
      return 'DEVELOPER_ERROR: check package name, SHA-1 and Web Client ID in Google Cloud.';
    default:
      return e?.message ?? 'Sign-in failed.';
  }
}
