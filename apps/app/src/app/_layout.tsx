import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import { Body, Loading, Screen, Title } from '@/components/ui';
import { SessionProvider, useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const scheme = useColorScheme();

  if (!isConfigured) {
    return (
      <Screen>
        <Title>Not configured</Title>
        <Body>
          This build has no Supabase settings. Copy apps/app/.env.example to .env.local, fill it
          in, and restart.
        </Body>
      </Screen>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Screens />
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function Screens() {
  const { session, loading } = useSession();
  const signedIn = Boolean(session);

  if (loading) return <Loading />;

  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'Trips' }} />
        <Stack.Screen name="trips/new" options={{ title: 'New trip' }} />
        <Stack.Screen name="trips/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      </Stack.Protected>
      <Stack.Screen name="invite/[token]" options={{ title: 'Invitation' }} />
    </Stack>
  );
}
