-- Core trip model: trips, members, places, cards and links between cards.
-- The TypeScript mirror of this schema is packages/domain; packages/db tests
-- that the two agree.

create extension if not exists postgis with schema extensions;

-- Helpers used by constraints and row-level security. Kept out of `public` so
-- the API does not expose them as callable endpoints.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_timezone(tz text) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Identity and authorship never change after insert. `trip_id` is skipped for
-- tables that have no such column (trips).
create function private.protect_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if to_jsonb(new) -> 'id' is distinct from to_jsonb(old) -> 'id'
    or to_jsonb(new) -> 'trip_id' is distinct from to_jsonb(old) -> 'trip_id'
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'id, trip_id, created_by and created_at cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Trips and members
--------------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  start_date date,
  end_date date,
  timezone text not null check (private.is_timezone(timezone)),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_id_idx on public.trip_members (user_id);

-- Membership checks run as the table owner so that policies on trip_members
-- can call them without recursing into themselves.
create function private.is_trip_member(trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = trip and m.user_id = (select auth.uid())
  );
$$;

create function private.can_edit_trip(trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = trip and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

create function private.is_trip_owner(trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = trip and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function private.add_trip_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger trips_add_owner after insert on public.trips
  for each row execute function private.add_trip_owner();
create trigger trips_touch before update on public.trips
  for each row execute function private.touch_updated_at();
create trigger trips_protect before update on public.trips
  for each row execute function private.protect_identity();

--------------------------------------------------------------------------------
-- Places
--------------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Derived from lat/lng so clients read and write plain numbers while
  -- distance queries use the spatial index.
  location extensions.geography (point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  ) stored,
  address text check (length(address) <= 500),
  provider text check (provider in ('google', 'mapbox', 'osm')),
  provider_place_id text check (length(provider_place_id) between 1 and 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((provider is null) = (provider_place_id is null)),
  unique (trip_id, id),
  unique (trip_id, provider, provider_place_id)
);
create index places_location_idx on public.places using gist (location);

create trigger places_touch before update on public.places
  for each row execute function private.touch_updated_at();
create trigger places_protect before update on public.places
  for each row execute function private.protect_identity();

--------------------------------------------------------------------------------
-- Cards
--------------------------------------------------------------------------------

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('stay', 'eat', 'do', 'transport', 'note')),
  title text not null check (length(btrim(title)) between 1 and 200),
  notes text check (length(notes) <= 10000),
  url text check (url ~ '^https?://'),

  place_id uuid,
  end_place_id uuid,

  -- Local wall-clock times, each with its own IANA zone.
  start_date date,
  start_time time,
  start_tz text check (private.is_timezone(start_tz)),
  end_date date,
  end_time time,
  end_tz text check (private.is_timezone(end_tz)),

  status text not null default 'idea'
    check (status in ('idea', 'planned', 'booked', 'done')),
  origin text not null default 'user'
    check (origin in ('user', 'suggestion', 'import')),
  suggestion_state text
    check (suggestion_state in ('pending', 'accepted', 'dismissed')),

  -- Kind-specific fields, validated by packages/domain. `v` is the shape version.
  details jsonb not null default '{"v": 1}'
    check (jsonb_typeof(details -> 'v') is not distinct from 'number'),

  -- Fractional index; must compare by code point, hence the "C" collation.
  sort_key text collate "C" not null check (sort_key ~ '^[0-9A-Za-z]+$'),

  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (trip_id, id),
  -- A card's places must belong to the card's trip. Deleting a place clears
  -- the reference and keeps the card.
  foreign key (trip_id, place_id) references public.places (trip_id, id)
    on delete set null (place_id),
  foreign key (trip_id, end_place_id) references public.places (trip_id, id)
    on delete set null (end_place_id),

  constraint cards_suggestion_state_matches_origin
    check ((origin = 'suggestion') = (suggestion_state is not null)),
  constraint cards_end_place_only_for_transport
    check (end_place_id is null or kind = 'transport'),
  constraint cards_transport_has_mode
    check (kind <> 'transport' or jsonb_typeof(details -> 'mode') is not distinct from 'string'),
  constraint cards_start_is_complete
    check ((start_date is null) = (start_tz is null)
      and (start_time is null or start_date is not null)),
  constraint cards_end_is_complete
    check ((end_date is null) = (end_tz is null)
      and (end_time is null or end_date is not null)),
  constraint cards_end_needs_start
    check (end_date is null or start_date is not null)
);
create index cards_trip_order_idx on public.cards (trip_id, start_date, sort_key);
create index cards_place_id_idx on public.cards (place_id);
create index cards_end_place_id_idx on public.cards (end_place_id);

