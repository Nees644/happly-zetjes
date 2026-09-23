-- ============================================================
-- ZETJES — migratie 2026-09: contextlaag, GLI, geldigheid, betaling
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy)
-- Idempotent: mag vaker draaien, geeft geen fout en geen dubbele data.
-- Verwijdert niets. Oude kolommen (theme, vrije tekst in sessions)
-- blijven staan tot de opruimmigratie na de deploy.
-- ============================================================

begin;

-- ── 1. TENANTS ──────────────────────────────────────────────
alter table tenants
  add column if not exists type text default 'werkgever'
    check (type in ('werkgever','gli_aanbieder','salesorganisatie','personal','overig')),
  add column if not exists agb_code_aanbieder text
    check (agb_code_aanbieder is null or agb_code_aanbieder ~ '^[0-9]{8}$'),
  add column if not exists gli_programma text
    check (gli_programma is null or gli_programma in ('CooL','BeweegKuur','SLIMMER','SSiB','X-Fittt','KeerDiabetes2Om')),
  add column if not exists contact_email text,
  add column if not exists rapportage_frequentie text default 'maandelijks'
    check (rapportage_frequentie in ('maandelijks','kwartaal','geen'));

update tenants set type = 'werkgever' where type is null;

-- ── 2. INVITES ──────────────────────────────────────────────
-- context naast theme (niet hernoemen: de live app leest theme tot de deploy)
alter table invites
  add column if not exists context text,
  add column if not exists label text,
  add column if not exists start_date date,
  add column if not exists expires_at timestamptz,
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0),
  add column if not exists agb_code_coach text,
  add column if not exists verwacht_aantal_deelnemers integer,
  add column if not exists coach_signaal_aan boolean default false,
  add column if not exists mollie_payment_id text,
  add column if not exists koper_email text;

update invites set context = coalesce(theme, 'werk') where context is null;
alter table invites alter column context set default 'werk';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invites_context_check') then
    alter table invites add constraint invites_context_check
      check (context in ('werk','ondernemen','sales','managers','gli'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invites_mollie_payment_id_key') then
    alter table invites add constraint invites_mollie_payment_id_key unique (mollie_payment_id);
  end if;
end $$;

-- ── 3. SESSIONS ─────────────────────────────────────────────
-- anon_id blijft de anonieme gebruikers-id (in de briefing: user_token)
-- feedback blijft de uitkomst (in de briefing: outcome)
alter table sessions
  add column if not exists invite_id uuid references invites(id),
  add column if not exists context text,
  add column if not exists phase text
    check (phase is null or phase in ('start','eerste_terugval','behandelfase','overgang','onderhoud')),
  add column if not exists week_since_start integer,
  add column if not exists pattern text
    check (pattern is null or pattern in ('energie','vertrouwen','weerstand','overtuigingen')),
  add column if not exists moment text
    check (moment is null or moment in ('schaamte','dip','groep','stilte')),
  add column if not exists intervention text,
  add column if not exists gatekeeper_triggered boolean default false,
  add column if not exists gatekeeper_reason text
    check (gatekeeper_reason is null or gatekeeper_reason in ('voeding','medisch','mentaal','offtopic')),
  add column if not exists duration_seconds integer,
  add column if not exists pseudoniem text;

update sessions set context = coalesce(theme, 'werk') where context is null;

-- bestaande sessies koppelen aan hun invite via het anonieme id
update sessions s
set invite_id = i.id
from invites i
where s.invite_id is null and i.anon_id is not null and i.anon_id = s.anon_id;

update sessions set gatekeeper_triggered = false where gatekeeper_triggered is null;

create index if not exists sessions_invite_id_idx on sessions(invite_id);

-- ── 4. SESSION_MESSAGES (vrije tekst, nooit in rapportages) ──
create table if not exists session_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  positie     smallint not null,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz default now()
);
create index if not exists session_messages_session_id_idx on session_messages(session_id);
alter table session_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'session_messages' and policyname = 'service only') then
    create policy "service only" on session_messages for all using (false);
  end if;
end $$;

