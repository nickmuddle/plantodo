import {
  type Card,
  CardInsert,
  type CardKind,
  type CardStatus,
  type Meal,
  parseTimeInput,
  type TransportMode,
} from '@plantodotdo/domain';

/** The card form's state: every field as the person typed it. */
export interface CardDraft {
  kind: CardKind;
  title: string;
  status: CardStatus;
  start_date: string | null;
  start_time: string;
  end_date: string | null;
  end_time: string;
  notes: string;
  url: string;
  confirmation_code: string;
  meal: Meal | null;
  cuisine: string;
  party_size: string;
  category: string;
  mode: TransportMode;
  carrier: string;
  service_number: string;
}

export function emptyDraft(kind: CardKind, date: string | null): CardDraft {
  return {
    kind,
    title: '',
    status: 'idea',
    start_date: date,
    start_time: '',
    end_date: null,
    end_time: '',
    notes: '',
    url: '',
    confirmation_code: '',
    meal: null,
    cuisine: '',
    party_size: '',
    category: '',
    mode: 'walk',
    carrier: '',
    service_number: '',
  };
}

export function draftFromCard(card: Card): CardDraft {
  const draft = emptyDraft(card.kind, card.start_date);
  draft.title = card.title;
  draft.status = card.status;
  draft.start_time = card.start_time?.slice(0, 5) ?? '';
  draft.end_date = card.end_date;
  draft.end_time = card.end_time?.slice(0, 5) ?? '';
  draft.notes = card.notes ?? '';
  draft.url = card.url ?? '';
  if (card.kind !== 'note') draft.confirmation_code = card.details.confirmation_code ?? '';
  if (card.kind === 'eat') {
    draft.meal = card.details.meal ?? null;
    draft.cuisine = card.details.cuisine ?? '';
    draft.party_size = card.details.party_size?.toString() ?? '';
  }
  if (card.kind === 'do') draft.category = card.details.category ?? '';
  if (card.kind === 'transport') {
    draft.mode = card.details.mode;
    draft.carrier = card.details.carrier ?? '';
    draft.service_number = card.details.service_number ?? '';
  }
  return draft;
}

const optional = (text: string) => text.trim() || undefined;

function buildDetails(draft: CardDraft, existing: Card | undefined) {
  const confirmation_code = optional(draft.confirmation_code);
  switch (draft.kind) {
    case 'stay':
      return { v: 1, confirmation_code };
    case 'eat':
      return {
        v: 1,
        meal: draft.meal ?? undefined,
        cuisine: optional(draft.cuisine),
        party_size: draft.party_size.trim() ? Number(draft.party_size) : undefined,
        confirmation_code,
      };
    case 'do':
      return { v: 1, category: optional(draft.category), confirmation_code };
    case 'transport':
      return {
        // Distance and duration are not on the form; keep them if already known.
        ...(existing?.kind === 'transport' ? existing.details : {}),
        v: 1,
        mode: draft.mode,
        carrier: optional(draft.carrier),
        service_number: optional(draft.service_number),
        confirmation_code,
      };
    case 'note':
      return { v: 1 };
  }
}

const friendly: Record<string, string> = {
  title: 'Give the card a title.',
  url: 'The link doesn’t look like a web address.',
  'details.party_size': 'Party size should be a whole number above zero.',
  end_date: 'The end is before the start, or there is an end date with no start date.',
  end_time: 'The end time is before the start time.',
  start_time: 'A start time needs a start date.',
};

interface BuildContext {
  id: string;
  trip_id: string;
  /** The trip's time zone, used for newly scheduled cards. */
  timezone: string;
  sort_key: string;
  existing?: Card;
}

export type BuildResult = { ok: true; card: CardInsert } | { ok: false; errors: string[] };

/** Turns the form into a validated card, or a list of things to fix. */
export function buildCard(draft: CardDraft, context: BuildContext): BuildResult {
  const { existing } = context;
  const errors: string[] = [];

  const readTime = (text: string, label: string, previous: string | null | undefined) => {
    if (!text.trim()) return null;
    const parsed = parseTimeInput(text);
    if (!parsed) {
      errors.push(`${label} should look like 19:30.`);
      return null;
    }
    // Reuse the stored spelling (with seconds) when the time has not changed.
    return previous?.slice(0, 5) === parsed ? previous : parsed;
  };
  const start_time = readTime(draft.start_time, 'Start time', existing?.start_time);
  const end_time = readTime(draft.end_time, 'End time', existing?.end_time);

  // An end time alone means "ends the same day".
  const end_date = draft.end_date ?? (end_time ? draft.start_date : null);

  const url = draft.url.trim();
  const parsed = CardInsert.safeParse({
    id: context.id,
    trip_id: context.trip_id,
    kind: draft.kind,
    title: draft.title,
    notes: draft.notes.trim() || null,
    url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null,
    place_id: existing?.place_id ?? null,
    end_place_id: draft.kind === 'transport' ? (existing?.end_place_id ?? null) : null,
    start_date: draft.start_date,
    start_time,
    start_tz: draft.start_date ? (existing?.start_tz ?? context.timezone) : null,
    end_date,
    end_time,
    end_tz: end_date ? (existing?.end_tz ?? context.timezone) : null,
    status: draft.status,
    origin: existing?.origin ?? 'user',
    suggestion_state: existing?.suggestion_state ?? null,
    sort_key: context.sort_key,
    details: buildDetails(draft, existing),
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      errors.push(friendly[path] ?? `${path}: ${issue.message}`);
    }
  }
  if (errors.length > 0 || !parsed.success) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, card: parsed.data };
}