-- A card must not end before it starts. Zones can differ, so compare instants.
create function private.check_card_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.end_date is not null
    and (new.end_date + coalesce(new.end_time, time '23:59:59')) at time zone new.end_tz
      < (new.start_date + coalesce(new.start_time, time '00:00')) at time zone new.start_tz
  then
    raise exception 'card ends before it starts' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger cards_check_times before insert or update on public.cards
  for each row execute function private.check_card_times();
create trigger cards_touch before update on public.cards
  for each row execute function private.touch_updated_at();
create trigger cards_protect before update on public.cards
  for each row execute function private.protect_identity();

--------------------------------------------------------------------------------
-- Links between cards
--------------------------------------------------------------------------------

create table public.card_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_card_id uuid not null,
  to_card_id uuid not null,
  relation text not null check (relation in ('departs_from', 'arrives_at')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (from_card_id <> to_card_id),
  -- Both ends must be cards in this trip.
  foreign key (trip_id, from_card_id) references public.cards (trip_id, id) on delete cascade,
  foreign key (trip_id, to_card_id) references public.cards (trip_id, id) on delete cascade,
  -- A transport card departs from one card and arrives at one card.
  unique (from_card_id, relation)
);
create index card_links_trip_id_idx on public.card_links (trip_id);
create index card_links_to_card_id_idx on public.card_links (to_card_id);

create trigger card_links_protect before update on public.card_links
  for each row execute function private.protect_identity();

--------------------------------------------------------------------------------
-- Access: only trip members can read; owners and editors can write.
--------------------------------------------------------------------------------

grant execute on all functions in schema private to authenticated;
grant select, insert, update, delete
  on public.trips, public.trip_members, public.places, public.cards, public.card_links
  to authenticated;

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.places enable row level security;
alter table public.cards enable row level security;
alter table public.card_links enable row level security;

-- The creator clause lets `insert ... returning` see the new trip before the
-- owner membership row is visible to the statement.
create policy trips_select on public.trips for select to authenticated
  using (created_by = (select auth.uid()) or private.is_trip_member(id));
create policy trips_insert on public.trips for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy trips_update on public.trips for update to authenticated
  using (private.can_edit_trip(id)) with check (private.can_edit_trip(id));
create policy trips_delete on public.trips for delete to authenticated
  using (private.is_trip_owner(id));

create policy trip_members_select on public.trip_members for select to authenticated
  using (private.is_trip_member(trip_id));
create policy trip_members_insert on public.trip_members for insert to authenticated
  with check (private.is_trip_owner(trip_id));
create policy trip_members_update on public.trip_members for update to authenticated
  using (private.is_trip_owner(trip_id)) with check (private.is_trip_owner(trip_id));
-- Owners remove anyone; other members can remove themselves.
create policy trip_members_delete on public.trip_members for delete to authenticated
  using (private.is_trip_owner(trip_id) or user_id = (select auth.uid()));

create policy places_select on public.places for select to authenticated
  using (private.is_trip_member(trip_id));
create policy places_insert on public.places for insert to authenticated
  with check (private.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy places_update on public.places for update to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy places_delete on public.places for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy cards_select on public.cards for select to authenticated
  using (private.is_trip_member(trip_id));
create policy cards_insert on public.cards for insert to authenticated
  with check (private.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy cards_update on public.cards for update to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy cards_delete on public.cards for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy card_links_select on public.card_links for select to authenticated
  using (private.is_trip_member(trip_id));
create policy card_links_insert on public.card_links for insert to authenticated
  with check (private.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy card_links_update on public.card_links for update to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy card_links_delete on public.card_links for delete to authenticated
  using (private.can_edit_trip(trip_id));
