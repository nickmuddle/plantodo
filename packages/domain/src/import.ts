import { z } from 'zod';
import {
  CARD_KINDS,
  type Card,
  CardInsert,
  CardKind,
  MEALS,
  Meal,
  TRANSPORT_MODES,
  TransportMode,
} from './card.ts';
import type { Place } from './place.ts';
import { addDays } from './plan.ts';
import { LocalDate, Url } from './primitives.ts';
import { type SortKey, sortKeysBetween } from './sort-key.ts';
import { parseTimeInput } from './time-input.ts';
import type { Trip } from './trip.ts';
import { zonedInstant } from './zoned-time.ts';

// Itinerary import: turning a pasted plan into cards.
//
// A model reads the text and returns an `ImportDraft`. The person reviews the
// items, then `buildImportCards` turns the ones they keep into cards. Nothing
// here talks to a network or a database.

/** Longest text accepted for one import. */
export const IMPORT_MAX_CHARS = 20_000;
/** Most items kept from one import. */
export const IMPORT_MAX_ITEMS = 200;
/** Most place lookups made for one import; further cards are added without a place. */
export const IMPORT_MAX_PLACE_LOOKUPS = 25;

const shortText = z.string().trim().min(1).max(200);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
const placeQuery = z.string().trim().min(2).max(200);

/** One thing the model found in the text. Every field is present; unknown ones are null. */
export const ImportDraftItem = z.object({
  kind: CardKind,
  title: shortText,
  notes: z.string().max(10_000).nullable(),
  url: Url.nullable(),
  /** Day of the trip, counting from 1, when the text says "Day 2" and gives no date. */
  day: z.int().min(1).max(366).nullable(),
  /** An explicit calendar date from the text. Wins over `day`. */
  date: LocalDate.nullable(),
  start_time: time.nullable(),
  end_time: time.nullable(),
  /** Name plus locality to search for, e.g. "Cervejaria Ramiro, Lisbon". */
  place_query: placeQuery.nullable(),
  /** Transport only: where it arrives. */
  end_place_query: placeQuery.nullable(),
  details: z.object({
    meal: Meal.nullable(),
    cuisine: shortText.nullable(),
    category: shortText.nullable(),
    mode: TransportMode.nullable(),
    carrier: shortText.nullable(),
    service_number: shortText.nullable(),
  }),
});
export type ImportDraftItem = z.infer<typeof ImportDraftItem>;

/** What the model returns for one pasted itinerary. */
export const ImportDraft = z.object({ items: z.array(ImportDraftItem) });
export type ImportDraft = z.infer<typeof ImportDraft>;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const text = (description: string) => nullable({ type: 'string', description });

/**
 * `ImportDraft` as the JSON Schema given to the model for structured output.
 * Looser than the Zod schema on purpose (no length or pattern limits, which the
 * output format does not enforce): `readImportDraft` applies the real rules.
 */
export const IMPORT_DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'One entry per stay, meal, activity, journey or note, in the order they appear.',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [...CARD_KINDS],
            description:
              'stay = accommodation; eat = a meal, cafe or bar; do = an activity or sight; transport = a journey between two places; note = anything else worth keeping.',
          },
          title: { type: 'string', description: 'Short name, at most 200 characters.' },
          notes: text('Other details from the text worth keeping. Null if none.'),
          url: text('A web link copied exactly from the text. Null if the text has none.'),
          day: nullable({
            type: 'integer',
            description: 'Day number counting from 1, when the text says "Day 2" or similar.',
          }),
          date: text('Calendar date as YYYY-MM-DD, only if the text gives one. Otherwise null.'),
          start_time: text('24-hour HH:MM, only if the text gives a time. Otherwise null.'),
          end_time: text('24-hour HH:MM, only if the text gives an end time. Otherwise null.'),
          place_query: text(
            'Name of the place plus its town or city, as you would search for it on a map. For transport, where it departs from. Null if no specific place is named.',
          ),
          end_place_query: text('Transport only: where it arrives. Otherwise null.'),
          details: {
            type: 'object',
            properties: {
              meal: nullable({ type: 'string', enum: [...MEALS] }),
              cuisine: text('For eat.'),
              category: text('For do, e.g. museum, hike, show.'),
              mode: nullable({ type: 'string', enum: [...TRANSPORT_MODES] }),
              carrier: text('For transport: airline or operator.'),
              service_number: text('For transport: flight or train number.'),
            },
            required: ['meal', 'cuisine', 'category', 'mode', 'carrier', 'service_number'],
            additionalProperties: false,
          },
        },
        required: [
          'kind',
          'title',
          'notes',
          'url',
          'day',
          'date',
          'start_time',
          'end_time',
          'place_query',
          'end_place_query',
          'details',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const asText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max).trim();
  return trimmed || null;
};

