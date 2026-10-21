-- ZETJES: migratie 2026-10: het waarom
-- Besluit 21 oktober 2026 (Ik houd vol): niet het wat, maar het waarom draagt
-- het volhouden. De Doelscan en de Volhoudkaart vragen daarom eerst waarom
-- iemand dit wil, in eigen woorden. Zetjes geeft het terug op moeilijke momenten.
-- Idempotent: verwijdert niets.

begin;

alter table profiles add column if not exists goal_why text;
alter table kaarten  add column if not exists waarom   text;

commit;

-- Controle: moet precies een rij geven met beide kolommen.
select
  (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'goal_why') as profiles_goal_why,
  (select count(*) from information_schema.columns where table_name = 'kaarten'  and column_name = 'waarom')   as kaarten_waarom;
