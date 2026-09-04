-- Iron Six Training cloud schema
-- Dedicated project only. Browser clients use the publishable key + Supabase Auth.
-- RLS is enabled on every exposed table and every policy checks auth.uid().

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 3 and 100),
  display_name text not null check (char_length(display_name) between 1 and 60),
  body_weight_lb numeric(6,2),
  age smallint check (age is null or age between 13 and 100),
  height_in numeric(5,2) check (height_in is null or height_in between 48 and 90),
  training_level text not null default 'unknown' check (training_level in ('unknown','beginner','intermediate','advanced')),
  bench_reference text,
  equipment jsonb not null default '{}'::jsonb,
  capacities jsonb not null default '{}'::jsonb,
  workout_minutes smallint not null default 60 check (workout_minutes between 10 and 120),
  readiness jsonb not null default '{"energy":4,"soreness":1}'::jsonb,
  program_state jsonb not null default '{}'::jsonb,
  runtime_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_session_id text,
  workout_key text not null,
  workout_name text not null,
  variant text,
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 1 and 240),
  readiness jsonb not null default '{}'::jsonb,
  planned_sets smallint,
  completed_sets smallint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(profile_id, client_session_id)
);

create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_name text not null,
  movement_base text,
  seed_key text,
  set_index smallint not null check (set_index >= 0),
  suggested_weight_lb numeric(7,2),
  actual_weight_lb numeric(7,2),
  reps numeric(6,2),
  rir numeric(4,1),
  completed boolean not null default false,
  performed_at timestamptz not null default now(),
  unique(session_id, exercise_name, set_index)
);

create table if not exists public.adaptation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists workout_sessions_user_profile_idx on public.workout_sessions(user_id, profile_id, started_at desc);
create index if not exists exercise_sets_user_profile_exercise_idx on public.exercise_sets(user_id, profile_id, exercise_name, performed_at desc);
create index if not exists exercise_sets_session_idx on public.exercise_sets(session_id, set_index);
create index if not exists adaptation_events_user_profile_idx on public.adaptation_events(user_id, profile_id, created_at desc);
create index if not exists coach_messages_user_profile_idx on public.coach_messages(user_id, profile_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.adaptation_events enable row level security;
alter table public.coach_messages enable row level security;

-- New Supabase projects no longer expose new public tables to the Data API automatically.
-- Explicit grants are therefore part of the schema. Anonymous users get no training data access.
revoke all on public.profiles, public.workout_sessions, public.exercise_sets, public.adaptation_events, public.coach_messages from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.workout_sessions, public.exercise_sets, public.adaptation_events, public.coach_messages to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "sessions_select_own" on public.workout_sessions;
drop policy if exists "sessions_insert_own" on public.workout_sessions;
drop policy if exists "sessions_update_own" on public.workout_sessions;
drop policy if exists "sessions_delete_own" on public.workout_sessions;
create policy "sessions_select_own" on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions_insert_own" on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions_update_own" on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions_delete_own" on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "sets_select_own" on public.exercise_sets;
drop policy if exists "sets_insert_own" on public.exercise_sets;
drop policy if exists "sets_update_own" on public.exercise_sets;
drop policy if exists "sets_delete_own" on public.exercise_sets;
create policy "sets_select_own" on public.exercise_sets for select to authenticated using ((select auth.uid()) = user_id);
create policy "sets_insert_own" on public.exercise_sets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sets_update_own" on public.exercise_sets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sets_delete_own" on public.exercise_sets for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "adaptations_select_own" on public.adaptation_events;
drop policy if exists "adaptations_insert_own" on public.adaptation_events;
drop policy if exists "adaptations_delete_own" on public.adaptation_events;
create policy "adaptations_select_own" on public.adaptation_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "adaptations_insert_own" on public.adaptation_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "adaptations_delete_own" on public.adaptation_events for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "coach_select_own" on public.coach_messages;
drop policy if exists "coach_insert_own" on public.coach_messages;
drop policy if exists "coach_delete_own" on public.coach_messages;
create policy "coach_select_own" on public.coach_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "coach_insert_own" on public.coach_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "coach_delete_own" on public.coach_messages for delete to authenticated using ((select auth.uid()) = user_id);
