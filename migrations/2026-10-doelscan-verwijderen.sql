-- ============================================================
-- ZETJES -- reparatie op migratie 2026-10-doelscan.sql
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
--
-- sessions.profile_id verwees naar profiles(id) zonder ON DELETE-regel.
-- Daardoor blokkeerde Postgres het verwijderen van een profiel zodra er
-- een sessie naar wijst: de verwijderknop in de app zou dan onopgemerkt
-- falen voor iedereen die de Doelscan deed. Dit zet de regel op SET NULL,
-- zoals bij de andere koppelingen in dit schema (invite_id, tenant_id).
-- ============================================================

begin;

alter table sessions drop constraint if exists sessions_profile_id_fkey;
alter table sessions
  add constraint sessions_profile_id_fkey
  foreign key (profile_id) references profiles(id) on delete set null;

commit;

-- ── CONTROLE ─────────────────────────────────────────────────
select conname, confdeltype
from pg_constraint
where conname = 'sessions_profile_id_fkey';
-- confdeltype moet 'n' zijn (SET NULL), niet 'a' (NO ACTION)
