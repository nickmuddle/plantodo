import {
  buildImportCards,
  Card,
  CardInsert,
  type ImportDraftItem,
  type InviteRole,
  InvitePreview,
  Place,
  placeQueryKey,
  planPlaceLookups,
  Profile,
  readImportDraft,
  type SkippedImportItem,
  type SortKeyChange,
  Trip,
  TripInsert,
  TripInvite,
  TripMember,
  type TripRole,
} from '@plantodo/domain';
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

// --- Places ------------------------------------------------------------------

const placesKey = (tripId: string) => ['trips', tripId, 'places'] as const;

// Everything except the derived `location` column, which only the database uses.
const PLACE_COLUMNS =
  'id, trip_id, name, lat, lng, address, timezone, provider, provider_place_id, created_by, created_at, updated_at';

export function usePlaces(tripId: string) {
  return useQuery({
    queryKey: placesKey(tripId),
    queryFn: async () =>
      z
        .array(Place)
        .parse(unwrap(await supabase.from('places').select(PLACE_COLUMNS).eq('trip_id', tripId))),
  });
}

const placeSuggestion = z.object({
  provider_place_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});
export type PlaceSuggestion = z.infer<typeof placeSuggestion>;

const FoundPlace = z.object({
  provider_place_id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  timezone: z.string().nullable(),
});

/** Calls a server function, surfacing the message it returns on failure. */
async function callFunction(
  name: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detail = await (error as { context?: Response }).context
      ?.json()
      .catch(() => null);
    throw new Error(detail?.error ?? fallback);
  }
  return data;
}

const callPlaces = (body: Record<string, unknown>) =>
  callFunction('places', body, 'Place search is unavailable');

export interface PlaceSearch {
  input: string;
  /** Groups the keystrokes of one search, which is how the provider bills. */
  sessionToken: string;
  near?: { lat: number; lng: number };
}

export async function searchPlaces(search: PlaceSearch): Promise<PlaceSuggestion[]> {
  const data = await callPlaces({ action: 'autocomplete', ...search });
  return z.object({ suggestions: z.array(placeSuggestion) }).parse(data).suggestions;
}

interface PlacePick {
  providerPlaceId: string;
  sessionToken: string;
}

/** Looks up a suggestion's details and saves it as one of the trip's places. */
async function savePlace(tripId: string, pick: PlacePick): Promise<Place> {
  const data = await callPlaces({
    action: 'details',
    placeId: pick.providerPlaceId,
    sessionToken: pick.sessionToken,
  });
  const found = z.object({ place: FoundPlace }).parse(data).place;
  // If the trip already has this place, this refreshes it and reuses the row.
  const row = unwrap(
    await supabase
      .from('places')
      .upsert(
        {
          trip_id: tripId,
          provider: 'google',
          provider_place_id: found.provider_place_id,
          name: found.name.slice(0, 200),
          address: found.address?.slice(0, 500) ?? null,
          lat: found.lat,
          lng: found.lng,
          timezone: found.timezone,
        },
        { onConflict: 'trip_id,provider,provider_place_id' },
      )
      .select(PLACE_COLUMNS)
      .single(),
  );
  return Place.parse(row);
}

export function useAddPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pick: PlacePick) => savePlace(tripId, pick),
    onSuccess: (place) => {
      queryClient.setQueryData<Place[]>(placesKey(tripId), (places) => [
        ...(places ?? []).filter((existing) => existing.id !== place.id),
        place,
      ]);
    },
  });
}

// --- Itinerary import --------------------------------------------------------

export interface ImportedDraft {
  drafts: ImportDraftItem[];
  runId: string;
}

