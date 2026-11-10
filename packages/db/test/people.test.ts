import {
  INVITE_ROLES,
  InvitePreview,
  isInviteLive,
  Profile,
  TripInvite,
} from '@plantodo/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, createTestDb, type TestDb } from './harness';

describe.skipIf(!adminUrl)('profiles, owners and invites', () => {
  let db: TestDb;
  let owner: string;
  let guest: string;
  let stranger: string;
  let tripId: string;

  const createInvite = (role: string, as = owner) =>
    db.as(as, async (query) => {
      const [invite] = await query(
        'insert into trip_invites (trip_id, role) values ($1, $2) returning *',
        [tripId, role],
      );
      return TripInvite.parse(invite);
    });

  const roleOf = async (user: string) => {
    const { rows } = await db.admin.query(
      'select role from trip_members where trip_id = $1 and user_id = $2',
      [tripId, user],
    );
    return rows[0]?.role ?? null;
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await db.newUser('olivia.owner@example.com');
    guest = await db.newUser('gus@example.com');
    stranger = await db.newUser();
    tripId = await db.as(owner, async (query) => {
      const [trip] = await query<{ id: string }>(
        `insert into trips (title, timezone) values ('Lisbon', 'Europe/Lisbon') returning id`,
      );
      return trip!.id;
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('profiles', () => {
    it('creates one for each new user, named from their email', async () => {
      await db.as(owner, async (query) => {
        const [row] = await query('select * from profiles where id = $1', [owner]);
        expect(Profile.parse(row).display_name).toBe('olivia.owner');
      });
      await db.as(stranger, async (query) => {
        const [row] = await query('select display_name from profiles where id = $1', [stranger]);
        expect(row).toEqual({ display_name: 'Traveller' });
      });
    });

    it('shows a profile only to its owner and people who share a trip', async () => {
      await db.as(guest, async (query) => {
        const rows = await query('select id from profiles');
        expect(rows.map((r) => r.id)).toEqual([guest]);
      });
    });

    it('lets a user rename themselves and nobody else', async () => {
      await db.as(owner, async (query) => {
        expect(
          await query(`update profiles set display_name = 'Olivia' where id = $1 returning id`, [
            owner,
          ]),
        ).toHaveLength(1);
        expect(
          await query(`update profiles set display_name = 'Hacked' where id = $1 returning id`, [
            guest,
          ]),
        ).toEqual([]);
      });
    });
  });

  describe('invites', () => {
    it('accepts the roles the domain defines and not owner', async () => {
      for (const role of INVITE_ROLES) await createInvite(role);
      await expect(createInvite('owner')).rejects.toThrow(/check constraint/);
    });

    it('previews an invite without signing in', async () => {
      const invite = await createInvite('editor');
      expect(isInviteLive(invite)).toBe(true);
      await db.as(null, async (query) => {
        const rows = await query('select * from invite_preview($1)', [invite.token]);
        expect(InvitePreview.parse(rows[0])).toEqual({
          trip_id: tripId,
          trip_title: 'Lisbon',
          inviter_name: 'Olivia',
          role: 'editor',
          already_member: false,
        });
        expect(await query('select * from invite_preview($1)', ['nope'])).toEqual([]);
      });
    });

    it('does not let a signed-out visitor accept or read anything else', async () => {
      const invite = await createInvite('editor');
      await expect(
        db.as(null, (query) => query('select accept_invite($1)', [invite.token])),
      ).rejects.toThrow(/permission denied/);
      for (const table of ['trips', 'trip_invites', 'profiles']) {
        await expect(db.as(null, (query) => query(`select * from ${table}`))).rejects.toThrow(
          /permission denied/,
        );
      }
    });

    it('adds the person who accepts, with the invite’s role', async () => {
      const invite = await createInvite('viewer');
      const joined = await db.as(guest, async (query) => {
        const [row] = await query<{ accept_invite: string }>('select accept_invite($1)', [
          invite.token,
        ]);
        const [trip] = await query('select title from trips where id = $1', [row!.accept_invite]);
        const names = await query('select display_name from profiles order by display_name');
        const [preview] = await query('select already_member from invite_preview($1)', [
          invite.token,
        ]);
        return { id: row!.accept_invite, trip, names, preview };
      });
      expect(joined.id).toBe(tripId);
      expect(joined.trip).toEqual({ title: 'Lisbon' });
      expect(joined.names.map((n) => n.display_name)).toEqual(['Olivia', 'gus']);
      expect(joined.preview).toEqual({ already_member: true });
      expect(await roleOf(guest)).toBe('viewer');
    });

    it('keeps an existing member’s role when they accept another invite', async () => {
      const invite = await createInvite('viewer');
      await db.as(owner, (query) => query('select accept_invite($1)', [invite.token]));
      expect(await roleOf(owner)).toBe('owner');
    });

    it('refuses expired and revoked invites', async () => {
      const expired = await createInvite('editor');
      await db.admin.query(
        `update trip_invites set expires_at = now() - interval '1 minute' where id = $1`,
        [expired.id],
      );
      const revoked = await createInvite('editor');
      await db.as(owner, (query) =>
        query('update trip_invites set revoked_at = now() where id = $1', [revoked.id]),
      );
      for (const invite of [expired, revoked]) {
        await expect(
          db.as(stranger, (query) => query('select accept_invite($1)', [invite.token])),
        ).rejects.toThrow(/no longer valid/);
        await db.as(stranger, async (query) => {
          expect(await query('select * from invite_preview($1)', [invite.token])).toEqual([]);
        });
      }
      expect(await roleOf(stranger)).toBeNull();
    });

    it('lets only owners create and see invites', async () => {
      await db.admin.query(
        `update trip_members set role = 'editor' where trip_id = $1 and user_id = $2`,
        [tripId, guest],
      );
      await expect(createInvite('viewer', guest)).rejects.toThrow(/row-level security/);
      await db.as(guest, async (query) => {
        expect(await query('select id from trip_invites')).toEqual([]);
      });
    });
  });

  describe('owners', () => {
    it('stops the last owner leaving or stepping down', async () => {
      await expect(
        db.as(owner, (query) =>
          query('delete from trip_members where trip_id = $1 and user_id = $2', [tripId, owner]),
        ),
      ).rejects.toThrow(/at least one owner/);
      await expect(
        db.as(owner, (query) =>
          query(`update trip_members set role = 'editor' where trip_id = $1 and user_id = $2`, [
            tripId,
            owner,
          ]),
        ),
      ).rejects.toThrow(/at least one owner/);
    });

    it('lets an owner step down once there is another', async () => {
      await db.as(owner, async (query) => {
        await query(
          `update trip_members set role = 'owner' where trip_id = $1 and user_id = $2`,
          [tripId, guest],
        );
        await query(
          `update trip_members set role = 'editor' where trip_id = $1 and user_id = $2`,
          [tripId, owner],
        );
      });
      expect(await roleOf(owner)).toBe('editor');
      expect(await roleOf(guest)).toBe('owner');
    });

    it('does not let a membership be moved to another user', async () => {
      await expect(
        db.as(guest, (query) =>
          query('update trip_members set user_id = $1 where trip_id = $2 and user_id = $3', [
            stranger,
            tripId,
            owner,
          ]),
        ),
      ).rejects.toThrow(/cannot be changed/);
    });

    it('still lets an owner delete the whole trip', async () => {
      await db.as(guest, async (query) => {
        expect(await query('delete from trips where id = $1 returning id', [tripId])).toHaveLength(
          1,
        );
      });
      const { rows } = await db.admin.query(
        'select 1 from trip_members where trip_id = $1 union all select 1 from trip_invites where trip_id = $1',
        [tripId],
      );
      expect(rows).toEqual([]);
    });
  });
});
