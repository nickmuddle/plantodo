import { useState } from 'react';

import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// Sign-in is passwordless: we email a six-digit code and the person types it in.
// The same flow creates the account the first time.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await action();
      if (failure) setError(failure.message);
      return !failure;
    } catch (thrown) {
      setError(errorMessage(thrown));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const address = email.trim().toLowerCase();
    if (await run(() => supabase.auth.signInWithOtp({ email: address }))) {
      setSentTo(address);
      setCode('');
    }
  };

  // On success the session changes and the app moves on by itself.
  const verify = () =>
    run(() => supabase.auth.verifyOtp({ email: sentTo!, token: code.trim(), type: 'email' }));

  if (sentTo) {
    return (
      <Screen>
        <Title>Check your email</Title>
        <Body>We sent a six-digit code to {sentTo}.</Body>
        <Field
          label="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          autoFocus
          onSubmitEditing={verify}
        />
        {error ? <Body tone="danger">{error}</Body> : null}
        <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
        <Button
          label="Use a different email"
          variant="secondary"
          onPress={() => {
            setSentTo(null);
            setError(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Plantodotdo</Title>
      <Body>Plan trips together. Enter your email and we’ll send you a code to sign in.</Body>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        onSubmitEditing={sendCode}
      />
      {error ? <Body tone="danger">{error}</Body> : null}
      <Button label="Send code" onPress={sendCode} busy={busy} disabled={!email.includes('@')} />
    </Screen>
  );
}