/** Sends pasted text to be read into draft items. Writes nothing to the trip. */
export function useImportItinerary(tripId: string) {
  return useMutation({
    mutationFn: async (text: string): Promise<ImportedDraft> => {
      const data = await callFunction(
        'import-itinerary',
        { tripId, text },
        'Import is unavailable right now. Try again later.',
      );
      const { drafts, runId } = z.object({ drafts: z.unknown(), runId: z.string() }).parse(data);
      // Validated again here: the app trusts no one else's idea of a draft.
      return { drafts: readImportDraft({ items: drafts }).items, runId };
    },
  });
}

/**
 * Finds a place for each query, spending at most one provider lookup on each.
 * A place the trip already has is reused. A query that finds nothing, or fails,
 * is left out, and its cards are added without a place.
 */
async function resolvePlaces(
  tripId: string,
  queries: readonly string[],
  existing: readonly Place[],
): Promise<Map<string, Place>> {
  const resolved = new Map<string, Place>();
  const known = new Map(
    existing.filter((p) => p.provider === 'google').map((p) => [p.provider_place_id, p]),
  );
  let near = existing[0] ? { lat: existing[0].lat, lng: existing[0].lng } : undefined;

  const resolve = async (query: string) => {
    try {
      // One token covers the search and the details call, which is how the
      // provider bills them as a single lookup.
      const sessionToken = Crypto.randomUUID();
      const [top] = await searchPlaces({ input: query, sessionToken, near });
      if (!top) return;
      const place =
        known.get(top.provider_place_id) ??
        (await savePlace(tripId, { providerPlaceId: top.provider_place_id, sessionToken }));
      known.set(place.provider_place_id, place);
      resolved.set(placeQueryKey(query), place);
      near ??= { lat: place.lat, lng: place.lng };
    } catch {
      // The card is still worth adding without its place.
    }
  };

  // The first lookup runs alone so the rest can be biased towards it.
  const pending = [...queries];
  if (!near && pending.length > 0) await resolve(pending.shift()!);
  const workers = Array.from({ length: 4 }, async () => {
    for (let query = pending.shift(); query !== undefined; query = pending.shift()) {
      await resolve(query);
    }
  });
  await Promise.all(workers);
  return resolved;
}

export interface ConfirmImport {
  /** The items the person kept, in source order. */
  items: ImportDraftItem[];
  runId: string;
  trip: Trip;
  /** A start date chosen on the import screen, for a trip that has none. */
  startDate: string | null;
  places: readonly Place[];
  cards: readonly Card[];
}

export interface ConfirmImportResult {
  added: number;
  skipped: SkippedImportItem[];
}

/** Adds the kept items to the trip as cards. This is the only step that writes. */
export function useConfirmImport(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmImport): Promise<ConfirmImportResult> => {
      const resolved = await resolvePlaces(tripId, planPlaceLookups(input.items), input.places);
      const { cards, skipped } = buildImportCards({
        items: input.items,
        trip: input.trip,
        startDate: input.startDate,
        places: resolved,
        existingCards: input.cards,
        newId: () => Crypto.randomUUID(),
      });

      let added = 0;
      if (cards.length > 0) {
        const rows: Record<string, unknown>[] = cards;
        const batch = await supabase.from('cards').insert(rows);
        if (!batch.error) {
          added = cards.length;
        } else {
          // One bad row fails a batch, so fall back to adding them one by one.
          for (const card of cards) {
            const row: Record<string, unknown> = card;
            const { error } = await supabase.from('cards').insert(row);
            if (error) {
              skipped.push({ index: -1, title: card.title, reason: error.message });
            } else {
              added++;
            }
          }
        }
      }

      // Bookkeeping only; a failure here must not undo a successful import.
      await supabase
        .rpc('update_import_run', {
          p_run_id: input.runId,
          p_cards_added: added,
          p_places_resolved: new Set([...resolved.values()].map((place) => place.id)).size,
        })
        .then(undefined, () => undefined);

      return { added, skipped };
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cardsKey(tripId) }),
        queryClient.invalidateQueries({ queryKey: placesKey(tripId) }),
      ]),
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
