-- Profile deletion is one transaction: journal rows must follow their parent.
-- This changes no existing profile or workout data and keeps all ownership policies intact.
alter table public.workout_entries
  drop constraint workout_entries_user_id_profile_client_id_fkey,
  add constraint workout_entries_user_id_profile_client_id_fkey
    foreign key (user_id, profile_client_id)
    references public.profiles(user_id, client_id) on delete cascade;
