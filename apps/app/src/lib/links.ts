import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** The link someone shares to invite people to a trip. */
export function inviteUrl(token: string): string {
  const path = `/invite/${token}`;
  const base = process.env.EXPO_PUBLIC_APP_URL;
  if (base) return base.replace(/\/+$/, '') + path;
  if (Platform.OS === 'web') return window.location.origin + path;
  // Without a public web address, fall back to a link that opens the app itself.
  return Linking.createURL(path);
}
