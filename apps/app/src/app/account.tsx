import { DisplayName } from '@plantodo/domain';
import { useState } from 'react';

import { Body, Button, Card, Field, Loading, Screen } from '@/components/ui';
import { errorMessage, useProfile, useUpdateDisplayName } from '@/lib/api';
import { useSession, useUserId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Account() {
  const userId = useUserId();
  const { session } = useSession();
  const profile = useProfile(userId);
  const update = useUpdateDisplayName(userId);
  const [draft, setDraft] = useState<string | null>(null);

  if (profile.isPending) return <Loading />;

  const name = draft ?? profile.data?.display_name ?? '';
  const valid = DisplayName.safeParse(name).success;
  const changed = draft !== null && draft.trim() !== profile.data?.display_name;

  return (
    <Screen>
      <Card>
        <Body tone="muted">Signed in as {session?.user.email}</Body>
        <Field
          label="Your name"
          value={name}
          onChangeText={setDraft}
          hint="Shown to people you share a trip with."
          maxLength={80}
        />
        {update.isError ? <Body tone="danger">{errorMessage(update.error)}</Body> : null}
        {update.isSuccess && !changed ? <Body tone="muted">Saved.</Body> : null}
        <Button
          label="Save name"
          onPress={() => update.mutate(name.trim(), { onSuccess: () => setDraft(null) })}
          busy={update.isPending}
          disabled={!changed || !valid}
        />
      </Card>
      <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
