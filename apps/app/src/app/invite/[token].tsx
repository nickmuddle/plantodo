import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Loading, Screen, Title } from '@/components/ui';
import { errorMessage, useAcceptInvite, useInvitePreview } from '@/lib/api';
import { rememberInvite } from '@/lib/pending-invite';
import { useSession } from '@/lib/session';

// Where an invite link lands. Works signed out (shows what the invite is for,
// then sends the person to sign in) and signed in (lets them join).
export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session } = useSession();
  const preview = useInvitePreview(token, session?.user.id);
  const accept = useAcceptInvite();

  if (preview.isPending) return <Loading />;

  if (preview.isError) {
    return (
      <Screen>
        <Body tone="danger">{errorMessage(preview.error)}</Body>
      </Screen>
    );
  }

  if (!preview.data) {
    return (
      <Screen>
        <Title>This invite isn’t valid</Title>
        <Body tone="muted">
          It may have expired or been turned off. Ask the person who sent it for a new link.
        </Body>
        <Button label="Continue" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const { trip_id, trip_title, inviter_name, role, already_member } = preview.data;
  const openTrip = () => router.replace(`/trips/${trip_id}`);

  const signIn = async () => {
    await rememberInvite(token);
    router.replace('/sign-in');
  };

  return (
    <Screen>
      <Title>{trip_title}</Title>
      <Body>
        {inviter_name ?? 'Someone'} invited you to {role === 'editor' ? 'plan' : 'view'} this trip.
      </Body>
      {accept.isError ? <Body tone="danger">{errorMessage(accept.error)}</Body> : null}
      {!session ? (
        <Button label="Sign in to join" onPress={signIn} />
      ) : already_member ? (
        <>
          <Body tone="muted">You’re already part of this trip.</Body>
          <Button label="Open trip" onPress={openTrip} />
        </>
      ) : (
        <Button
          label="Join trip"
          busy={accept.isPending}
          onPress={() => accept.mutate(token, { onSuccess: openTrip })}
        />
      )}
    </Screen>
  );
}
