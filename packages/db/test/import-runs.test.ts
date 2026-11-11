import { IMPORT_DAILY_LIMIT, IMPORT_MAX_CHARS, ImportRun } from '@plantodo/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, createTestDb, type TestDb } from './harness';

describe.skipIf(!adminUrl)('import runs', () => {
  let db: TestDb;
  let owner: string;
  let editor: string;
  let viewer: string;
  let stranger: string;
  let tripId: string;

  const start = (user: string | null, trip = tripId, chars = 500) =>
    db.as(user, async (query) => {
      const [row] = await query<{ id: string }>(
        `select start_import_run($1, $2, 'test-model') as id`,
        [trip, chars],
      );
      return row!.id;
    });

  /** Marks a run as answered by the model, as the import function does. */
  const answer = (user: string, runId: string, drafts = 5) =>
    db.as(user, (query) => query('select update_import_run($1, $2)', [runId, drafts]));

  const clearRuns = () => db.admin.query('delete from import_runs');

  beforeAll(async () => {
    db = await createTestDb();
    owner = await db.newUser();
    editor = await db.newUser();
    viewer = await db.newUser();
    stranger = await db.newUser();
    tripId = await db.as(owner, async (query) => {
      const [trip] = await query<{ id: string }>(
        `insert into trips (title, timezone) values ('Lisbon', 'UTC') returning id`,
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

  it('has no column that could hold the pasted text', async () => {
    const { rows } = await db.admin.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'import_runs' order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(Object.keys(ImportRun.shape).sort());
  });

  it('lets owners and editors start a run, and records it', async () => {
    await clearRuns();
    await start(owner);
    const id = await start(editor, tripId, 1234);
    await db.as(editor, async (query) => {
      const rows = await query('select * from import_runs');
      expect(rows).toHaveLength(1);
      expect(ImportRun.parse(rows[0])).toMatchObject({
        id,
        user_id: editor,
        trip_id: tripId,
        input_chars: 1234,
        drafts_returned: null,
        cards_added: null,
        places_resolved: null,
        model: 'test-model',
      });
    });
  });

  it('refuses viewers, non-members, unknown trips and signed-out callers alike', async () => {
    await clearRuns();
    for (const user of [viewer, stranger]) {
      await expect(start(user)).rejects.toThrow(/import_not_allowed/);
    }
    await expect(start(owner, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      /import_not_allowed/,
    );
    await expect(start(null)).rejects.toThrow(/permission denied/);
    const { rows } = await db.admin.query('select 1 from import_runs');
    expect(rows).toEqual([]);
  });

  it('rejects input sizes outside the limit', async () => {
    await expect(start(owner, tripId, 0)).rejects.toThrow(/check constraint/);
    await expect(start(owner, tripId, IMPORT_MAX_CHARS + 1)).rejects.toThrow(/check constraint/);
    await start(owner, tripId, IMPORT_MAX_CHARS);
  });

  it('stops at the daily limit, per user', async () => {
    await clearRuns();
    for (let i = 0; i < IMPORT_DAILY_LIMIT; i++) await answer(owner, await start(owner));
    await expect(start(owner)).rejects.toThrow(/import_rate_limited/);
    await start(editor);
  });

  it('frees up the limit as runs pass 24 hours old', async () => {
    await clearRuns();
    for (let i = 0; i < IMPORT_DAILY_LIMIT; i++) await answer(owner, await start(owner));
    await db.admin.query(
      `update import_runs set created_at = now() - interval '25 hours'
       where id = (select id from import_runs limit 1)`,
    );
    await start(owner);
    await expect(start(owner)).rejects.toThrow(/import_rate_limited/);
  });

  it('counts a run still waiting on the model, but not one that never got an answer', async () => {
    await clearRuns();
    for (let i = 0; i < IMPORT_DAILY_LIMIT; i++) await start(owner);
    await expect(start(owner)).rejects.toThrow(/import_rate_limited/);
    await db.admin.query(`update import_runs set created_at = now() - interval '3 minutes'`);
    await start(owner);
  });

  it('lets a user fill in their own run and nobody else’s', async () => {
    await clearRuns();
    const id = await start(owner);
    await db.as(owner, (query) => query('select update_import_run($1, 12)', [id]));
    await db.as(editor, (query) => query('select update_import_run($1, 99, 99, 99)', [id]));
    await db.as(owner, (query) =>
      query('select update_import_run($1, p_cards_added => 9, p_places_resolved => 4)', [id]),
    );
    const { rows } = await db.admin.query(
      'select drafts_returned, cards_added, places_resolved from import_runs where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ drafts_returned: 12, cards_added: 9, places_resolved: 4 });
  });

  it('shows users only their own runs, and no way to write them directly', async () => {
    await clearRuns();
    await start(owner);
    await db.as(editor, async (query) => {
      expect(await query('select * from import_runs')).toEqual([]);
    });
    await expect(
      db.as(owner, (query) =>
        query(
          `insert into import_runs (user_id, trip_id, input_chars, model) values ($1, $2, 1, 'x')`,
          [owner, tripId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as(owner, (query) => query('delete from import_runs'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('keeps the run when its trip is deleted', async () => {
    await clearRuns();
    const scratch = await db.as(owner, async (query) => {
      const [trip] = await query<{ id: string }>(
        `insert into trips (title, timezone) values ('Scratch', 'UTC') returning id`,
      );
      return trip!.id;
    });
    const id = await start(owner, scratch);
    await db.as(owner, (query) => query('delete from trips where id = $1', [scratch]));
    const { rows } = await db.admin.query('select trip_id from import_runs where id = $1', [id]);
    expect(rows).toEqual([{ trip_id: null }]);
  });
});
