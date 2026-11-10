import { randomUUID } from 'node:crypto';
import {
  Card,
  CARD_KINDS,
  CARD_ORIGINS,
  CARD_RELATIONS,
  CARD_STATUSES,
  CardLink,
  PLACE_PROVIDERS,
  Place,
  SUGGESTION_STATES,
  sortKeyBetween,
  sortKeysBetween,
  Trip,
  TRIP_ROLES,
  TripMember,
} from '@plantodotdo/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, createTestDb, type Query, type TestDb } from './harness';

// These tests need a Postgres with PostGIS. CI provides one; locally, set
// DATABASE_URL to a superuser connection (see the README).
describe.skipIf(!adminUrl)('database schema', () => {
  let db: TestDb;
  let owner: string;
  let editor: string;
  let viewer: string;
  let stranger: string;
  let tripId: string;

  const insertCard = (query: Query, values: Record<string, unknown>) => {
    const row = { trip_id: tripId, kind: 'do', title: 'Card', sort_key: 'a0', ...values };
    const columns = Object.keys(row);
    return query(
      `insert into cards (${columns.join(', ')})
       values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(row),
    );
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await db.newUser();
    editor = await db.newUser();
    viewer = await db.newUser();
    stranger = await db.newUser();
    tripId = await db.as(owner, async (query) => {
      const [trip] = await query<{ id: string }>(
        `insert into trips (title, timezone) values ('Lisbon', 'Europe/Lisbon') returning id`,
      );
      await query(
        `insert into trip_members (trip_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')`,
        [trip!.id, editor, viewer],
      );
      return trip!.id;
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('rows match the domain schemas', () => {
    it('trip and members', async () => {
      await db.as(owner, async (query) => {
        const [trip] = await query('select * from trips where id = $1', [tripId]);
        expect(Trip.parse(trip)).toMatchObject({ title: 'Lisbon', created_by: owner });
        const members = await query('select * from trip_members where trip_id = $1', [tripId]);
        expect(members.map((m) => TripMember.parse(m).role).sort()).toEqual([
          'editor',
          'owner',
          'viewer',
        ]);
      });
    });

    it('place, card and link', async () => {
      await db.as(editor, async (query) => {
        const [hotel] = await query(
          `insert into places (trip_id, name, lat, lng, provider, provider_place_id)
           values ($1, 'Hotel', 38.7139, -9.1394, 'google', 'abc') returning
           id, trip_id, name, lat, lng, address, provider, provider_place_id,
           created_by, created_at, updated_at`,
          [tripId],
        );
        const place = Place.parse(hotel);

        const [stayRow] = await insertCard(query, {
          kind: 'stay',
          title: 'Hotel',
          place_id: place.id,
          start_date: '2027-03-14',
          start_time: '15:00',
          start_tz: 'Europe/Lisbon',
          end_date: '2027-03-17',
          end_tz: 'Europe/Lisbon',
          status: 'booked',
        });
        const stay = Card.parse(stayRow);
        expect(stay).toMatchObject({ kind: 'stay', start_time: '15:00:00', origin: 'user' });

        const [walkRow] = await insertCard(query, {
          kind: 'transport',
          title: 'Walk to dinner',
          details: { v: 1, mode: 'walk', duration_seconds: 600 },
          origin: 'suggestion',
          suggestion_state: 'pending',
          sort_key: 'a1',
        });
        const walk = Card.parse(walkRow);

        const [link] = await query(
          `insert into card_links (trip_id, from_card_id, to_card_id, relation)
           values ($1, $2, $3, 'departs_from') returning *`,
          [tripId, walk.id, stay.id],
        );
        expect(CardLink.parse(link).relation).toBe('departs_from');
      });
    });

    it('accepts every enum value the domain defines, and nothing else', async () => {
      await db.as(owner, async (query) => {
        for (const kind of CARD_KINDS) {
          const details = kind === 'transport' ? { v: 1, mode: 'walk' } : { v: 1 };
          await insertCard(query, { kind, details });
        }
        for (const status of CARD_STATUSES) await insertCard(query, { status });
        for (const origin of CARD_ORIGINS) {
          for (const state of origin === 'suggestion' ? SUGGESTION_STATES : [null]) {
            await insertCard(query, { origin, suggestion_state: state });
          }
        }
        for (const provider of PLACE_PROVIDERS) {
          await query(
            `insert into places (trip_id, name, lat, lng, provider, provider_place_id)
             values ($1, 'P', 0, 0, $2, 'x')`,
            [tripId, provider],
          );
        }
        const a = await insertCard(query, {});
        const b = await insertCard(query, {});
        for (const relation of CARD_RELATIONS) {
          await query(
            `insert into card_links (trip_id, from_card_id, to_card_id, relation)
             values ($1, $2, $3, $4)`,
            [tripId, a[0]!.id, b[0]!.id, relation],
          );
        }
      });
      for (const role of TRIP_ROLES) {
        const user = await db.newUser();
        await db.admin.query(
          'insert into trip_members (trip_id, user_id, role) values ($1, $2, $3)',
          [tripId, user, role],
        );
        await db.admin.query('delete from trip_members where user_id = $1', [user]);
      }

      const rejected: [string, Record<string, unknown>][] = [
        ['kind', { kind: 'party' }],
        ['status', { status: 'maybe' }],
        ['origin', { origin: 'robot' }],
        ['suggestion_state', { origin: 'suggestion', suggestion_state: 'ignored' }],
      ];
      for (const [, values] of rejected) {
        await expect(db.as(owner, (query) => insertCard(query, values))).rejects.toThrow(
          /check constraint/,
        );
      }
    });
  });

  describe('constraints', () => {
    const rejects = (values: Record<string, unknown>, pattern: RegExp) =>
      expect(db.as(owner, (query) => insertCard(query, values))).rejects.toThrow(pattern);

    it('ties suggestion_state to origin', async () => {
      await rejects({ origin: 'user', suggestion_state: 'pending' }, /suggestion_state/);
      await rejects({ origin: 'suggestion' }, /suggestion_state/);
    });

    it('requires a date and zone together, and a start before an end', async () => {
      await rejects({ start_date: '2027-03-14' }, /start_is_complete/);
      await rejects({ start_time: '10:00' }, /start_is_complete/);
      await rejects({ end_date: '2027-03-14', end_tz: 'UTC' }, /end_needs_start/);
      await rejects({ start_date: '2027-03-14', start_tz: 'Mars/Olympus' }, /start_tz/);
    });

    it('compares start and end as instants across zones', async () => {
      const flight = {
        kind: 'transport',
        details: { v: 1, mode: 'flight' },
        start_date: '2027-03-14',
        start_time: '23:30',
        start_tz: 'Asia/Tokyo',
        end_date: '2027-03-14',
        end_tz: 'America/Los_Angeles',
      };
      // Leaves Tokyo late on the 14th, lands in Los Angeles earlier that same local day.
      await db.as(owner, (query) => insertCard(query, { ...flight, end_time: '16:00' }));
      await rejects({ ...flight, end_time: '06:00' }, /ends before it starts/);
    });

    it('requires versioned details, a mode on transport, and an arrival place only on transport', async () => {
      await rejects({ kind: 'transport' }, /transport_has_mode/);
      await rejects({ details: {} }, /details/);
      await rejects({ details: '[1]' }, /details/);
      const placeId = await db.as(owner, async (query) => {
        const [place] = await query<{ id: string }>(
          `insert into places (trip_id, name, lat, lng) values ($1, 'Airport', 1, 1) returning id`,
          [tripId],
        );
        return place!.id;
      });
      await rejects({ kind: 'eat', end_place_id: placeId }, /end_place_only_for_transport/);
    });

    it('keeps a card when its place is deleted', async () => {
      await db.as(owner, async (query) => {
        const [place] = await query<{ id: string }>(
          `insert into places (trip_id, name, lat, lng) values ($1, 'Cafe', 2, 2) returning id`,
          [tripId],
        );
        const [card] = await insertCard(query, { kind: 'eat', place_id: place!.id });
        await query('delete from places where id = $1', [place!.id]);
        const [after] = await query('select trip_id, place_id from cards where id = $1', [
          card!.id,
        ]);
        expect(after).toEqual({ trip_id: tripId, place_id: null });
      });
    });

    it('rejects places and links that cross trips', async () => {
      const other = await db.as(owner, async (query) => {
        const [trip] = await query<{ id: string }>(
          `insert into trips (title, timezone) values ('Other', 'UTC') returning id`,
        );
        const [place] = await query<{ id: string }>(
          `insert into places (trip_id, name, lat, lng) values ($1, 'Elsewhere', 3, 3) returning id`,
          [trip!.id],
        );
        const [card] = await query<{ id: string }>(
          `insert into cards (trip_id, kind, title, sort_key) values ($1, 'do', 'Far', 'a0') returning id`,
          [trip!.id],
        );
        return { placeId: place!.id, cardId: card!.id };
      });
      await rejects({ place_id: other.placeId }, /foreign key/);
      await expect(
        db.as(owner, async (query) => {
          const [card] = await insertCard(query, {});
          await query(
            `insert into card_links (trip_id, from_card_id, to_card_id, relation)
             values ($1, $2, $3, 'arrives_at')`,
            [tripId, card!.id, other.cardId],
          );
        }),
      ).rejects.toThrow(/foreign key/);
    });

    it('does not let identity or authorship change', async () => {
      await expect(
        db.as(owner, async (query) => {
          const [card] = await insertCard(query, {});
          await query('update cards set created_by = $1 where id = $2', [editor, card!.id]);
        }),
      ).rejects.toThrow(/cannot be changed/);
    });

    it('bumps updated_at on change', async () => {
      const id = await db.as(owner, async (query) => (await insertCard(query, {}))[0]!.id);
      const [row] = await db.as(owner, (query) =>
        query(`update cards set title = 'Renamed' where id = $1 returning *`, [id]),
      );
      expect(new Date(row!.updated_at).getTime()).toBeGreaterThan(
        new Date(row!.created_at).getTime(),
      );
    });

    it('orders sort keys the same way the domain does', async () => {
      const other = await db.as(owner, async (query) => {
        const [trip] = await query<{ id: string }>(
          `insert into trips (title, timezone) values ('Ordering', 'UTC') returning id`,
        );
        return trip!.id;
      });
      // Keys that a locale-aware collation would order differently from code points.
      const first = sortKeysBetween(null, null, 40);
      const keys = [...first, sortKeyBetween(first[0]!, first[1]!), 'Zz', 'a0V', 'a0v'];
      await db.as(owner, async (query) => {
        for (const key of keys) {
          await query(
            `insert into cards (trip_id, kind, title, sort_key) values ($1, 'note', $2, $2)`,
            [other, key],
          );
        }
        const rows = await query<{ sort_key: string }>(
          'select sort_key from cards where trip_id = $1 order by sort_key',
          [other],
        );
        expect(rows.map((r) => r.sort_key)).toEqual([...keys].sort());
      });
    });

    it('finds places by distance', async () => {
      await db.as(owner, async (query) => {
        const [trip] = await query<{ id: string }>(
          `insert into trips (title, timezone) values ('Geo', 'UTC') returning id`,
        );
        await query(
          `insert into places (trip_id, name, lat, lng) values
           ($1, 'Near', 38.7140, -9.1390), ($1, 'Far', 41.1579, -8.6291)`,
          [trip!.id],
        );
        const rows = await query<{ name: string }>(
          `select name from places
           where trip_id = $1
             and extensions.st_dwithin(
               location,
               extensions.st_setsrid(extensions.st_makepoint(-9.1394, 38.7139), 4326)::extensions.geography,
               1000)`,
          [trip!.id],
        );
        expect(rows.map((r) => r.name)).toEqual(['Near']);
      });
    });
  });

  describe('access', () => {
    it('hides a trip and its contents from non-members', async () => {
      await db.as(stranger, async (query) => {
        for (const table of ['trips', 'trip_members', 'places', 'cards', 'card_links']) {
          expect(await query(`select * from ${table}`), table).toEqual([]);
        }
      });
    });

    it('lets members read', async () => {
      for (const user of [owner, editor, viewer]) {
        await db.as(user, async (query) => {
          expect(await query('select id from trips where id = $1', [tripId])).toHaveLength(1);
          expect(
            (await query('select id from cards where trip_id = $1', [tripId])).length,
          ).toBeGreaterThan(0);
        });
      }
    });

    it('lets editors write and stops viewers and strangers', async () => {
      const id = await db.as(editor, async (query) => (await insertCard(query, {}))[0]!.id);
      for (const user of [viewer, stranger]) {
        await expect(db.as(user, (query) => insertCard(query, {}))).rejects.toThrow(
          /row-level security/,
        );
        await db.as(user, async (query) => {
          expect(
            await query(`update cards set title = 'Hacked' where id = $1 returning id`, [id]),
          ).toEqual([]);
          expect(await query('delete from cards where id = $1 returning id', [id])).toEqual([]);
          expect(
            await query(`update trips set title = 'Hacked' where id = $1 returning id`, [tripId]),
          ).toEqual([]);
        });
      }
      await db.as(editor, async (query) => {
        expect(await query('delete from cards where id = $1 returning id', [id])).toHaveLength(1);
      });
    });

    it('does not let a user create rows in someone else’s name', async () => {
      await expect(
        db.as(editor, (query) => insertCard(query, { created_by: owner })),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.as(editor, (query) =>
          query(`insert into trips (title, timezone, created_by) values ('X', 'UTC', $1)`, [
            owner,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('reserves membership changes and trip deletion for owners', async () => {
      const guest = await db.newUser();
      await expect(
        db.as(editor, (query) =>
          query(`insert into trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`, [
            tripId,
            guest,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      await db.as(editor, async (query) => {
        expect(
          await query(
            `update trip_members set role = 'owner' where trip_id = $1 and user_id = $2 returning role`,
            [tripId, editor],
          ),
        ).toEqual([]);
        expect(await query('delete from trips where id = $1 returning id', [tripId])).toEqual([]);
      });
    });

    it('lets a member leave, and an owner delete the trip', async () => {
      const scratch = randomUUID();
      await db.as(owner, async (query) => {
        await query(`insert into trips (id, title, timezone) values ($1, 'Scratch', 'UTC')`, [
          scratch,
        ]);
        await query(
          `insert into trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`,
          [scratch, viewer],
        );
        await query(`insert into cards (trip_id, kind, title, sort_key) values ($1, 'note', 'N', 'a0')`, [
          scratch,
        ]);
      });
      await db.as(viewer, async (query) => {
        expect(
          await query('delete from trip_members where trip_id = $1 and user_id = $2 returning role', [
            scratch,
            viewer,
          ]),
        ).toHaveLength(1);
      });
      await db.as(owner, async (query) => {
        expect(await query('delete from trips where id = $1 returning id', [scratch])).toHaveLength(1);
      });
      const { rows } = await db.admin.query('select 1 from cards where trip_id = $1', [scratch]);
      expect(rows).toEqual([]);
    });
  });
});
