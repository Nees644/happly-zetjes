-- ============================================================
-- ZETJES -- migratie 2026-10f: de gewoontemeting in de Volhoudreis
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
-- Verwijdert niets.
--
-- Eén keer per week vier zinnen (SRBAI, Gardner 2012) over het doel van de
-- kaart, vanaf dag 7. De deelnemer ziet er nooit een cijfer van: de meting
-- is er om per persoon de curve van gewoontevorming te leren kennen en die
-- later naast de zelfkrachtscore te leggen. Een overgeslagen vraag staat er
-- ook in, zonder antwoorden, zodat hij niet elke dag terugkomt.
-- ============================================================

begin;

create table if not exists gewoontemeting (
  id          uuid primary key default gen_random_uuid(),
  reis_id     uuid not null references reizen(id) on delete cascade,
  dag         smallint not null,
  a1          smallint check (a1 is null or a1 between 1 and 7),
  a2          smallint check (a2 is null or a2 between 1 and 7),
  a3          smallint check (a3 is null or a3 between 1 and 7),
  a4          smallint check (a4 is null or a4 between 1 and 7),
  score       numeric(3,2),
  overgeslagen boolean not null default false,
  created_at  timestamptz default now()
);
create index if not exists gewoontemeting_reis_idx on gewoontemeting(reis_id, created_at desc);
alter table gewoontemeting enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'gewoontemeting' and policyname = 'service only') then
    create policy "service only" on gewoontemeting for all using (false);
  end if;
end $$;

-- Sinds 30 oktober 2026 krijgt een nieuwe tabel geen Data API-toegang vanzelf.
grant select, insert, update, delete on public.gewoontemeting to service_role;

commit;

-- ── CONTROLE (draait mee, toont één rij) ─────────────────────
select
  (select count(*) from gewoontemeting)                                             as metingen,
  (select count(*) from information_schema.role_table_grants
     where table_name = 'gewoontemeting' and grantee = 'service_role')            as rechten_service_role;
