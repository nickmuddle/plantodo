# Plantodotdo

Collaborative trip planning for web, Android and iOS. People build an itinerary
together out of cards: places to stay, places to eat, things to do, travel and notes.

## Layout

| Path | What it is |
|---|---|
| `apps/app` | The Expo app (one codebase for iOS, Android and web) |
| `packages/domain` | The trip model as Zod schemas and TypeScript types, shared by app and server |
| `supabase/migrations` | The Postgres schema and access rules |
| `packages/db` | Tests that run the migrations and check them against the domain package |

## The model

- **Place**: a real-world location with coordinates. Belongs to one trip.
- **Card**: one intention in a trip's plan. Has a kind (`stay`, `eat`, `do`,
  `transport`, `note`), a status, optional scheduling and kind-specific `details`.
- **Link**: a directed relation between two cards, such as a transport card that
  departs from one card and arrives at another.

Suggestions are ordinary cards with `origin: 'suggestion'` and a
`suggestion_state`, so they render and validate like any other card.

A scheduled card stores local dates and times with an IANA time zone for each
end. Cards are ordered by a fractional `sort_key`, so moving one card never
rewrites its neighbours.

## Working on it

Needs Node 22+ and pnpm.

```sh
pnpm install
pnpm app          # start the Expo dev server
pnpm typecheck
pnpm lint
pnpm test
```

The database tests need a Postgres server with PostGIS available and are skipped
without one. Point `DATABASE_URL` at a superuser connection; each run creates and
drops its own database:

```sh
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgis/postgis:17-3.5
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test
```

To run the full backend locally, use the Supabase CLI: `npx supabase start`.

## Changing the model

A change to cards, places or links touches three things together: the schema in
`packages/domain`, a new migration in `supabase/migrations`, and the tests in
`packages/db` that hold the two in agreement.
