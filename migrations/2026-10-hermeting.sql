-- ============================================================
-- ZETJES -- migratie 2026-10b: hermeting (dag 30 en einde)
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
-- ============================================================

alter table profiles
  add column if not exists progress_vs_start text
    check (progress_vs_start is null or progress_vs_start in ('ja', 'beetje', 'nee'));

-- ── CONTROLE ─────────────────────────────────────────────────
select count(*) as profielen, count(progress_vs_start) as met_voortgangsantwoord
from profiles;
