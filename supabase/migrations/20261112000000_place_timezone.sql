-- A place knows its time zone when the provider tells us, so that cards there
-- (a flight landing in another zone, say) are scheduled in local time.
alter table public.places
  add column timezone text check (private.is_timezone(timezone));
