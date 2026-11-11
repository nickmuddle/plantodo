import { describe, expect, it } from 'vitest';
import {
  buildImportCards,
  CardInsert,
  IMPORT_DRAFT_JSON_SCHEMA,
  ImportDraft,
  type ImportDraftItem,
  importItemDate,
  needsStartDate,
  planPlaceLookups,
  readImportDraft,
  sortKeysBetween,
  zonedInstant,
} from './index.ts';

const noDetails = {
  meal: null,
  cuisine: null,
  category: null,
  mode: null,
  carrier: null,
  service_number: null,
};

const item = (extra: Partial<ImportDraftItem> = {}): ImportDraftItem => ({
  kind: 'do',
  title: 'Tile museum',
  notes: null,
  url: null,
  day: null,
  date: null,
  start_time: null,
  end_time: null,
  place_query: null,
  end_place_query: null,
  details: noDetails,
  ...extra,
});

const trip = { id: '00000000-0000-4000-8000-000000000001', start_date: '2027-03-14', timezone: 'Europe/Lisbon' };
const place = (n: number, timezone: string | null = 'Europe/Lisbon') => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  timezone,
});

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const build = (items: ImportDraftItem[], extra: Partial<Parameters<typeof buildImportCards>[0]> = {}) =>
  buildImportCards({ items, trip, places: new Map(), existingCards: [], newId, ...extra });

describe('zoned instants', () => {
  it('reads a wall clock in its own zone', () => {
    expect(zonedInstant('2027-03-14', '10:00', 'UTC')).toBe(Date.parse('2027-03-14T10:00:00Z'));
    expect(zonedInstant('2027-07-01', '10:00', 'Europe/Lisbon')).toBe(Date.parse('2027-07-01T09:00:00Z'));
    expect(zonedInstant('2027-01-15', '09:30', 'America/New_York')).toBe(Date.parse('2027-01-15T14:30:00Z'));
    expect(zonedInstant('2027-01-15', '23:30', 'Asia/Tokyo')).toBe(Date.parse('2027-01-15T14:30:00Z'));
  });

  it('is right on either side of a clock change', () => {
    // Lisbon moves from UTC+0 to UTC+1 at 01:00 UTC on 28 March 2027.
    expect(zonedInstant('2027-03-28', '00:30', 'Europe/Lisbon')).toBe(Date.parse('2027-03-28T00:30:00Z'));
    expect(zonedInstant('2027-03-28', '03:00', 'Europe/Lisbon')).toBe(Date.parse('2027-03-28T02:00:00Z'));
  });
});