-- bestaande tekst kopiëren (alleen sessies die nog geen berichten hebben)
insert into session_messages (session_id, positie, role, content, created_at)
select s.id, v.positie, v.role, v.content, s.created_at
from sessions s
cross join lateral (values
  (1, 'user',      s.situation),
  (2, 'assistant', s.clarify_q),
  (3, 'user',      s.clarify_a),
  (4, 'assistant', case when s.zetje_title is not null or s.zetje_intro is not null then
                     jsonb_build_object('badge', s.zetje_badge, 'titel', s.zetje_title,
                                        'intro', s.zetje_intro, 'stappen', s.zetje_steps)::text
                   end)
) as v(positie, role, content)
where v.content is not null and v.content <> ''
  and not exists (select 1 from session_messages m where m.session_id = s.id);

-- ── 5. USER_PROFILES (toestemming en profiel per anoniem id) ─
create table if not exists user_profiles (
  anon_id               text primary key,
  invite_id             uuid references invites(id) on delete set null,
  consent_at            timestamptz,
  profiel_samenvatting  text,
  created_at            timestamptz default now()
);
create index if not exists user_profiles_invite_id_idx on user_profiles(invite_id);
alter table user_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'user_profiles' and policyname = 'service only') then
    create policy "service only" on user_profiles for all using (false);
  end if;
end $$;

-- ── 6. TENANT PERSONAL (B2C-kopers) ─────────────────────────
insert into tenants (name, slug, type)
select 'Zetjes personal', 'personal', 'personal'
where not exists (select 1 from tenants where slug = 'personal');

insert into tenant_products (tenant_id, product_id)
select t.id, p.id from tenants t, products p
where t.slug = 'personal' and p.slug = 'zetjes'
on conflict (tenant_id, product_id) do nothing;

-- ── 7. VIEW REPORT_GROUP (privacygrens: pas vanaf 5 gebruikers) ─
create or replace view report_group as
with per_invite as (
  select
    i.id                         as invite_id,
    i.tenant_id,
    i.label,
    i.context,
    i.start_date,
    i.verwacht_aantal_deelnemers,
    count(distinct s.anon_id)    as actieve_gebruikers,
    count(s.id)                  as sessies,
    count(s.id) filter (where s.created_at >= date_trunc('month', now())) as sessies_deze_maand,
    count(s.id) filter (where s.feedback in ('ja','beetje'))              as geholpen,
    count(s.id) filter (where s.feedback in ('ja','beetje','nee'))        as met_terugkoppeling,
    count(s.id) filter (where s.gatekeeper_triggered)                     as poortwachter,
    max(s.created_at)            as laatste_activiteit
  from invites i
  join sessions s on s.invite_id = i.id
  group by i.id
)
select
  p.*,
  coalesce((select jsonb_object_agg(x.pattern, x.n) from (
     select pattern, count(*) as n from sessions
     where invite_id = p.invite_id and pattern is not null group by pattern) x), '{}'::jsonb) as blokkades,
  coalesce((select jsonb_object_agg(x.moment, x.n) from (
     select moment, count(*) as n from sessions
     where invite_id = p.invite_id and moment is not null group by moment) x), '{}'::jsonb) as momenten,
  coalesce((select jsonb_object_agg(x.gatekeeper_reason, x.n) from (
     select gatekeeper_reason, count(*) as n from sessions
     where invite_id = p.invite_id and gatekeeper_reason is not null group by gatekeeper_reason) x), '{}'::jsonb) as poortwachter_redenen
from per_invite p
where p.actieve_gebruikers >= 5;

revoke all on report_group from anon, authenticated;
grant select on report_group to service_role;

commit;

-- ── CONTROLE (draait mee, toont één rij) ────────────────────
select
  (select count(*) from tenants)                                        as tenants,
  (select count(*) from tenants where slug = 'personal')                as tenant_personal,
  (select count(*) from invites)                                        as invites,
  (select count(*) from invites where context is null)                  as invites_zonder_context,
  (select count(*) from sessions)                                       as sessies,
  (select count(*) from sessions where invite_id is not null)           as sessies_gekoppeld,
  (select count(*) from session_messages)                               as berichten,
  (select count(distinct session_id) from session_messages)            as sessies_met_berichten,
  (select count(*) from user_profiles)                                  as profielen,
  (select count(*) from report_group)                                   as groepen_in_rapport;
