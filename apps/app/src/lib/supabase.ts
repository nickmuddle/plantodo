import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** False when the app was built without its Supabase settings (see .env.example). */
export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient = createClient(
  url || 'http://localhost',
  key || 'missing',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Sign-in is by emailed code, so there is never a session in the URL.
      detectSessionInUrl: false,
    },
  },
);

// On phones, only keep the session fresh while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
