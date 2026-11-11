import { describe, expect, it } from 'vitest';
import {
  Card,
  CardInsert,
  CardLinkInsert,
  compareSortKeys,
  DisplayName,
  InviteRole,
  isInviteLive,
  isInPlan,
  LocalTime,
  PlaceInsert,
  sortKeyBetween,
  sortKeysBetween,
  TimeZone,
  Timestamp,
  TripInsert,
} from './index.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const baseCard = {
  id: id(1),
  trip_id: id(2),
  kind: 'do',
  title: 'Tile museum',
  notes: null,
  url: null,
  place_id: null,
  end_place_id: null,
  start_date: null,
  start_time: null,
  start_tz: null,
  end_date: null,
  end_time: null,
  end_tz: null,
  status: 'idea',
  origin: 'user',
  suggestion_state: null,
  sort_key: 'a0',
  details: { v: 1 },
} as const;

const issues = (input: unknown) =>
  CardInsert.safeParse(input).error?.issues.map((i) => i.path.join('.')) ?? [];

describe('primitives', () => {
  it('accepts timestamps as Postgres returns them', () => {
    expect(Timestamp.safeParse('2026-11-10T16:50:00.123456+00:00').success).toBe(true);
    expect(Timestamp.safeParse('2026-11-10T16:50:00Z').success).toBe(true);
    expect(Timestamp.safeParse('2026-11-10 16:50').success).toBe(false);
  });

  it('accepts times with or without seconds', () => {
    expect(LocalTime.safeParse('09:30').success).toBe(true);
    expect(LocalTime.safeParse('09:30:00').success).toBe(true);
    expect(LocalTime.safeParse('24:00').success).toBe(false);
    expect(LocalTime.safeParse('9:30').success).toBe(false);
  });

  it('accepts only real time zones', () => {
    expect(TimeZone.safeParse('Europe/Lisbon').success).toBe(true);
    expect(TimeZone.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('sort keys', () => {
  it('generates a key between two others', () => {
    const [a, b] = sortKeysBetween(null, null, 2) as [string, string];
    const middle = sortKeyBetween(a, b);
    expect([b, middle, a].sort(compareSortKeys)).toEqual([a, middle, b]);
  });

  it('stays ordered after many inserts at the same spot', () => {
    let after = sortKeyBetween(null, null);
    const first = sortKeyBetween(null, after);
    const keys = [first, after];
    for (let i = 0; i < 200; i++) {
      after = sortKeyBetween(first, after);
      keys.push(after);
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort(compareSortKeys)[1]).toBe(after);
  });
});

describe('cards', () => {
  it('parses an unscheduled idea', () => {
    expect(CardInsert.parse(baseCard).kind).toBe('do');
  });

  it('parses a stored card with server fields', () => {
    const card = Card.parse({
      ...baseCard,
      created_by: id(3),
      created_at: '2026-11-10T16:50:00.123456+00:00',
      updated_at: '2026-11-10T16:50:00.123456+00:00',
    });
    expect(card.created_by).toBe(id(3));
  });

  it('validates details by kind', () => {
    const transport = { ...baseCard, kind: 'transport' };
    expect(issues(transport)).toEqual(['details.mode']);
    expect(issues({ ...transport, details: { v: 1, mode: 'teleport' } })).toEqual([
      'details.mode',
    ]);
    const parsed = CardInsert.parse({ ...transport, details: { v: 1, mode: 'train' } });
    expect(parsed.kind === 'transport' && parsed.details.mode).toBe('train');
    expect(issues({ ...baseCard, kind: 'eat', details: { v: 1, party_size: 0 } })).toEqual([
      'details.party_size',
    ]);
    expect(issues({ ...baseCard, details: { v: 2 } })).toEqual(['details.v']);
  });

  it('ties suggestion state to origin', () => {
    expect(issues({ ...baseCard, origin: 'suggestion' })).toEqual(['suggestion_state']);
    expect(issues({ ...baseCard, suggestion_state: 'pending' })).toEqual(['suggestion_state']);
    expect(issues({ ...baseCard, origin: 'suggestion', suggestion_state: 'pending' })).toEqual(
      [],
    );
  });

  it('keeps pending and dismissed suggestions out of the plan', () => {
    expect(isInPlan({ origin: 'user', suggestion_state: null })).toBe(true);
    expect(isInPlan({ origin: 'suggestion', suggestion_state: 'accepted' })).toBe(true);
    expect(isInPlan({ origin: 'suggestion', suggestion_state: 'pending' })).toBe(false);
    expect(isInPlan({ origin: 'suggestion', suggestion_state: 'dismissed' })).toBe(false);
  });

  it('requires complete, ordered scheduling', () => {
    const lisbon = { start_date: '2027-03-14', start_tz: 'Europe/Lisbon' };
    expect(issues({ ...baseCard, ...lisbon })).toEqual([]);
    expect(issues({ ...baseCard, start_date: '2027-03-14' })).toEqual(['start_tz']);
    expect(issues({ ...baseCard, start_time: '10:00' })).toEqual(['start_time']);
    expect(issues({ ...baseCard, end_date: '2027-03-14', end_tz: 'UTC' })).toEqual(['end_date']);
    expect(
      issues({ ...baseCard, ...lisbon, end_date: '2027-03-13', end_tz: 'Europe/Lisbon' }),
    ).toEqual(['end_date']);
    expect(
      issues({
        ...baseCard,
        ...lisbon,
        start_time: '19:00:00',
        end_date: '2027-03-14',
        end_time: '18:00',
        end_tz: 'Europe/Lisbon',
      }),
    ).toEqual(['end_time']);
  });

  it('allows a flight to land earlier on the local clock than it left', () => {
    expect(
      issues({
        ...baseCard,
        kind: 'transport',
        details: { v: 1, mode: 'flight' },
        start_date: '2027-03-14',
        start_time: '23:30',
        start_tz: 'Asia/Tokyo',
        end_date: '2027-03-14',
        end_time: '16:00',
        end_tz: 'America/Los_Angeles',
      }),
    ).toEqual([]);
  });

  it('allows an arrival place only on transport', () => {
    expect(issues({ ...baseCard, end_place_id: id(9) })).toEqual(['end_place_id']);
    expect(
      issues({
        ...baseCard,
        kind: 'transport',
        details: { v: 1, mode: 'walk' },
        end_place_id: id(9),
      }),
    ).toEqual([]);
  });

  it('rejects non-web links', () => {
    expect(issues({ ...baseCard, url: 'javascript:alert(1)' })).toEqual(['url']);
    expect(issues({ ...baseCard, url: 'https://example.com/menu' })).toEqual([]);
  });
});

describe('trips, places and links', () => {
  it('rejects a trip that ends before it starts', () => {
    const trip = { id: id(1), title: 'Lisbon', timezone: 'Europe/Lisbon' };
    expect(
      TripInsert.safeParse({ ...trip, start_date: '2027-03-14', end_date: '2027-03-17' }).success,
    ).toBe(true);
    expect(
      TripInsert.safeParse({ ...trip, start_date: '2027-03-17', end_date: '2027-03-14' }).success,
    ).toBe(false);
  });

  it('requires a provider and its id together', () => {
    const place = {
      id: id(1),
      trip_id: id(2),
      name: 'Cafe',
      lat: 38.7,
      lng: -9.1,
      address: null,
      timezone: null,
    };
    expect(
      PlaceInsert.safeParse({ ...place, provider: null, provider_place_id: null }).success,
    ).toBe(true);
    expect(
      PlaceInsert.safeParse({ ...place, provider: 'google', provider_place_id: null }).success,
    ).toBe(false);
    expect(
      PlaceInsert.safeParse({ ...place, lat: 91, provider: null, provider_place_id: null })
        .success,
    ).toBe(false);
  });

  it('rejects a link from a card to itself', () => {
    const link = { id: id(1), trip_id: id(2), from_card_id: id(3), relation: 'arrives_at' };
    expect(CardLinkInsert.safeParse({ ...link, to_card_id: id(4) }).success).toBe(true);
    expect(CardLinkInsert.safeParse({ ...link, to_card_id: id(3) }).success).toBe(false);
  });
});

describe('profiles and invites', () => {
  it('trims display names and rejects empty ones', () => {
    expect(DisplayName.parse('  Olivia ')).toBe('Olivia');
    expect(DisplayName.safeParse('   ').success).toBe(false);
  });

  it('treats an invite as live until it expires or is revoked', () => {
    const now = new Date('2027-01-10T12:00:00Z');
    const live = { expires_at: '2027-01-11T12:00:00+00:00', revoked_at: null };
    expect(isInviteLive(live, now)).toBe(true);
    expect(isInviteLive({ ...live, expires_at: '2027-01-10T11:59:00+00:00' }, now)).toBe(false);
    expect(isInviteLive({ ...live, revoked_at: '2027-01-10T09:00:00+00:00' }, now)).toBe(false);
  });

  it('never offers ownership through an invite', () => {
    expect(InviteRole.safeParse('editor').success).toBe(true);
    expect(InviteRole.safeParse('owner').success).toBe(false);
  });
});
