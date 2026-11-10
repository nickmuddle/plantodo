import { z } from 'zod';
import { Id, LocalDate, LocalTime, TimeZone, Timestamp, Url } from './primitives';
import { SortKey } from './sort-key';

export const CARD_KINDS = ['stay', 'eat', 'do', 'transport', 'note'] as const;
export const CardKind = z.enum(CARD_KINDS);
export type CardKind = z.infer<typeof CardKind>;

/** How firm the plan is. Independent of whether the card has a date. */
export const CARD_STATUSES = ['idea', 'planned', 'booked', 'done'] as const;
export const CardStatus = z.enum(CARD_STATUSES);
export type CardStatus = z.infer<typeof CardStatus>;

/** Where the card came from. Suggestions are ordinary cards with a different origin. */
export const CARD_ORIGINS = ['user', 'suggestion', 'import'] as const;
export const CardOrigin = z.enum(CARD_ORIGINS);
export type CardOrigin = z.infer<typeof CardOrigin>;

export const SUGGESTION_STATES = ['pending', 'accepted', 'dismissed'] as const;
export const SuggestionState = z.enum(SUGGESTION_STATES);
export type SuggestionState = z.infer<typeof SuggestionState>;

export const TRANSPORT_MODES = [
  'walk',
  'bike',
  'drive',
  'taxi',
  'transit',
  'bus',
  'train',
  'ferry',
  'flight',
  'other',
] as const;
export const TransportMode = z.enum(TRANSPORT_MODES);
export type TransportMode = z.infer<typeof TransportMode>;

export const MEALS = ['breakfast', 'lunch', 'dinner', 'drinks', 'snack'] as const;
export const Meal = z.enum(MEALS);
export type Meal = z.infer<typeof Meal>;

/**
 * Kind-specific fields live in `details` (a jsonb column). Each shape carries a
 * version `v` so a later change can be migrated on read instead of rewriting rows.
 */
const text = z.string().trim().min(1).max(200);

export const StayDetails = z.object({
  v: z.literal(1),
  confirmation_code: text.optional(),
});
export const EatDetails = z.object({
  v: z.literal(1),
  meal: Meal.optional(),
  cuisine: text.optional(),
  party_size: z.int().positive().optional(),
  confirmation_code: text.optional(),
});
export const DoDetails = z.object({
  v: z.literal(1),
  category: text.optional(),
  confirmation_code: text.optional(),
});
export const TransportDetails = z.object({
  v: z.literal(1),
  mode: TransportMode,
  carrier: text.optional(),
  /** Flight number, train number, route name. */
  service_number: text.optional(),
  confirmation_code: text.optional(),
  distance_meters: z.number().nonnegative().optional(),
  duration_seconds: z.number().nonnegative().optional(),
});
export const NoteDetails = z.object({ v: z.literal(1) });

/** Fields the client writes. */
const writable = {
  id: Id,
  trip_id: Id,
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(10_000).nullable(),
  url: Url.nullable(),

  /** Where it happens; for transport, where it departs from. */
  place_id: Id.nullable(),
  /** Transport only: where it arrives. */
  end_place_id: Id.nullable(),

  /**
   * Local wall-clock times, each with its own zone, because a flight can leave
   * in one zone and land in another. No `start_date` means unscheduled.
   */
  start_date: LocalDate.nullable(),
  start_time: LocalTime.nullable(),
  start_tz: TimeZone.nullable(),
  end_date: LocalDate.nullable(),
  end_time: LocalTime.nullable(),
  end_tz: TimeZone.nullable(),

  status: CardStatus,
  origin: CardOrigin,
  /** Set exactly when `origin` is `suggestion`. */
  suggestion_state: SuggestionState.nullable(),
  sort_key: SortKey,
};

/** Fields the server fills in. */
const managed = { created_by: Id, created_at: Timestamp, updated_at: Timestamp };

type Envelope = z.infer<z.ZodObject<typeof writable>>;

function checkEnvelope(card: Envelope & { kind: CardKind }, ctx: z.RefinementCtx): void {
  const issue = (path: keyof Envelope, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if ((card.origin === 'suggestion') !== (card.suggestion_state !== null)) {
    issue('suggestion_state', 'Set exactly when origin is "suggestion"');
  }
  if (card.end_place_id !== null && card.kind !== 'transport') {
    issue('end_place_id', 'Only transport cards have an arrival place');
  }

  if ((card.start_date === null) !== (card.start_tz === null)) {
    issue('start_tz', 'start_date and start_tz must be set together');
  }
  if (card.start_time !== null && card.start_date === null) {
    issue('start_time', 'A start time needs a start date');
  }
  if ((card.end_date === null) !== (card.end_tz === null)) {
    issue('end_tz', 'end_date and end_tz must be set together');
  }
  if (card.end_time !== null && card.end_date === null) {
    issue('end_time', 'An end time needs an end date');
  }
  if (card.end_date !== null && card.start_date === null) {
    issue('end_date', 'An end needs a start');
  }

  // Across zones the order depends on offsets, which is the server's job to know.
  if (card.start_date !== null && card.end_date !== null && card.start_tz === card.end_tz) {
    const sameDay = card.start_date === card.end_date;
    if (card.end_date < card.start_date) {
      issue('end_date', 'Ends before it starts');
    } else if (sameDay && card.start_time !== null && card.end_time !== null) {
      if (card.end_time.slice(0, 5) < card.start_time.slice(0, 5)) {
        issue('end_time', 'Ends before it starts');
      }
    }
  }
}

function cardSchema<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.discriminatedUnion('kind', [
    z.object({ ...shape, kind: z.literal('stay'), details: StayDetails }),
    z.object({ ...shape, kind: z.literal('eat'), details: EatDetails }),
    z.object({ ...shape, kind: z.literal('do'), details: DoDetails }),
    z.object({ ...shape, kind: z.literal('transport'), details: TransportDetails }),
    z.object({ ...shape, kind: z.literal('note'), details: NoteDetails }),
  ]);
}

/** A card as stored: one intention in a trip's plan. */
export const Card = cardSchema({ ...writable, ...managed }).superRefine(checkEnvelope);
export type Card = z.infer<typeof Card>;

/** What a client sends to create a card. */
export const CardInsert = cardSchema(writable).superRefine(checkEnvelope);
export type CardInsert = z.infer<typeof CardInsert>;

export function isScheduled(card: Pick<Card, 'start_date'>): boolean {
  return card.start_date !== null;
}

/** Suggestions stay out of the plan until someone accepts them. */
export function isInPlan(card: Pick<Card, 'origin' | 'suggestion_state'>): boolean {
  return card.origin !== 'suggestion' || card.suggestion_state === 'accepted';
}
