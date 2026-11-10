# Plantodo

Collaborative trip planning for web, Android and iOS. People build an itinerary
together out of cards: places to stay, places to eat, things to do, travel and notes.

## Layout

| Path | What it is |
|---|---|
| `apps/app` | The Expo app (one codebase for iOS, Android and web) |
| `packages/domain` | The trip model as Zod schemas and TypeScript types, shared by app and server |
| `supabase/migrations` | The Postgres schema and access rules |
| `supabase/functions` | Server-side functions; `places` is place search |
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

## Running the app against a local backend

The Supabase CLI runs the database, sign-in service and data API in Docker:

```sh
pnpm supabase start                    # applies everything in supabase/migrations
pnpm supabase status                   # prints the API URL and publishable key
cp apps/app/.env.example apps/app/.env.local   # then paste those two values in
pnpm app
```

Sign-in is by a six-digit code sent by email. Locally no email leaves your
machine: open the mail viewer at http://127.0.0.1:54324 to read the code.

## Google Maps

Place search and the map use Google Maps Platform, with two separate keys:

| Key | Used for | Where it lives | Restrict it to |
|---|---|---|---|
| Server key | Place search (`supabase/functions/places`) | A Supabase secret, never in the app | Places API (New) |
| Browser key | The map in the web app | `EXPO_PUBLIC_GOOGLE_MAPS_KEY`, visible to users | Maps JavaScript API and your site's address |

Locally, put the server key in `supabase/functions/.env` (not committed) and
serve the function:

```sh
echo "GOOGLE_MAPS_SERVER_KEY=your-key" > supabase/functions/.env
pnpm supabase functions serve --env-file supabase/functions/.env
```

On a hosted project:

```sh
pnpm supabase secrets set GOOGLE_MAPS_SERVER_KEY=your-key
pnpm supabase functions deploy places
```

Only signed-in users can search. Without the browser key the map view still
lists the trip's places; it just draws no map. On phones the map view is that
list, with each place opening in the device's maps app.

## Pointing at a hosted Supabase project

1. `pnpm supabase link` and `pnpm supabase db push` to apply the migrations.
2. Put the project's URL and publishable key in `apps/app/.env.local`.
3. In the dashboard, under Authentication > Emails, set the "Magic Link" and
   "Confirm signup" templates to the contents of
   `supabase/templates/sign-in-code.html`. Without this, sign-in emails contain
   a link and no code, and nobody can sign in.
4. Set `EXPO_PUBLIC_APP_URL` to the public web address of the app so invite
   links point at it.

## Changing the model

A change to cards, places or links touches three things together: the schema in
`packages/domain`, a new migration in `supabase/migrations`, and the tests in
`packages/db` that hold the two in agreement.
