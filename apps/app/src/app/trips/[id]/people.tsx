import type { TripInvite } from '@plantodotdo/domain';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Share } from 'react-native';

import { Body, Button, Card, Heading, Loading, Row, Screen } from '@/components/ui';
import {
  errorMessage,
  type Member,
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useSetMemberRole,
} from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatExpiry, roleLabel } from '@/lib/format';
import { inviteUrl } from '@/lib/links';
import { useUserId } from '@/lib/session';

export default function People() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const members = useMembers(id);

  if (members.isPending) return <Loading />;

  if (members.isError) {
    return (
      <Screen>
        <Body tone="danger">{errorMessage(members.error)}</Body>
      </Screen>
    );
  }

  const isOwner = members.data.some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <Screen>
      <Members tripId={id} members={members.data} userId={userId} isOwner={isOwner} />
      {isOwner ? <Invites tripId={id} /> : null}
    </Screen>
  );
}

function Members(props: { tripId: string; members: Member[]; userId: string; isOwner: boolean }) {
  const { tripId, members, userId, isOwner } = props;
  const router = useRouter();
  const setRole = useSetMemberRole(tripId);
  const remove = useRemoveMember(tripId);
  const error = setRole.error ?? remove.error;

  const removeMember = async (member: Member) => {
    const leaving = member.user_id === userId;
    const ok = await confirm(
      leaving ? 'Leave this trip?' : `Remove ${member.display_name}?`,
      leaving
        ? 'You will need a new invite to come back.'
        : 'They will lose access to this trip.',
      leaving ? 'Leave' : 'Remove',
    );
    if (!ok) return;
    try {
      // Awaited rather than passed as a callback: once you have left, this
      // screen loses access to the trip and its callbacks would never run.
      await remove.mutateAsync(member.user_id);
      if (leaving) router.replace('/');
    } catch {
      // Shown below through `remove.error`.
    }
  };

  return (
    <Card>
      <Heading>People</Heading>
      {members.map((member) => {
        const isMe = member.user_id === userId;
        const manageable = isOwner && !isMe && member.role !== 'owner';
        return (
          <Row key={member.user_id} style={{ justifyContent: 'space-between' }}>
            <Body style={{ flexShrink: 1 }}>
              {member.display_name}
              {isMe ? ' (you)' : ''}
              <Body tone="muted"> · {roleLabel[member.role]}</Body>
            </Body>
            <Row>
              {manageable ? (
                <Button
                  compact
                  variant="secondary"
                  label={member.role === 'editor' ? 'Make viewer' : 'Make editor'}
                  onPress={() =>
                    setRole.mutate({
                      userId: member.user_id,
                      role: member.role === 'editor' ? 'viewer' : 'editor',
                    })
                  }
                />
              ) : null}
              {manageable ? (
                <Button compact variant="danger" label="Remove" onPress={() => removeMember(member)} />
              ) : null}
              {isMe && !isOwner ? (
                <Button compact variant="danger" label="Leave" onPress={() => removeMember(member)} />
              ) : null}
            </Row>
          </Row>
        );
      })}
      {error ? <Body tone="danger">{errorMessage(error)}</Body> : null}
    </Card>
  );
}

function Invites({ tripId }: { tripId: string }) {
  const invites = useInvites(tripId, true);
  const create = useCreateInvite(tripId);
  const revoke = useRevokeInvite(tripId);
  const error = invites.error ?? create.error ?? revoke.error;

  return (
    <Card>
      <Heading>Invite links</Heading>
      <Body tone="muted">
        Anyone with a link can join until it expires or you turn it off.
      </Body>
      <Row>
        <Button
          compact
          label="New edit link"
          onPress={() => create.mutate('editor')}
          busy={create.isPending && create.variables === 'editor'}
        />
        <Button
          compact
          variant="secondary"
          label="New view-only link"
          onPress={() => create.mutate('viewer')}
          busy={create.isPending && create.variables === 'viewer'}
        />
      </Row>
      {invites.data?.map((invite) => (
        <InviteRow key={invite.id} invite={invite} onRevoke={() => revoke.mutate(invite.id)} />
      ))}
      {error ? <Body tone="danger">{errorMessage(error)}</Body> : null}
    </Card>
  );
}

function InviteRow({ invite, onRevoke }: { invite: TripInvite; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(invite.token);

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async () => {
    if (await confirm('Turn off this link?', 'People who have not joined yet will not be able to use it.', 'Turn off')) {
      onRevoke();
    }
  };

  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Body style={{ flexShrink: 1 }}>
        {roleLabel[invite.role]}
        <Body tone="muted"> · {formatExpiry(invite.expires_at)}</Body>
      </Body>
      <Row>
        <Button compact variant="secondary" label={copied ? 'Copied' : 'Copy link'} onPress={copy} />
        {Platform.OS !== 'web' ? (
          <Button compact variant="secondary" label="Share" onPress={() => Share.share({ message: url })} />
        ) : null}
        <Button compact variant="danger" label="Turn off" onPress={revoke} />
      </Row>
    </Row>
  );
}
