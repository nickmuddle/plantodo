import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareByOrder,
  groupByDay,
  groupByKind,
  nextSortKey,
  parseTimeInput,
  planMove,
  sortKeysBetween,
  stopsOf,
} from './index.ts';

interface TestCard {
  id: string;
  sort_key: string;
  kind: 'stay' | 'eat' | 'do' | 'transport' | 'note';
  start_date: string | null;
  start_time: string | null;
}

const keys = sortKeysBetween(null, null, 6);
const card = (id: string, n: number, extra: Partial<TestCard> = {}): TestCard => ({
  id,
  sort_key: keys[n]!,
  kind: 'do',
  start_date: null,
  start_time: null,
  ...extra,
});
const ids = (cards: { id: string }[]) => cards.map((c) => c.id).join('');

describe('ordering', () => {
  it('puts a new card after all others', () => {
    const cards = [card('a', 2), card('b', 5), card('c', 0)];
    expect(nextSortKey(cards) > keys[5]!).toBe(true);
    expect(typeof nextSortKey([])).toBe('string');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('by day', () => {
  const trip = { start_date: '2027-03-14', end_date: '2027-03-16' };

  it('lists every day of the trip, then unscheduled cards', () => {
    const groups = groupByDay(
      [card('a', 0, { start_date: '2027-03-15' }), card('b', 1)],
      trip,
    );
    expect(groups.map((g) => [g.date, ids(g.cards)])).toEqual([
      ['2027-03-14', ''],
      ['2027-03-15', 'a'],
      ['2027-03-16', ''],
      [null, 'b'],
    ]);
  });

  it('includes days outside the trip dates when a card is on them', () => {
    const groups = groupByDay([card('a', 0, { start_date: '2027-03-12' })], trip);
    expect(groups.map((g) => g.date)).toEqual([
      '2027-03-12',
      '2027-03-14',
      '2027-03-15',
      '2027-03-16',
    ]);
  });

  it('works for a trip with no dates', () => {
    const groups = groupByDay(
      [card('a', 0, { start_date: '2027-05-02' }), card('b', 1), card('c', 2, { start_date: '2027-05-01' })],
      { start_date: null, end_date: null },
    );
    expect(groups.map((g) => [g.date, ids(g.cards)])).toEqual([
      ['2027-05-01', 'c'],
      ['2027-05-02', 'a'],
      [null, 'b'],
    ]);
  });

  it('orders a day by time, then untimed cards in manual order', () => {
    const day = { start_date: '2027-03-14' };
    const groups = groupByDay(
      [
        card('a', 3, day),
        card('b', 0, { ...day, start_time: '19:30:00' }),
        card('c', 1, day),
        card('d', 2, { ...day, start_time: '09:00' }),
      ],
      { start_date: '2027-03-14', end_date: null },
    );
    expect(ids(groups[0]!.cards)).toBe('dbca');
  });

  it('does not list hundreds of empty days for a very long trip', () => {
    const groups = groupByDay([], { start_date: '2027-01-01', end_date: '2029-01-01' });
    expect(groups).toHaveLength(60);
  });
});

describe('by kind', () => {
  it('groups in a fixed kind order and leaves out empty kinds', () => {
    const groups = groupByKind([
      card('a', 2, { kind: 'eat' }),
      card('b', 1, { kind: 'stay' }),
      card('c', 0, { kind: 'eat' }),
    ]);
    expect(groups.map((g) => [g.kind, ids(g.cards)])).toEqual([
      ['stay', 'b'],
      ['eat', 'ca'],
    ]);
  });
});

describe('moving a card', () => {
  const list = [card('a', 0), card('b', 1), card('c', 2), card('d', 3)];
  const apply = (cards: TestCard[], from: number, to: number) => {
    const changes = planMove(cards, from, to);
    const moved = cards.map((c) => ({
      ...c,
      sort_key: changes.find((x) => x.id === c.id)?.sort_key ?? c.sort_key,
    }));
    return { changes, order: ids(moved.sort(compareByOrder)) };
  };

  it('writes one key to move a card anywhere', () => {
    expect(apply(list, 0, 2)).toMatchObject({ order: 'bcad', changes: { length: 1 } });
    expect(apply(list, 3, 0)).toMatchObject({ order: 'dabc', changes: { length: 1 } });
    expect(apply(list, 1, 3)).toMatchObject({ order: 'acdb', changes: { length: 1 } });
    expect(apply(list, 2, 1)).toMatchObject({ order: 'acbd', changes: { length: 1 } });
  });

  it('does nothing for a move to the same place or out of range', () => {
    expect(planMove(list, 1, 1)).toEqual([]);
    expect(planMove(list, 0, 4)).toEqual([]);
    expect(planMove(list, -1, 0)).toEqual([]);
  });

  it('re-keys the list when neighbours share a key', () => {
    const tied = [card('a', 0), card('b', 1), card('c', 1), card('d', 3)];
    const { order, changes } = apply(tied, 3, 2);
    expect(order).toBe('abdc');
    expect(changes.length).toBeGreaterThan(1);
  });
});

describe('typed times', () => {
  it('reads the ways people write a time', () => {
    expect(parseTimeInput('19:30')).toBe('19:30');
    expect(parseTimeInput('9.30')).toBe('09:30');
    expect(parseTimeInput('0930')).toBe('09:30');
    expect(parseTimeInput('9')).toBe('09:00');
    expect(parseTimeInput('7pm')).toBe('19:00');
    expect(parseTimeInput(' 7:30 PM ')).toBe('19:30');
    expect(parseTimeInput('12am')).toBe('00:00');
    expect(parseTimeInput('12pm')).toBe('12:00');
  });

  it('rejects things that are not times', () => {
    for (const text of ['', '25:00', '9:75', '13pm', '0pm', 'noon', '9:3', '19:30:00']) {
      expect(parseTimeInput(text), text).toBeNull();
    }
  });
});

describe('stops', () => {
  const place = (id: string) => ({
    id,
    trip_id: 't',
    name: id,
    lat: 0,
    lng: 0,
    address: null,
    timezone: null,
    provider: null,
    provider_place_id: null,
    created_by: 'u',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
  });
  const at = (id: string, n: number, place_id: string | null, extra = {}) => ({
    ...card(id, n),
    place_id,
    end_place_id: null as string | null,
    ...extra,
  });

  it('lists used places in the order the trip reaches them, with their cards', () => {
    const stops = stopsOf(
      [
        at('a', 0, 'cafe', { start_date: '2027-03-15' }),
        at('b', 1, 'hotel', { start_date: '2027-03-14' }),
        at('c', 2, 'cafe'),
        at('d', 3, null),
        at('e', 4, 'hotel', { start_date: '2027-03-14', start_time: '09:00', end_place_id: 'airport' }),
      ],
      [place('cafe'), place('hotel'), place('airport'), place('unused')],
    );
    expect(stops.map((s) => [s.place.id, ids(s.cards)])).toEqual([
      ['hotel', 'eb'],
      ['airport', 'e'],
      ['cafe', 'ac'],
    ]);
  });

  it('ignores a card whose place is not loaded', () => {
    expect(stopsOf([at('a', 0, 'gone')], [])).toEqual([]);
  });
});
