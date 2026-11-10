import { CARD_KINDS, type Card, type CardKind } from './card';
import type { LocalDate } from './primitives';
import { compareSortKeys, type SortKey, sortKeyBetween, sortKeysBetween } from './sort-key';

// How a trip's cards are arranged for display, and how a manual reorder is
// turned into sort-key writes. Pure functions, shared by every client.

type Orderable = Pick<Card, 'id' | 'sort_key'>;
type Schedulable = Orderable & Pick<Card, 'start_date' | 'start_time'>;

/** Manual order. Ties on `sort_key` are possible (two people adding at once), so break them by id. */
export function compareByOrder(a: Orderable, b: Orderable): number {
  return compareSortKeys(a.sort_key, b.sort_key) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Order within one day: cards with a time first, by time; then the rest in manual order. */
export function compareWithinDay(a: Schedulable, b: Schedulable): number {
  if (a.start_time && b.start_time) {
    const [x, y] = [a.start_time.slice(0, 5), b.start_time.slice(0, 5)];
    return x < y ? -1 : x > y ? 1 : compareByOrder(a, b);
  }
  if (a.start_time) return -1;
  if (b.start_time) return 1;
  return compareByOrder(a, b);
}

/** Sort key for a new card, placing it after every existing card. */
export function nextSortKey(cards: readonly Orderable[]): SortKey {
  let last: SortKey | null = null;
  for (const card of cards) {
    if (last === null || card.sort_key > last) last = card.sort_key;
  }
  return sortKeyBetween(last, null);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Longest trip whose empty days are listed one by one. */
const MAX_LISTED_DAYS = 60;

export interface DayGroup<C> {
  /** `null` is the group of cards with no date yet. */
  date: LocalDate | null;
  cards: C[];
}

/**
 * Cards grouped by the day they start. Every day of the trip is listed, even
 * if empty, so there is somewhere to add to. Unscheduled cards come last.
 */
export function groupByDay<C extends Schedulable>(
  cards: readonly C[],
  trip: { start_date: LocalDate | null; end_date: LocalDate | null },
): DayGroup<C>[] {
  const byDate = new Map<LocalDate, C[]>();
  const unscheduled: C[] = [];

  if (trip.start_date) {
    const end = trip.end_date ?? trip.start_date;
    let day = trip.start_date;
    for (let i = 0; i < MAX_LISTED_DAYS && day <= end; i++) {
      byDate.set(day, []);
      day = addDays(day, 1);
    }
  }

  for (const card of cards) {
    if (card.start_date === null) {
      unscheduled.push(card);
      continue;
    }
    const day = byDate.get(card.start_date);
    if (day) day.push(card);
    else byDate.set(card.start_date, [card]);
  }

  const groups: DayGroup<C>[] = [...byDate.keys()]
    .sort()
    .map((date) => ({ date, cards: byDate.get(date)!.sort(compareWithinDay) }));
  if (unscheduled.length > 0) {
    groups.push({ date: null, cards: unscheduled.sort(compareByOrder) });
  }
  return groups;
}

export interface KindGroup<C> {
  kind: CardKind;
  cards: C[];
}

/** Cards grouped by kind, in manual order. Kinds with no cards are left out. */
export function groupByKind<C extends Orderable & Pick<Card, 'kind'>>(
  cards: readonly C[],
): KindGroup<C>[] {
  return CARD_KINDS.map((kind) => ({
    kind,
    cards: cards.filter((card) => card.kind === kind).sort(compareByOrder),
  })).filter((group) => group.cards.length > 0);
}

export interface SortKeyChange {
  id: string;
  sort_key: SortKey;
}

/**
 * The writes needed to move the card at `from` to position `to` in a list that
 * is in manual order. Normally one write, for the moved card alone. If its new
 * neighbours share a sort key there is no room between them, so the whole list
 * is given fresh keys.
 */
export function planMove(
  ordered: readonly Orderable[],
  from: number,
  to: number,
): SortKeyChange[] {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < ordered.length;
  if (!inRange(from) || !inRange(to) || from === to) return [];

  const result = [...ordered];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved!);

  const before = result[to - 1]?.sort_key ?? null;
  const after = result[to + 1]?.sort_key ?? null;
  if (before === null || after === null || before < after) {
    return [{ id: moved!.id, sort_key: sortKeyBetween(before, after) }];
  }

  const keys = sortKeysBetween(null, null, result.length);
  return result
    .map((card, i) => ({ id: card.id, sort_key: keys[i]! }))
    .filter((change, i) => change.sort_key !== result[i]!.sort_key);
}
