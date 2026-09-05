-- Apply after schema.sql. Append-only writes preserve corrections and offline conflicts.
create table if not exists public.workout_entries (
  event_id uuid primary key,
  sequence bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_client_id text not null,
  session_id uuid not null,
  kind text not null check (kind in ('start','set','plan','finish','archive')),
  row_key text not null check (length(row_key) between 1 and 100),
  base_event_id uuid,
  exercise_name text,
  set_index smallint check (set_index between 0 and 50),
  weight_text text check (length(weight_text) <= 32),
  reps_text text check (length(reps_text) <= 32),
  rir_text text check (length(rir_text) <= 32),
  completed boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text) <= 200000),
  client_at timestamptz not null,
  saved_at timestamptz not null default now(),
  foreign key (user_id,profile_client_id) references public.profiles(user_id,client_id)
);
create index if not exists workout_entries_owner_sequence on public.workout_entries(user_id,sequence);
create index if not exists workout_entries_session on public.workout_entries(user_id,profile_client_id,session_id,sequence);
alter table public.workout_entries enable row level security;
revoke all on public.workout_entries from public,anon,authenticated;
grant select,insert on public.workout_entries to authenticated;
grant usage,select on sequence public.workout_entries_sequence_seq to authenticated;
create policy entries_read_own on public.workout_entries for select to authenticated using ((select auth.uid())=user_id);
create policy entries_append_own on public.workout_entries for insert to authenticated with check ((select auth.uid())=user_id);

-- Ownership must include the parent relationship, not only a client-supplied user_id.
drop policy if exists sessions_insert_own on public.workout_sessions;
drop policy if exists sessions_update_own on public.workout_sessions;
create policy sessions_insert_own on public.workout_sessions for insert to authenticated
with check ((select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=profile_id and p.user_id=(select auth.uid())));
create policy sessions_update_own on public.workout_sessions for update to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=profile_id and p.user_id=(select auth.uid())));
drop policy if exists sets_insert_own on public.exercise_sets;
drop policy if exists sets_update_own on public.exercise_sets;
create policy sets_insert_own on public.exercise_sets for insert to authenticated
with check ((select auth.uid())=user_id and exists(select 1 from public.workout_sessions s where s.id=session_id and s.profile_id=exercise_sets.profile_id and s.user_id=(select auth.uid())));
create policy sets_update_own on public.exercise_sets for update to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and exists(select 1 from public.workout_sessions s where s.id=session_id and s.profile_id=exercise_sets.profile_id and s.user_id=(select auth.uid())));

create index if not exists adaptations_profile_fk on public.adaptation_events(profile_id);
create index if not exists coach_profile_fk on public.coach_messages(profile_id);
create index if not exists sets_profile_fk on public.exercise_sets(profile_id);
drop policy if exists adaptations_insert_own on public.adaptation_events;
create policy adaptations_insert_own on public.adaptation_events for insert to authenticated
with check ((select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=profile_id and p.user_id=(select auth.uid())));
drop policy if exists coach_insert_own on public.coach_messages;
create policy coach_insert_own on public.coach_messages for insert to authenticated
with check ((select auth.uid())=user_id and exists(select 1 from public.profiles p where p.id=profile_id and p.user_id=(select auth.uid())));
