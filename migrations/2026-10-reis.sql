-- ============================================================
-- ZETJES -- migratie 2026-10d: de Volhoudreis (fase A)
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
-- Verwijdert niets. Hoort bij docs/Bouwbriefing_Volhoudreis_faseA.md.
--
-- Een groep is een bestaande invite met is_reis = true. Een reis is de
-- deelnemer in die groep: de enige plek waar voornaam en e-mail staan.
-- Sessions, session_messages en profiles blijven anoniem op anon_id.
-- De kaart (vier vakken) is de intake van Zetjes in de reis; de Doelscan
-- staat in een reis uit (scan_required = false).
-- ============================================================

begin;

-- ── 1. INVITES: de groep ──────────────────────────────────────
alter table invites
  add column if not exists is_reis boolean not null default false,
  add column if not exists programma_naam text,
  add column if not exists interventie_start date,
  add column if not exists begeleider_email text,
  add column if not exists begeleider_token text;

-- Bestaande rijen krijgen alsnog een begeleider_token; nieuwe via default.
update invites set begeleider_token = encode(gen_random_bytes(16), 'hex') where begeleider_token is null;
alter table invites alter column begeleider_token set default encode(gen_random_bytes(16), 'hex');
alter table invites alter column begeleider_token set not null;
create unique index if not exists invites_begeleider_token_idx on invites(begeleider_token);

-- ── 2. REIZEN: de deelnemer in de groep ──────────────────────
create table if not exists reizen (
  id                  uuid primary key default gen_random_uuid(),
  invite_id           uuid not null references invites(id) on delete cascade,
  token               text unique not null default encode(gen_random_bytes(16), 'hex'),
  anon_id             text unique,
  voornaam            text,
  email               text not null,
  email_hash          text not null,
  toestemming_at      timestamptz,
  signaal_ok          boolean not null default false,
  proactief_ok        boolean not null default false,
  stap                smallint not null default 1 check (stap between 1 and 7),
  scan_start_id       uuid,
  scan_start          jsonb,
  scan_eind_id        uuid,
  scan_eind           jsonb,
  laatste_activiteit  timestamptz,
  magische_link_at    timestamptz,
  proactief_laatst_at timestamptz,
  created_at          timestamptz default now(),
  unique (invite_id, email_hash)
);
create index if not exists reizen_invite_idx on reizen(invite_id);
create index if not exists reizen_anon_idx on reizen(anon_id);
alter table reizen enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'reizen' and policyname = 'service only') then
    create policy "service only" on reizen for all using (false);
  end if;
end $$;

-- ── 3. KAARTEN: de Volhoudkaart, per versie ──────────────────
create table if not exists kaarten (
  id               uuid primary key default gen_random_uuid(),
  reis_id          uuid not null references reizen(id) on delete cascade,
  doel             text,
  vak1_moment      text,
  vak1_weekdag     smallint check (vak1_weekdag is null or vak1_weekdag between 1 and 7),
  vak1_dagdeel     text check (vak1_dagdeel is null or vak1_dagdeel in ('ochtend','middag','avond')),
  vak1_zin         text,
  vak2_inrichting  text,
  vak3_als         text,
  vak3_dan         text,
  vak4_woorden     text,
  versie           smallint not null default 1,
  created_at       timestamptz default now()
);
create unique index if not exists kaarten_reis_versie_idx on kaarten(reis_id, versie);
alter table kaarten enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'kaarten' and policyname = 'service only') then
    create policy "service only" on kaarten for all using (false);
  end if;
end $$;

-- ── 4. EERSTE GROEP: Proef Happly ────────────────────────────
-- Tenant 'happly' voor eigen proefgroepen. Context 'werk' totdat er een
-- context voor bewegen is. Geldig 100 dagen: 66 dagen plus ruimte voor de
-- hermeting. Maximaal 25 toestellen.
insert into tenants (name, slug, type, contact_email)
select 'Happly', 'happly', 'overig', 'maarten@happly.nl'
where not exists (select 1 from tenants where slug = 'happly');

insert into tenant_products (tenant_id, product_id)
select t.id, p.id from tenants t, products p
where t.slug = 'happly' and p.slug = 'zetjes'
on conflict (tenant_id, product_id) do nothing;

insert into invites (tenant_id, product_id, context, label, start_date, interventie_start,
                     expires_at, max_uses, is_reis, scan_required, remeasure_day30,
                     programma_naam, begeleider_email)
select t.id, p.id, 'werk', 'Proef Happly', current_date, current_date,
       now() + interval '100 days', 25, true, false, false,
       'Proef Happly', 'maarten@happly.nl'
from tenants t join products p on p.slug = 'zetjes'
where t.slug = 'happly'
  and not exists (select 1 from invites i where i.tenant_id = t.id and i.label = 'Proef Happly');

commit;

-- ── CONTROLE (draait mee, toont één rij) ─────────────────────
select
  (select count(*) from invites where is_reis)                           as groepen,
  (select count(*) from invites where begeleider_token is null)          as invites_zonder_begeleidertoken,
  (select count(*) from reizen)                                          as reizen,
  (select count(*) from kaarten)                                         as kaarten,
  -- Zet voor het domein het adres van de app (APP_URL in Vercel, nu happly-zetjes.vercel.app, straks zetjes.nl).
  (select '/start/' || token from invites where label = 'Proef Happly' and is_reis limit 1)            as groepslink_proef,
  (select '/groep/' || begeleider_token from invites where label = 'Proef Happly' and is_reis limit 1) as begeleiderslink_proef;