describe('reading model output', () => {
  it('keeps valid items and drops invalid ones', () => {
    const { items, dropped } = readImportDraft({
      items: [
        item(),
        { ...item(), kind: 'party' },
        { ...item(), title: '   ' },
        'not an object',
        item({ kind: 'eat', title: 'Dinner' }),
      ],
    });
    expect(items.map((i) => i.title)).toEqual(['Tile museum', 'Dinner']);
    expect(dropped).toBe(3);
    expect(ImportDraft.safeParse({ items }).success).toBe(true);
  });

  it('returns nothing for output of the wrong shape', () => {
    for (const raw of [null, 'text', {}, { items: 'x' }, []]) {
      expect(readImportDraft(raw)).toEqual({ items: [], dropped: 0 });
    }
  });

  it('repairs small slips instead of dropping the item', () => {
    const { items } = readImportDraft({
      items: [
        {
          kind: 'transport',
          title: `  ${'x'.repeat(300)}  `,
          notes: '',
          url: 'ftp://example.com/file',
          day: 2.5,
          date: '14 March',
          start_time: '7:30 PM',
          end_time: 'late',
          place_query: ' Lisbon Airport ',
          end_place_query: 'x',
          details: { mode: 'rocket', carrier: 'TAP', meal: 'dinner' },
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      notes: null,
      url: null,
      day: null,
      date: null,
      start_time: '19:30',
      end_time: null,
      place_query: 'Lisbon Airport',
      end_place_query: null,
      details: { mode: null, carrier: 'TAP', meal: 'dinner', cuisine: null },
    });
    expect(items[0]!.title).toHaveLength(200);
  });

  it('keeps a link only if it appears in the pasted text', () => {
    const text = 'Book at https://Example.com/ramiro/ before you go.';
    const read = (url: string) =>
      readImportDraft({ items: [{ ...item(), url }] }, text).items[0]!.url;
    expect(read('https://example.com/ramiro')).toBe('https://example.com/ramiro');
    expect(read('https://evil.example/login')).toBeNull();
    expect(read('javascript:alert(1)')).toBeNull();
  });

  it('gives only transport an arrival place', () => {
    const { items } = readImportDraft({ items: [{ ...item(), end_place_query: 'JFK Airport' }] });
    expect(items[0]!.end_place_query).toBeNull();
  });

  it('caps the number of items', () => {
    const { items, dropped } = readImportDraft({ items: Array.from({ length: 230 }, () => item()) });
    expect(items).toHaveLength(200);
    expect(dropped).toBe(30);
  });

  it('describes the same fields in the JSON schema as in the Zod schema', () => {
    const wire = IMPORT_DRAFT_JSON_SCHEMA.properties.items.items;
    expect([...wire.required].sort()).toEqual(Object.keys(item()).sort());
    expect([...wire.properties.details.required].sort()).toEqual(Object.keys(noDetails).sort());
    expect(Object.keys(wire.properties).sort()).toEqual([...wire.required].sort());
  });
});

describe('place lookups', () => {
  it('lists each distinct place once, in order, including arrivals', () => {
    const queries = planPlaceLookups([
      item({ place_query: 'Hotel Alfama, Lisbon' }),
      item({ place_query: '  hotel  alfama,   LISBON ' }),
      item({ kind: 'transport', place_query: 'Lisbon Airport', end_place_query: 'JFK Airport' }),
      item(),
      item({ place_query: 'JFK Airport' }),
    ]);
    expect(queries).toEqual(['Hotel Alfama, Lisbon', 'Lisbon Airport', 'JFK Airport']);
  });

  it('stops at the cap', () => {
    const many = Array.from({ length: 40 }, (_, i) => item({ place_query: `Place ${i}` }));
    expect(planPlaceLookups(many)).toHaveLength(25);
    expect(planPlaceLookups(many, 3)).toEqual(['Place 0', 'Place 1', 'Place 2']);
  });
});

describe('dates', () => {
  it('prefers an explicit date, then the day number, then nothing', () => {
    expect(importItemDate({ day: 3, date: '2027-05-01' }, '2027-03-14')).toBe('2027-05-01');
    expect(importItemDate({ day: 3, date: null }, '2027-03-14')).toBe('2027-03-16');
    expect(importItemDate({ day: 1, date: null }, '2027-03-14')).toBe('2027-03-14');
    expect(importItemDate({ day: 3, date: null }, null)).toBeNull();
    expect(importItemDate({ day: null, date: null }, '2027-03-14')).toBeNull();
  });

  it('knows when a start date would help', () => {
    expect(needsStartDate([item({ day: 2 })])).toBe(true);
    expect(needsStartDate([item({ day: 2, date: '2027-03-15' }), item()])).toBe(false);
  });
});

describe('building cards', () => {
  it('marks every card as an imported idea with a fresh id', () => {
    const { cards, skipped } = build([item(), item({ kind: 'note', title: 'Pack sunscreen' })]);
    expect(skipped).toEqual([]);
    for (const card of cards) {
      expect(card).toMatchObject({
        trip_id: trip.id,
        origin: 'import',
        suggestion_state: null,
        status: 'idea',
        details: { v: 1 },
      });
      expect(CardInsert.safeParse(card).success).toBe(true);
    }
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
  });

  it('puts cards after existing ones, in source order', () => {
    const existing = sortKeysBetween(null, null, 3).map((sort_key) => ({ sort_key }));
    const { cards } = build([item({ title: 'a' }), item({ title: 'b' }), item({ title: 'c' })], {
      existingCards: existing,
    });
    const keys = cards.map((c) => c.sort_key);
    expect(keys[0]! > existing[2]!.sort_key).toBe(true);
    expect([...keys].sort()).toEqual(keys);
    expect(cards.map((c) => c.title)).toEqual(['a', 'b', 'c']);
  });

  it('schedules by day number from the trip start, in the trip zone', () => {
    const { cards } = build([item({ day: 2, start_time: '10:00' })]);
    expect(cards[0]).toMatchObject({
      start_date: '2027-03-15',
      start_time: '10:00',
      start_tz: 'Europe/Lisbon',
      end_date: null,
      end_tz: null,
    });
  });

  it('uses a supplied start date only when the trip has none', () => {
    const undated = { ...trip, start_date: null };
    expect(build([item({ day: 2 })], { trip: undated, startDate: '2027-06-01' }).cards[0]!.start_date).toBe('2027-06-02');
    expect(build([item({ day: 2 })], { startDate: '2027-06-01' }).cards[0]!.start_date).toBe('2027-03-15');
  });

  it('leaves a card unscheduled without a start date, keeping day and time in the notes', () => {
    const { cards } = build([item({ day: 3, start_time: '19:30', end_time: '21:00', notes: 'Book ahead' })], {
      trip: { ...trip, start_date: null },
    });
    expect(cards[0]).toMatchObject({ start_date: null, start_time: null, start_tz: null, end_time: null });
    expect(cards[0]!.notes).toBe('Book ahead\n\nDay 3. 19:30 to 21:00');
  });

  it('takes the zone of the resolved place', () => {
    const places = new Map([['senso-ji, tokyo', place(1, 'Asia/Tokyo')]]);
    const { cards } = build([item({ day: 1, start_time: '09:00', place_query: 'Senso-ji, Tokyo' })], { places });
    expect(cards[0]).toMatchObject({ place_id: place(1).id, start_tz: 'Asia/Tokyo' });
    expect(cards[0]!.notes).toBeNull();
  });

  it('keeps an unresolved place name in the notes', () => {
    const { cards } = build([item({ place_query: 'Somewhere obscure' })]);
    expect(cards[0]).toMatchObject({ place_id: null, notes: 'Place: Somewhere obscure' });
  });

  it('ends transport in the arrival zone, on the next day when needed', () => {
    const places = new Map([
      ['jfk airport', place(1, 'America/New_York')],
      ['lisbon airport', place(2, 'Europe/Lisbon')],
    ]);
    const flight = (start: string, end: string, from: string, to: string) =>
      build(
        [
          item({
            kind: 'transport',
            title: 'Flight',
            day: 1,
            start_time: start,
            end_time: end,
            place_query: from,
            end_place_query: to,
            details: { ...noDetails, mode: 'flight', carrier: 'TAP', service_number: 'TP 201' },
          }),
        ],
        { places },
      ).cards[0]!;

    // Westbound: lands "earlier" on the local clock the same day.
    expect(flight('10:00', '09:30', 'Lisbon Airport', 'JFK Airport')).toMatchObject({
      place_id: place(2).id,
      end_place_id: place(1).id,
      start_tz: 'Europe/Lisbon',
      end_date: '2027-03-14',
      end_tz: 'America/New_York',
      details: { v: 1, mode: 'flight', carrier: 'TAP', service_number: 'TP 201' },
    });
    // Eastbound overnight: lands the next morning.
    expect(flight('22:00', '10:00', 'JFK Airport', 'Lisbon Airport')).toMatchObject({
      start_tz: 'America/New_York',
      end_date: '2027-03-15',
      end_tz: 'Europe/Lisbon',
    });
  });

  it('rolls a same-zone end past midnight to the next day', () => {
    const { cards } = build([item({ kind: 'eat', day: 1, start_time: '22:00', end_time: '01:00' })]);
    expect(cards[0]).toMatchObject({ end_date: '2027-03-15', end_time: '01:00' });
  });

  it('gives transport a mode even when the text was unclear', () => {
    const { cards } = build([item({ kind: 'transport', title: 'Get to the airport' })]);
    expect(cards[0]!.details).toEqual({ v: 1, mode: 'other' });
  });

  it('carries only the details that belong to the kind', () => {
    const details = { ...noDetails, meal: 'lunch' as const, cuisine: 'Seafood', category: 'Museum', mode: 'train' as const };
    expect(build([item({ kind: 'eat', details })]).cards[0]!.details).toEqual({ v: 1, meal: 'lunch', cuisine: 'Seafood' });
    expect(build([item({ kind: 'do', details })]).cards[0]!.details).toEqual({ v: 1, category: 'Museum' });
    expect(build([item({ kind: 'stay', details })]).cards[0]!.details).toEqual({ v: 1 });
  });

  it('reports an item that cannot make a valid card and keeps the rest', () => {
    const bad = { ...item({ title: 'Broken' }), date: '2027-02-30' } as ImportDraftItem;
    const { cards, skipped } = build([item({ title: 'ok' }), bad, item({ title: 'also ok' })]);
    expect(cards.map((c) => c.title)).toEqual(['ok', 'also ok']);
    expect(skipped).toMatchObject([{ index: 1, title: 'Broken' }]);
  });
});
