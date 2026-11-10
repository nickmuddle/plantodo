import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { z } from 'zod';

/**
 * Fractional index used to order cards. Inserting or moving a card writes one key
 * and never renumbers its neighbours, so concurrent reorders do not conflict.
 *
 * Keys only sort correctly by code point: compare with `compareSortKeys`, never
 * `localeCompare`. The database column uses the "C" collation for the same reason.
 */
export const SortKey = z.string().regex(/^[0-9A-Za-z]+$/);
export type SortKey = z.infer<typeof SortKey>;

/** Key that sorts between `before` and `after`; pass `null` for an open end. */
export function sortKeyBetween(before: SortKey | null, after: SortKey | null): SortKey {
  return generateKeyBetween(before, after);
}

export function sortKeysBetween(
  before: SortKey | null,
  after: SortKey | null,
  count: number,
): SortKey[] {
  return generateNKeysBetween(before, after, count);
}

export function compareSortKeys(a: SortKey, b: SortKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
