-- People and joining: a profile per user, invite links for trips, and a guard
-- so a trip always keeps at least one owner.

--------------------------------------------------------------------------------
-- Profiles
--------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Every new user gets a profile. The name starts as the part of their email
-- before the @ and is theirs to change.
create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(split_part(new.email, '@', 1)), ''),
      'Traveller'
    ), 80)
  );
  return new;
end;
$$;

create trigger users_create_profile after insert on auth.users
  for each row execute function private.create_profile();

insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(btrim(split_part(email, '@', 1)), ''), 'Traveller'), 80)
from auth.users
on conflict do nothing;

create function private.shares_trip_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs using (trip_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

grant select, update on public.profiles to authenticated;
alter table public.profiles enable row level security;

-- You can see your own profile and those of people you share a trip with.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_trip_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

--------------------------------------------------------------------------------
-- A trip always has an owner
--------------------------------------------------------------------------------

create function private.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    -- Lock the trip so two owners cannot step down at the same moment. No row
    -- means the trip itself is being deleted, which takes its members with it.
    perform 1 from public.trips t where t.id = old.trip_id for update;
    if found and not exists (
      select 1 from public.trip_members m
      where m.trip_id = old.trip_id and m.role = 'owner' and m.user_id <> old.user_id
    ) then
      raise exception 'a trip must keep at least one owner'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trip_members_keep_an_owner before update or delete on public.trip_members
  for each row execute function private.keep_an_owner();

-- A membership row is identified by its trip and user; only the role changes.
create function private.protect_membership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.trip_id <> old.trip_id or new.user_id <> old.user_id then
    raise exception 'trip_id and user_id cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trip_members_protect before update on public.trip_members
  for each row execute function private.protect_membership();

--------------------------------------------------------------------------------
-- Invite links
--------------------------------------------------------------------------------

-- Anyone holding the token can join the trip with the given role until the
-- invite expires or is revoked. Owners create and revoke invites.
create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz
);
create index trip_invites_trip_id_idx on public.trip_invites (trip_id);

create trigger trip_invites_protect before update on public.trip_invites
  for each row execute function private.protect_identity();

grant select, insert, update, delete on public.trip_invites to authenticated;
alter table public.trip_invites enable row level security;

create policy trip_invites_select on public.trip_invites for select to authenticated
  using (private.is_trip_owner(trip_id));
create policy trip_invites_insert on public.trip_invites for insert to authenticated
  with check (private.is_trip_owner(trip_id) and created_by = (select auth.uid()));
create policy trip_invites_update on public.trip_invites for update to authenticated
  using (private.is_trip_owner(trip_id)) with check (private.is_trip_owner(trip_id));
create policy trip_invites_delete on public.trip_invites for delete to authenticated
  using (private.is_trip_owner(trip_id));

-- What an invite offers, for the screen shown before joining. Callable without
-- signing in: the token is the secret. Returns no row for a bad or dead token.
create function public.invite_preview(invite_token text)
returns table (trip_id uuid, trip_title text, inviter_name text, role text, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select
    t.id,
    t.title,
    p.display_name,
    i.role,
    exists (
      select 1 from public.trip_members m
      where m.trip_id = t.id and m.user_id = (select auth.uid())
    )
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  left join public.profiles p on p.id = i.created_by
  where i.token = invite_token and i.revoked_at is null and i.expires_at > now();
$$;

-- Join the trip an invite points at. Returns the trip id. Someone who is
-- already a member keeps their current role.
create function public.accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invite public.trip_invites;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in to accept an invite' using errcode = 'insufficient_privilege';
  end if;

  select * into invite from public.trip_invites i
  where i.token = invite_token and i.revoked_at is null and i.expires_at > now();
  if not found then
    raise exception 'this invite is no longer valid' using errcode = 'no_data_found';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (invite.trip_id, me, invite.role)
  on conflict (trip_id, user_id) do nothing;

  return invite.trip_id;
end;
$$;

revoke execute on function public.invite_preview(text) from public;
revoke execute on function public.accept_invite(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;

grant execute on all functions in schema private to authenticated;
