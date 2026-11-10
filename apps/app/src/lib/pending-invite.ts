import AsyncStorage from '@react-native-async-storage/async-storage';

// Someone who opens an invite link while signed out has to sign in first, which
// can mean leaving the app to read an email. The token is kept here so they
// land back on the invite afterwards.
const KEY = 'pending-invite';

export async function rememberInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY, token);
}

/** Returns the remembered token, if any, and forgets it. */
export async function takePendingInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(KEY);
  if (token) await AsyncStorage.removeItem(KEY);
  return token;
}
