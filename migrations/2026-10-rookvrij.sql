-- ============================================================
-- ZETJES — migratie 2026-10: context rookvrij
-- Voegt 'rookvrij' toe aan de toegestane contexten van invites.
-- Idempotent: mag vaker draaien. Verwijdert geen data.
-- ============================================================

begin;

alter table invites drop constraint if exists invites_context_check;
alter table invites add constraint invites_context_check
  check (context in ('werk','ondernemen','sales','managers','gli','voornemen','rookvrij'));

commit;

-- Controle: moet één rij met 'rookvrij' in de definitie geven.
select conname, pg_get_constraintdef(oid) as definitie
from pg_constraint where conname = 'invites_context_check';