const asEnum = <T extends string>(value: unknown, options: readonly T[]): T | null =>
  options.includes(value as T) ? (value as T) : null;

/** Tidies one raw item so that small slips do not cost the whole item. */
function tidy(raw: unknown, sourceText: string | undefined): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const item = raw as Record<string, unknown>;
  const details = (typeof item.details === 'object' && item.details) || {};
  const detail = details as Record<string, unknown>;

  // A link is kept only if it is a web address and, when we have the text it
  // came from, appears there: the model must never supply one of its own.
  let url = asText(item.url, 2000);
  if (url && !Url.safeParse(url).success) url = null;
  if (url && sourceText !== undefined) {
    const needle = url.replace(/\/+$/, '').toLowerCase();
    if (!sourceText.toLowerCase().includes(needle)) url = null;
  }

  const clock = (value: unknown) => (typeof value === 'string' ? parseTimeInput(value) : null);
  const query = (value: unknown) => {
    const found = asText(value, 200);
    return found && found.length >= 2 ? found : null;
  };

  return {
    kind: item.kind,
    title: asText(item.title, 200),
    notes: asText(item.notes, 10_000),
    url,
    day: Number.isInteger(item.day) && (item.day as number) >= 1 && (item.day as number) <= 366
      ? item.day
      : null,
    date: LocalDate.safeParse(item.date).success ? item.date : null,
    start_time: clock(item.start_time),
    end_time: clock(item.end_time),
    place_query: query(item.place_query),
    end_place_query: item.kind === 'transport' ? query(item.end_place_query) : null,
    details: {
      meal: asEnum(detail.meal, MEALS),
      cuisine: asText(detail.cuisine, 200),
      category: asText(detail.category, 200),
      mode: asEnum(detail.mode, TRANSPORT_MODES),
      carrier: asText(detail.carrier, 200),
      service_number: asText(detail.service_number, 200),
    },
  };
}

export interface ReadImportDraft {
  items: ImportDraftItem[];
  /** How many entries were discarded as invalid. */
  dropped: number;
}

/**
 * Validates untrusted model output item by item. An item that is not valid is
 * dropped; the rest are kept. Pass the pasted text to also discard links that
 * do not appear in it.
 */
export function readImportDraft(raw: unknown, sourceText?: string): ReadImportDraft {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return { items: [], dropped: 0 };

  const items: ImportDraftItem[] = [];
  let dropped = 0;
  for (const entry of list.slice(0, IMPORT_MAX_ITEMS)) {
    const parsed = ImportDraftItem.safeParse(tidy(entry, sourceText));
    if (parsed.success) items.push(parsed.data);
    else dropped++;
  }
  return { items, dropped: dropped + Math.max(0, list.length - IMPORT_MAX_ITEMS) };
}

/** Two queries with the same key are the same place for the purposes of one import. */
export function placeQueryKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The distinct places to look up for the given items, in the order they first
 * appear, capped so one import cannot run up an unbounded bill.
 */
export function planPlaceLookups(
  items: readonly ImportDraftItem[],
  cap: number = IMPORT_MAX_PLACE_LOOKUPS,
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of items) {
    for (const query of [item.place_query, item.end_place_query]) {
      if (!query) continue;
      const key = placeQueryKey(query);
      if (seen.has(key)) continue;
      seen.add(key);
      if (queries.length < cap) queries.push(query);
    }
  }
  return queries;
}

/** True when some item relies on a day number, so a start date would schedule it. */
export function needsStartDate(items: readonly ImportDraftItem[]): boolean {
  return items.some((item) => item.day !== null && item.date === null);
}

/** The date an item falls on, or null if it cannot be placed on the calendar. */
export function importItemDate(
  item: Pick<ImportDraftItem, 'day' | 'date'>,
  startDate: LocalDate | null,
): LocalDate | null {
  if (item.date) return item.date;
  if (item.day !== null && startDate) return addDays(startDate, item.day - 1);
  return null;
}

