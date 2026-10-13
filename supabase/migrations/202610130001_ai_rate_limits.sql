-- Durable per-user limits for the AI endpoints (api/_lib/ai-guard.js).
-- The Vercel functions call ai_rate_hit with the signed-in user's own token, so the counter is
-- always keyed on auth.uid() and a client can only ever spend its own allowance.
-- Adds one table and one function; changes no existing profile or workout data.
create table if not exists public.ai_rate_hits (
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null check (route in ('coach', 'recalculate', 'review', 'equipment')),
  window_seconds integer not null check (window_seconds in (600, 86400)),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, route, window_seconds, window_start)
);

-- No policies: only the security-definer function below reads or writes this table.
alter table public.ai_rate_hits enable row level security;
revoke all on table public.ai_rate_hits from anon, authenticated;

create or replace function public.ai_rate_hit(p_route text, p_burst_limit integer, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  burst_start timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  day_start timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  burst_hits integer;
  day_hits integer;
begin
  if uid is null then
    return false;
  end if;
  if p_route not in ('coach', 'recalculate', 'review', 'equipment')
     or p_burst_limit not between 1 and 1000
     or p_daily_limit not between 1 and 10000 then
    raise exception 'invalid AI rate limit request';
  end if;

  select coalesce(sum(hits) filter (where window_seconds = 600 and window_start = burst_start), 0),
         coalesce(sum(hits) filter (where window_seconds = 86400 and window_start = day_start), 0)
    into burst_hits, day_hits
    from public.ai_rate_hits
   where user_id = uid and route = p_route;

  if burst_hits >= p_burst_limit or day_hits >= p_daily_limit then
    return false;
  end if;

  insert into public.ai_rate_hits as h (user_id, route, window_seconds, window_start, hits)
  values (uid, p_route, 600, burst_start, 1), (uid, p_route, 86400, day_start, 1)
  on conflict (user_id, route, window_seconds, window_start) do update set hits = h.hits + 1;

  delete from public.ai_rate_hits where user_id = uid and window_start < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.ai_rate_hit(text, integer, integer) from public, anon;
grant execute on function public.ai_rate_hit(text, integer, integer) to authenticated;
