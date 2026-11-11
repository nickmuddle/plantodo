-- Itinerary import: a record of each run, used for the daily limit and for
-- seeing how the feature performs. The pasted text is never stored.

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Kept when the trip is deleted, so deleting a trip does not reset the limit.
  trip_id uuid references public.trips (id) on delete set null,
  created_at timestamptz not null default now(),
  input_chars integer not null check (input_chars between 1 and 20000),
  -- Null until the model has answered; a run that never gets an answer stays null.
  drafts_returned integer check (drafts_returned >= 0),
  cards_added integer check (cards_added >= 0),
  places_resolved integer check (places_resolved >= 0),
  model text not null check (length(model) between 1 and 100)
);
create index import_runs_user_created_idx on public.import_runs (user_id, created_at desc);

grant select on public.import_runs to authenticated;
alter table public.import_runs enable row level security;

-- Rows are written only through the functions below.
create policy import_runs_select on public.import_runs for select to authenticated
  using (user_id = (select auth.uid()));

-- Starts a run: checks the caller may add to the trip, enforces the daily
-- limit, and records the run. Returns its id.
--
-- A run counts towards the limit once the model has answered. One still waiting
-- counts for two minutes, so a burst of parallel requests cannot slip past.
create function public.start_import_run(p_trip_id uuid, p_input_chars integer, p_model text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  recent integer;
  run_id uuid;
begin
  if me is null or not private.can_edit_trip(p_trip_id) then
    raise exception 'import_not_allowed' using errcode = 'insufficient_privilege';
  end if;

  -- One at a time per user, so the count below cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));

  select count(*) into recent
  from public.import_runs r
  where r.user_id = me
    and r.created_at > now() - interval '24 hours'
    and (r.drafts_returned is not null or r.created_at > now() - interval '2 minutes');

  if recent >= 10 then
    raise exception 'import_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.import_runs (user_id, trip_id, input_chars, model)
  values (me, p_trip_id, p_input_chars, p_model)
  returning id into run_id;
  return run_id;
end;
$$;

-- Records what came of a run. Each count is filled in as it becomes known;
-- arguments left null are not changed. Only the run's own user can do this.
create function public.update_import_run(
  p_run_id uuid,
  p_drafts_returned integer default null,
  p_cards_added integer default null,
  p_places_resolved integer default null
) returns void
language sql security definer set search_path = '' as $$
  update public.import_runs r
  set drafts_returned = coalesce(p_drafts_returned, r.drafts_returned),
      cards_added = coalesce(p_cards_added, r.cards_added),
      places_resolved = coalesce(p_places_resolved, r.places_resolved)
  where r.id = p_run_id and r.user_id = (select auth.uid());
$$;

revoke execute on function public.start_import_run(uuid, integer, text) from public;
revoke execute on function public.update_import_run(uuid, integer, integer, integer) from public;
grant execute on function public.start_import_run(uuid, integer, text) to authenticated;
grant execute on function public.update_import_run(uuid, integer, integer, integer) to authenticated;
