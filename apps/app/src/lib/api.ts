import {
  Card,
  CardInsert,
  type InviteRole,
  InvitePreview,
  type SortKeyChange,
  Profile,
  Trip,
  TripInsert,
  TripInvite,
  TripMember,
  type TripRole,
} from '@plantodotdo/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { supabase } from './supabase';

/** Supabase returns errors rather than throwing; queries need them thrown. */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

// --- Trips -------------------------------------------------------------------

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: async () =>
      z
        .array(Trip)
        .parse(
          unwrap(
            await supabase.from('trips').select('*').order('created_at', { ascending: false }),
          ),
        ),
  });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: async () => {
      const row = unwrap(
        await supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      );
      // No row means it does not exist or this user is not a member.
      return row ? Trip.parse(row) : null;
    },
  });
}

export interface NewTrip {
  title: string;
  start_date: string | null;
  end_date: string | null;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTrip) => {
      const trip = TripInsert.parse({
        ...input,
        id: Crypto.randomUUID(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      unwrap(await supabase.from('trips').insert(trip));
      return trip;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// --- Cards -------------------------------------------------------------------

const cardsKey = (tripId: string) => ['trips', tripId, 'cards'] as const;

export function useCards(tripId: string) {
  return useQuery({
    queryKey: cardsKey(tripId),
    queryFn: async (): Promise<Card[]> => {
      const rows: unknown[] =
        unwrap(
          await supabase.from('cards').select('*').eq('trip_id', tripId).order('sort_key'),
        ) ?? [];
      // A card this version of the app cannot read (say, written by a newer
      // version) is skipped rather than breaking the whole plan.
      return rows.flatMap((row) => {
        const parsed = Card.safeParse(row);
        if (!parsed.success) console.warn('Skipping unreadable card', parsed.error.issues);
        return parsed.success ? [parsed.data] : [];
      });
    },
  });
}

export function useCreateCard(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (card: CardInsert) => {
      const row: Record<string, unknown> = CardInsert.parse(card);
      unwrap(await supabase.from('cards').insert(row));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(tripId) }),
  });
}

/** Columns a client may change on an existing card. */
const EDITABLE = [
  'kind',
  'title',
  'notes',
  'url',
  'place_id',
  'end_place_id',
  'start_date',
  'start_time',
  'start_tz',
  'end_date',
  'end_time',
  'end_tz',
  'status',
  'details',
] as const satisfies readonly (keyof CardInsert)[];

export function useUpdateCard(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ before, after }: { before: Card; after: CardInsert }) => {
      const next = CardInsert.parse(after);
      // Send only what changed, so two people editing different fields of the
      // same card do not overwrite each other.
      const patch: Record<string, unknown> = {};
      for (const column of EDITABLE) {
        if (JSON.stringify(next[column]) !== JSON.stringify(before[column])) {
          patch[column] = next[column];
        }
      }
      if (Object.keys(patch).length === 0) return;
      unwrap(await supabase.from('cards').update(patch).eq('id', before.id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(tripId) }),
  });
}

export function useDeleteCard(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cardId: string) => {
      unwrap(await supabase.from('cards').delete().eq('id', cardId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(tripId) }),
  });
}

/** Applies new sort keys. The list updates at once and is corrected if a write fails. */
export function useReorderCards(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: SortKeyChange[]) => {
      for (const change of changes) {
        unwrap(
          await supabase.from('cards').update({ sort_key: change.sort_key }).eq('id', change.id),
        );
      }
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: cardsKey(tripId) });
      const keys = new Map(changes.map((change) => [change.id, change.sort_key]));
      queryClient.setQueryData<Card[]>(cardsKey(tripId), (cards) =>
        cards?.map((card) =>
          keys.has(card.id) ? { ...card, sort_key: keys.get(card.id)! } : card,
        ),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cardsKey(tripId) }),
  });
}

// --- Members -----------------------------------------------------------------

export interface Member {
  user_id: string;
  role: TripRole;
  display_name: string;
}

export function useMembers(tripId: string) {
  return useQuery({
    queryKey: ['trips', tripId, 'members'],
    queryFn: async (): Promise<Member[]> => {
      const members = z
        .array(TripMember)
        .parse(
          unwrap(
            await supabase
              .from('trip_members')
              .select('*')
              .eq('trip_id', tripId)
              .order('created_at'),
          ),
        );
      const profiles = z.array(Profile).parse(
        unwrap(
          await supabase
            .from('profiles')
            .select('*')
            .in(
              'id',
              members.map((m) => m.user_id),
            ),
        ),
      );
      const names = new Map(profiles.map((p) => [p.id, p.display_name]));
      return members.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name: names.get(m.user_id) ?? 'Unknown',
      }));
    },
  });
}

export function useSetMemberRole(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: TripRole }) => {
      unwrap(
        await supabase
          .from('trip_members')
          .update({ role })
          .eq('trip_id', tripId)
          .eq('user_id', userId),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'members'] }),
  });
}

/** Removes a member. Used both by owners removing someone and by a member leaving. */
export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      unwrap(
        await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// --- Invites -----------------------------------------------------------------

/** Live invites for a trip. Only owners can see them; others get an empty list. */
export function useInvites(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['trips', tripId, 'invites'],
    enabled,
    queryFn: async () =>
      z.array(TripInvite).parse(
        unwrap(
          await supabase
            .from('trip_invites')
            .select('*')
            .eq('trip_id', tripId)
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false }),
        ),
      ),
  });
}

export function useCreateInvite(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: InviteRole) => {
      unwrap(await supabase.from('trip_invites').insert({ trip_id: tripId, role }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'invites'] }),
  });
}

export function useRevokeInvite(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      unwrap(
        await supabase
          .from('trip_invites')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', inviteId),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'invites'] }),
  });
}

/** What an invite offers, or null if the link is invalid, expired or revoked. */
export function useInvitePreview(token: string, userId: string | undefined) {
  return useQuery({
    // Keyed by user because `already_member` depends on who is asking.
    queryKey: ['invite', token, userId ?? null],
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('invite_preview', { invite_token: token }));
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row ? InvitePreview.parse(row) : null;
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) =>
      z.uuid().parse(unwrap(await supabase.rpc('accept_invite', { invite_token: token }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// --- Profile -----------------------------------------------------------------

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () =>
      Profile.parse(
        unwrap(await supabase.from('profiles').select('*').eq('id', userId).single()),
      ),
  });
}

export function useUpdateDisplayName(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string) => {
      unwrap(
        await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId),
      );
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
