import { z } from 'zod';
import { Id, Timestamp } from './primitives';

/** Invites never grant ownership; an owner promotes a member afterwards. */
export const INVITE_ROLES = ['editor', 'viewer'] as const;
export const InviteRole = z.enum(INVITE_ROLES);
export type InviteRole = z.infer<typeof InviteRole>;

export const InviteToken = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * A shareable link into a trip. Anyone holding the token can join with `role`
 * until the invite expires or is revoked.
 */
export const TripInvite = z.object({
  id: Id,
  trip_id: Id,
  token: InviteToken,
  role: InviteRole,
  created_by: Id,
  created_at: Timestamp,
  expires_at: Timestamp,
  revoked_at: Timestamp.nullable(),
});
export type TripInvite = z.infer<typeof TripInvite>;

/** What `invite_preview` returns for a live token. */
export const InvitePreview = z.object({
  trip_id: Id,
  trip_title: z.string(),
  inviter_name: z.string().nullable(),
  role: InviteRole,
  already_member: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export function isInviteLive(
  invite: Pick<TripInvite, 'expires_at' | 'revoked_at'>,
  now: Date = new Date(),
): boolean {
  return invite.revoked_at === null && new Date(invite.expires_at) > now;
}
