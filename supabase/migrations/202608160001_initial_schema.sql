create extension if not exists pgcrypto with schema extensions;

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 100),
  tournament_date date not null,
  status text not null check (status in ('draft', 'active', 'completed', 'archived')),
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  constraint state_matches_row check (
    state ->> 'id' = id::text
    and state ->> 'slug' = slug
    and state ->> 'name' = name
    and state ->> 'tournamentDate' = tournament_date::text
    and state ->> 'status' = status
  )
);

create index tournaments_status_date_idx on public.tournaments(status, tournament_date desc);

create table public.tournament_events (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  revision bigint not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_kind text not null check (actor_kind in ('admin', 'api_token', 'system')),
  actor_id text,
  superseded_by_venue_sync boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, revision)
);

create index tournament_events_tournament_idx on public.tournament_events(tournament_id, revision desc);

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  scopes text[] not null default array['tournaments:read'],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
  ,constraint api_tokens_scopes_allowed check (scopes <@ array['tournaments:read', 'tournaments:write']::text[])
);

create unique index app_admins_single_administrator on public.app_admins ((true));

alter table public.app_admins enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_events enable row level security;
alter table public.api_tokens enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated, service_role;

create policy "Public can read published tournaments"
on public.tournaments for select
to anon, authenticated
using (status in ('active', 'completed', 'archived') or (select public.is_app_admin()));

create policy "Administrator can read own admin record"
on public.app_admins for select
to authenticated
using (user_id = auth.uid());

revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
revoke insert, update, delete on public.tournaments from anon, authenticated;
grant select on public.tournaments to anon, authenticated;
revoke all on public.tournament_events from anon, authenticated;
revoke all on public.api_tokens from anon, authenticated;

create or replace function public.create_tournament_state(
  p_state jsonb,
  p_actor_kind text,
  p_actor_id text,
  p_event_id uuid,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.tournaments;
begin
  select t.* into created
  from public.tournaments t
  join public.tournament_events e on e.tournament_id = t.id
  where e.id = p_event_id;
  if found then return to_jsonb(created); end if;

  insert into public.tournaments (
    id, slug, name, tournament_date, status, state, revision, created_by,
    completed_at, archived_at
  ) values (
    (p_state ->> 'id')::uuid,
    p_state ->> 'slug',
    p_state ->> 'name',
    (p_state ->> 'tournamentDate')::date,
    p_state ->> 'status',
    p_state,
    1,
    p_created_by,
    nullif(p_state ->> 'completedAt', '')::timestamptz,
    nullif(p_state ->> 'archivedAt', '')::timestamptz
  ) returning * into created;

  insert into public.tournament_events(id, tournament_id, revision, action, payload, actor_kind, actor_id)
  values (p_event_id, created.id, 1, 'create_tournament', jsonb_build_object('state', p_state), p_actor_kind, p_actor_id);

  return to_jsonb(created);
end;
$$;

create or replace function public.commit_tournament_state(
  p_tournament_id uuid,
  p_expected_revision bigint,
  p_state jsonb,
  p_action text,
  p_payload jsonb,
  p_actor_kind text,
  p_actor_id text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  committed public.tournaments;
begin
  select t.* into committed
  from public.tournaments t
  join public.tournament_events e on e.tournament_id = t.id
  where e.id = p_event_id;
  if found then return to_jsonb(committed); end if;

  update public.tournaments
  set slug = p_state ->> 'slug',
      name = p_state ->> 'name',
      tournament_date = (p_state ->> 'tournamentDate')::date,
      status = p_state ->> 'status',
      state = p_state,
      revision = revision + 1,
      updated_at = now(),
      completed_at = nullif(p_state ->> 'completedAt', '')::timestamptz,
      archived_at = nullif(p_state ->> 'archivedAt', '')::timestamptz
  where id = p_tournament_id and revision = p_expected_revision
  returning * into committed;

  if not found then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  insert into public.tournament_events(id, tournament_id, revision, action, payload, actor_kind, actor_id)
  values (p_event_id, committed.id, committed.revision, p_action, coalesce(p_payload, '{}'::jsonb), p_actor_kind, p_actor_id);

  return to_jsonb(committed);
end;
$$;

create or replace function public.force_venue_tournament_state(
  p_tournament_id uuid,
  p_expected_revision bigint,
  p_last_synced_revision bigint,
  p_state jsonb,
  p_actor_id text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  committed public.tournaments;
begin
  select t.* into committed
  from public.tournaments t
  join public.tournament_events e on e.tournament_id = t.id
  where e.id = p_event_id;
  if found then return to_jsonb(committed); end if;

  update public.tournaments
  set slug = p_state ->> 'slug',
      name = p_state ->> 'name',
      tournament_date = (p_state ->> 'tournamentDate')::date,
      status = p_state ->> 'status',
      state = p_state,
      revision = revision + 1,
      updated_at = now(),
      completed_at = nullif(p_state ->> 'completedAt', '')::timestamptz,
      archived_at = nullif(p_state ->> 'archivedAt', '')::timestamptz
  where id = p_tournament_id and revision = p_expected_revision
  returning * into committed;

  if not found then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  update public.tournament_events
  set superseded_by_venue_sync = true
  where tournament_id = p_tournament_id
    and revision > p_last_synced_revision
    and revision <= p_expected_revision;

  insert into public.tournament_events(id, tournament_id, revision, action, payload, actor_kind, actor_id)
  values (
    p_event_id, committed.id, committed.revision, 'venue_force_sync',
    jsonb_build_object('overwroteRevisionsAfter', p_last_synced_revision),
    'admin', p_actor_id
  );

  return to_jsonb(committed);
end;
$$;

revoke all on function public.create_tournament_state(jsonb, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.commit_tournament_state(uuid, bigint, jsonb, text, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.force_venue_tournament_state(uuid, bigint, bigint, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.create_tournament_state(jsonb, text, text, uuid, uuid) to service_role;
grant execute on function public.commit_tournament_state(uuid, bigint, jsonb, text, jsonb, text, text, uuid) to service_role;
grant execute on function public.force_venue_tournament_state(uuid, bigint, bigint, jsonb, text, uuid) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.tournaments;
exception
  when duplicate_object then null;
end $$;
