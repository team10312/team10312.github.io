create extension if not exists pgcrypto;

create table if not exists public.scouting_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  event_code text not null unique,
  location text,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_scout_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.scouting_events(id) on delete cascade,
  team_number integer not null check (team_number > 0),
  match_number integer not null check (match_number > 0),
  match_type text not null check (match_type in ('Practice', 'Qualification', 'Playoff')),
  alliance_color text not null check (alliance_color in ('Blue', 'Red')),
  shift_1_alliance text not null default 'Blue' check (shift_1_alliance in ('Blue', 'Red')),
  station integer not null check (station between 1 and 3),
  scout_name text not null,
  auto_fuel integer not null default 0 check (auto_fuel >= 0),
  auto_tower_result text not null default 'None' check (auto_tower_result in ('None', 'Partial', 'Complete')),
  transition_fuel integer not null default 0 check (transition_fuel >= 0),
  shift_1_fuel integer not null default 0 check (shift_1_fuel >= 0),
  shift_2_fuel integer not null default 0 check (shift_2_fuel >= 0),
  shift_3_fuel integer not null default 0 check (shift_3_fuel >= 0),
  shift_4_fuel integer not null default 0 check (shift_4_fuel >= 0),
  endgame_fuel integer not null default 0 check (endgame_fuel >= 0),
  endgame_tower_result text not null default 'None' check (endgame_tower_result in ('None', 'Partial', 'Complete')),
  defense_rating integer not null default 0 check (defense_rating between 0 and 5),
  penalty_count integer not null default 0 check (penalty_count >= 0),
  breakdown boolean not null default false,
  no_show boolean not null default false,
  notes text not null default '',
  constraint match_scout_entries_shift_fuel_guard check (
    (
      alliance_color = shift_1_alliance and
      shift_2_fuel = 0 and
      shift_4_fuel = 0
    ) or (
      alliance_color <> shift_1_alliance and
      shift_1_fuel = 0 and
      shift_3_fuel = 0
    )
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists match_scout_entries_event_team_idx
  on public.match_scout_entries (event_id, team_number, created_at desc);

create index if not exists match_scout_entries_event_match_idx
  on public.match_scout_entries (event_id, match_number, created_at desc);

alter table if exists public.match_scout_entries
  add column if not exists shift_1_alliance text not null default 'Blue'
  check (shift_1_alliance in ('Blue', 'Red'));

alter table if exists public.match_scout_entries
  drop constraint if exists match_scout_entries_shift_fuel_guard;

alter table if exists public.match_scout_entries
  add constraint match_scout_entries_shift_fuel_guard check (
    (
      alliance_color = shift_1_alliance and
      shift_2_fuel = 0 and
      shift_4_fuel = 0
    ) or (
      alliance_color <> shift_1_alliance and
      shift_1_fuel = 0 and
      shift_3_fuel = 0
    )
  ) not valid;

create table if not exists public.pit_scout_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.scouting_events(id) on delete cascade,
  team_number integer not null check (team_number > 0),
  scout_name text not null,
  drivetrain text not null,
  fuel_scoring_capability text not null,
  tower_capability text not null,
  cycle_time text not null default '',
  scoring_speed text not null default '',
  intake_style text not null default '',
  shooter_type text not null default '',
  hopper_size text not null default '',
  climb_level text not null default '',
  auto_summary text not null default '',
  defense_capability text not null,
  preferred_strategy text not null default '',
  reliability_notes text not null default '',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pit_scout_entries_event_team_idx
  on public.pit_scout_entries (event_id, team_number, created_at desc);

alter table if exists public.pit_scout_entries
  add column if not exists cycle_time text not null default '';

alter table if exists public.pit_scout_entries
  add column if not exists scoring_speed text not null default '';

alter table if exists public.pit_scout_entries
  add column if not exists intake_style text not null default '';

alter table if exists public.pit_scout_entries
  add column if not exists shooter_type text not null default '';

alter table if exists public.pit_scout_entries
  add column if not exists hopper_size text not null default '';

alter table if exists public.pit_scout_entries
  add column if not exists climb_level text not null default '';

create or replace view public.team_summary_2026
with (security_invoker = true) as
with match_agg as (
  select
    event_id,
    team_number,
    count(*)::int as matches_scouted,
    round(avg(auto_fuel)::numeric, 2) as avg_auto_fuel,
    round(avg(
      auto_fuel +
      transition_fuel +
      shift_1_fuel +
      shift_2_fuel +
      shift_3_fuel +
      shift_4_fuel +
      endgame_fuel
    )::numeric, 2) as avg_total_fuel,
    round(avg(
      case
        when auto_tower_result = 'Complete' or endgame_tower_result = 'Complete' then 100
        else 0
      end
    )::numeric, 2) as tower_success_rate,
    round(avg(defense_rating)::numeric, 2) as avg_defense_rating,
    count(*) filter (where breakdown)::int as breakdown_count
  from public.match_scout_entries
  group by event_id, team_number
),
pit_latest as (
  select distinct on (event_id, team_number)
    event_id,
    team_number,
    drivetrain,
    fuel_scoring_capability,
    tower_capability,
    cycle_time,
    scoring_speed,
    intake_style,
    shooter_type,
    hopper_size,
    climb_level,
    auto_summary,
    defense_capability,
    preferred_strategy,
    reliability_notes,
    notes as pit_notes,
    created_at
  from public.pit_scout_entries
  order by event_id, team_number, created_at desc
)
select
  coalesce(match_agg.event_id, pit_latest.event_id) as event_id,
  coalesce(match_agg.team_number, pit_latest.team_number) as team_number,
  coalesce(match_agg.matches_scouted, 0) as matches_scouted,
  coalesce(match_agg.avg_auto_fuel, 0) as avg_auto_fuel,
  coalesce(match_agg.avg_total_fuel, 0) as avg_total_fuel,
  coalesce(match_agg.tower_success_rate, 0) as tower_success_rate,
  coalesce(match_agg.avg_defense_rating, 0) as avg_defense_rating,
  coalesce(match_agg.breakdown_count, 0) as breakdown_count,
  pit_latest.drivetrain,
  pit_latest.fuel_scoring_capability,
  pit_latest.tower_capability,
  pit_latest.cycle_time,
  pit_latest.scoring_speed,
  pit_latest.intake_style,
  pit_latest.shooter_type,
  pit_latest.hopper_size,
  pit_latest.climb_level,
  pit_latest.auto_summary,
  pit_latest.defense_capability,
  pit_latest.preferred_strategy,
  pit_latest.reliability_notes,
  pit_latest.pit_notes
from match_agg
full outer join pit_latest
  on match_agg.event_id = pit_latest.event_id
 and match_agg.team_number = pit_latest.team_number;

grant usage on schema public to authenticated, anon;
grant select, insert on public.scouting_events to authenticated;
grant select, insert on public.match_scout_entries to authenticated;
grant select, insert on public.pit_scout_entries to authenticated;
grant select on public.team_summary_2026 to authenticated;

alter table public.scouting_events enable row level security;
alter table public.match_scout_entries enable row level security;
alter table public.pit_scout_entries enable row level security;

drop policy if exists "team domain read scouting events" on public.scouting_events;
create policy "team domain read scouting events"
  on public.scouting_events
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

drop policy if exists "team domain insert scouting events" on public.scouting_events;
create policy "team domain insert scouting events"
  on public.scouting_events
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

drop policy if exists "team domain read match scout entries" on public.match_scout_entries;
create policy "team domain read match scout entries"
  on public.match_scout_entries
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

drop policy if exists "team domain insert match scout entries" on public.match_scout_entries;
create policy "team domain insert match scout entries"
  on public.match_scout_entries
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

drop policy if exists "team domain read pit scout entries" on public.pit_scout_entries;
create policy "team domain read pit scout entries"
  on public.pit_scout_entries
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

drop policy if exists "team domain insert pit scout entries" on public.pit_scout_entries;
create policy "team domain insert pit scout entries"
  on public.pit_scout_entries
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@team10312.com');

insert into public.scouting_events (slug, name, event_code, location, start_date, end_date, is_active)
values
  (
    'fit-san-antonio-2026',
    'FIT District San Antonio Event',
    'TXSAN',
    'Freeman Coliseum, San Antonio, TX',
    '2026-03-12',
    '2026-03-14',
    true
  ),
  (
    'fit-amarillo-2026',
    'FIT District Amarillo Event',
    'TXAMA',
    'Amarillo Civic Center, Amarillo, TX',
    '2026-04-02',
    '2026-04-04',
    false
  )
on conflict (slug) do nothing;