export interface BuildImportCardsInput {
  /** The items the person kept, in source order. */
  items: readonly ImportDraftItem[];
  trip: Pick<Trip, 'id' | 'start_date' | 'timezone'>;
  /** A start date supplied at import time, used when the trip has none. */
  startDate?: LocalDate | null;
  /** Places found for the items' queries, keyed by `placeQueryKey`. */
  places: ReadonlyMap<string, Pick<Place, 'id' | 'timezone'>>;
  existingCards: readonly Pick<Card, 'sort_key'>[];
  newId: () => string;
}

export interface SkippedImportItem {
  /** Position in `items`. */
  index: number;
  title: string;
  reason: string;
}

export interface BuildImportCardsResult {
  cards: CardInsert[];
  skipped: SkippedImportItem[];
}

/**
 * Turns kept draft items into cards ready to insert. Cards go after the trip's
 * existing cards, in source order. An item that cannot make a valid card is
 * reported in `skipped` rather than stopping the rest.
 */
export function buildImportCards(input: BuildImportCardsInput): BuildImportCardsResult {
  const { items, trip, places } = input;
  const startDate = trip.start_date ?? input.startDate ?? null;

  let last: SortKey | null = null;
  for (const card of input.existingCards) {
    if (last === null || card.sort_key > last) last = card.sort_key;
  }
  const sortKeys = sortKeysBetween(last, null, items.length);

  const cards: CardInsert[] = [];
  const skipped: SkippedImportItem[] = [];

  items.forEach((item, index) => {
    const isTransport = item.kind === 'transport';
    const place = item.place_query ? places.get(placeQueryKey(item.place_query)) : undefined;
    const endPlace =
      isTransport && item.end_place_query
        ? places.get(placeQueryKey(item.end_place_query))
        : undefined;

    const date = importItemDate(item, startDate);
    const start_time = date ? item.start_time : null;
    const start_tz = date ? (place?.timezone ?? trip.timezone) : null;

    // An end time alone means "ends the same day", or the next day when that
    // would put the end before the start (a late dinner, an overnight flight).
    let end_date: LocalDate | null = null;
    let end_time: string | null = null;
    let end_tz: string | null = null;
    if (date && item.end_time) {
      end_tz = (isTransport ? endPlace?.timezone : place?.timezone) ?? trip.timezone;
      end_date = date;
      end_time = item.end_time;
      if (start_time) {
        const starts = zonedInstant(date, start_time, start_tz!);
        if (zonedInstant(end_date, end_time, end_tz) < starts) end_date = addDays(date, 1);
        if (zonedInstant(end_date, end_time, end_tz) < starts) {
          end_date = end_time = end_tz = null;
        }
      }
    }

    // Keep what the card itself cannot hold yet, so nothing from the plan is lost.
    const extras: string[] = [];
    if (!date && item.day !== null) extras.push(`Day ${item.day}`);
    if (!date && item.start_time) {
      extras.push(item.end_time ? `${item.start_time} to ${item.end_time}` : item.start_time);
    }
    if (item.place_query && !place) {
      extras.push(`${isTransport ? 'From' : 'Place'}: ${item.place_query}`);
    }
    if (isTransport && item.end_place_query && !endPlace) {
      extras.push(`To: ${item.end_place_query}`);
    }
    const notes = [item.notes, extras.join('. ')].filter(Boolean).join('\n\n').slice(0, 10_000);

    const { meal, cuisine, category, mode, carrier, service_number } = item.details;
    const optional = (value: string | null) => value ?? undefined;
    const details =
      item.kind === 'eat'
        ? { v: 1, meal: meal ?? undefined, cuisine: optional(cuisine) }
        : item.kind === 'do'
          ? { v: 1, category: optional(category) }
          : item.kind === 'transport'
            ? {
                v: 1,
                mode: mode ?? 'other',
                carrier: optional(carrier),
                service_number: optional(service_number),
              }
            : { v: 1 };

    const parsed = CardInsert.safeParse({
      id: input.newId(),
      trip_id: trip.id,
      kind: item.kind,
      title: item.title,
      notes: notes || null,
      url: item.url,
      place_id: place?.id ?? null,
      end_place_id: endPlace?.id ?? null,
      start_date: date,
      start_time,
      start_tz,
      end_date,
      end_time,
      end_tz,
      status: 'idea',
      origin: 'import',
      suggestion_state: null,
      sort_key: sortKeys[index],
      details,
    });

    if (parsed.success) cards.push(parsed.data);
    else {
      skipped.push({
        index,
        title: item.title,
        reason: parsed.error.issues[0]?.message ?? 'Not a valid card',
      });
    }
  });

  return { cards, skipped };
}
