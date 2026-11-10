import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const here = import.meta.dirname;
const migrationsDir = join(here, '../../../supabase/migrations');

export const adminUrl = process.env.DATABASE_URL;

// Return dates and times as the strings the API returns, not JS Dates.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) =>
  new Date(value).toISOString(),
);

export interface TestDb {
  admin: pg.Client;
  /** Run statements as a signed-in user, inside a transaction that is rolled back on error. */
  as<T>(userId: string, run: (query: Query) => Promise<T>): Promise<T>;
  newUser(): Promise<string>;
  close(): Promise<void>;
}

export type Query = <Row extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<Row[]>;

export async function createTestDb(): Promise<TestDb> {
  if (!adminUrl) throw new Error('DATABASE_URL is not set');
  const name = `plantodotdo_test_${randomUUID().replaceAll('-', '')}`;

  const server = new pg.Client({ connectionString: adminUrl });
  await server.connect();
  await server.query(`create database ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();

  const drop = async () => {
    await admin.end();
    await server.query(`drop database ${name} with (force)`);
    await server.end();
  };

  try {
    await admin.query(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
    for (const file of readdirSync(migrationsDir).sort()) {
      await admin.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
  } catch (error) {
    await drop();
    throw error;
  }

  return {
    admin,
    async as(userId, run) {
      await admin.query('begin');
      try {
        await admin.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: 'authenticated' }),
        ]);
        await admin.query('set local role authenticated');
        const result = await run(async (sql, params) => (await admin.query(sql, params)).rows);
        await admin.query('commit');
        return result;
      } catch (error) {
        await admin.query('rollback');
        throw error;
      }
    },
    async newUser() {
      const id = randomUUID();
      await admin.query('insert into auth.users (id) values ($1)', [id]);
      return id;
    },
    close: drop,
  };
}
