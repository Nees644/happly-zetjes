-- ============================================================
-- ZETJES -- migratie 2026-10: Doelscan, profielgestuurde zetjes,
-- hermeting, groepsfoto.
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
-- Verwijdert niets. user_key = sessions.anon_id, dezelfde anonieme sleutel.
-- ============================================================

begin;

-- ── 1. PROFILES ────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  invite_id    uuid references invites(id) on delete cascade,
  user_key     text not null,
  context      text not null,
  goal_text    text,
  goal_when    text,
  goal_hard    text,
  scores       jsonb not null,
  main_block   text not null check (main_block in ('energie','vertrouwen','weerstand','overtuigingen','balans')),
  strength     text not null check (strength in ('energie','vertrouwen','weerstand','overtuigingen')),
  recognition  text,
  first_step   text,
  measured_at  timestamptz default now(),
  kind         text not null default 'start' check (kind in ('start','day30','end'))
);
create index if not exists profiles_user_idx on profiles(user_key, kind);
create index if not exists profiles_invite_idx on profiles(invite_id);
alter table profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'service only') then
    create policy "service only" on profiles for all using (false);
  end if;
end $$;

-- ── 2. SESSIONS ─────────────────────────────────────────────────
-- ON DELETE SET NULL: anders blokkeert het verwijderen van een profiel
-- zodra er een sessie naar wijst (zie migratie 2026-10-doelscan-verwijderen.sql).
alter table sessions add column if not exists profile_id uuid references profiles(id) on delete set null;
create index if not exists sessions_profile_id_idx on sessions(profile_id);

-- ── 3. INVITES ──────────────────────────────────────────────────
alter table invites add column if not exists scan_required boolean default true;
alter table invites add column if not exists remeasure_day30 boolean default true;

-- ── 4. LEADS (losse scan, stap 9, alleen als er geen Laposta-koppeling komt) ──
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  context     text not null default 'personal',
  main_block  text,
  profile_id  uuid references profiles(id) on delete set null,
  bron        text default 'scan',
  created_at  timestamptz default now()
);
create index if not exists leads_email_idx on leads(email);
alter table leads enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'leads' and policyname = 'service only') then
    create policy "service only" on leads for all using (false);
  end if;
end $$;

-- ── 5. FUNNEL_EVENTS (naar patroon happly-scan, hier zonder anon-insert) ──
create table if not exists funnel_events (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  src         text,
  invite_id   uuid references invites(id) on delete set null,
  user_key    text,
  meta        jsonb,
  created_at  timestamptz default now()
);
create index if not exists funnel_events_created_at_idx on funnel_events(created_at);
create index if not exists funnel_events_event_idx on funnel_events(event);
alter table funnel_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'funnel_events' and policyname = 'service only') then
    create policy "service only" on funnel_events for all using (false);
  end if;
end $$;

-- ── 6. VIEW REPORT_GROUP_PROFILE (privacygrens: pas vanaf 5 startprofielen) ──
create or replace view report_group_profile as
with start_profiles as (
  select p.*, i.tenant_id
  from profiles p
  join invites i on i.id = p.invite_id
  where p.kind = 'start'
),
per_invite as (
  select invite_id, tenant_id, count(*) as profielen
  from start_profiles
  group by invite_id, tenant_id
),
verdeling as (
  select invite_id, jsonb_object_agg(main_block, n) as verdeling
  from (
    select invite_id, main_block, count(*) as n
    from start_profiles
    where main_block is not null
    group by invite_id, main_block
  ) x
  group by invite_id
),
gemiddelden as (
  select
    invite_id,
    jsonb_build_object(
      'energie',       round(avg((scores->>'energie')::numeric), 2),
      'vertrouwen',     round(avg((scores->>'vertrouwen')::numeric), 2),
      'weerstand',      round(avg((scores->>'weerstand')::numeric), 2),
      'overtuigingen',  round(avg((scores->>'overtuigingen')::numeric), 2)
    ) as gemiddelde_score
  from start_profiles
  group by invite_id
)
select
  pi.invite_id, pi.tenant_id, pi.profielen, v.verdeling, g.gemiddelde_score
from per_invite pi
join gemiddelden g on g.invite_id = pi.invite_id
left join verdeling v on v.invite_id = pi.invite_id
where pi.profielen >= 5;

revoke all on report_group_profile from anon, authenticated;
grant select on report_group_profile to service_role;

commit;

-- ── CONTROLE (draait mee, toont één rij) ─────────────────────────
select
  (select count(*) from profiles) as profielen,
  (select count(*) from sessions where profile_id is not null) as sessies_met_profiel,
  (select count(*) from invites where scan_required is not null) as invites_met_scan_veld,
  (select count(*) from leads) as leads,
  (select count(*) from funnel_events) as funnel_events,
  (select count(*) from report_group_profile) as groepen_in_profielrapport;
