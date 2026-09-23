-- ============================================================
-- ZETJES — migratie 2026-09b: toelichting bij "Niet echt"
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
-- De toelichting is vrije tekst en staat daarom in session_messages
-- (nooit in rapportages), met soort = 'feedback_toelichting'.
-- ============================================================

alter table session_messages
  add column if not exists soort text not null default 'bericht';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'session_messages_soort_check') then
    alter table session_messages add constraint session_messages_soort_check
      check (soort in ('bericht', 'feedback_toelichting'));
  end if;
end $$;

-- controle: toont één rij met het aantal berichten per soort
select soort, count(*) from session_messages group by soort;
