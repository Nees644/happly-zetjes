-- ============================================================
-- ZETJES -- migratie 2026-10c: groepsfoto (verschil bij hermeting)
-- Supabase-project: Nees644 (ppdxgeatieoxsvoeruuy). Idempotent.
--
-- report_group_profile (migratie 2026-10-doelscan.sql) geeft de verdeling en
-- gemiddelden bij de start. Deze view geeft het gemiddelde verschil per
-- blokkade tussen start en de laatste hermeting (end telt boven day30 als
-- iemand beide heeft), en de verdeling van de voortgangsvraag. Zelfde
-- privacygrens: pas vanaf 5 deelnemers met een hermeting.
-- ============================================================

create or replace view report_group_profile_voortgang as
with gekoppeld as (
  select
    s.invite_id, s.user_key, s.scores as start_scores,
    h.kind as hermeting_kind, h.scores as hermeting_scores, h.progress_vs_start
  from profiles s
  join profiles h on h.invite_id = s.invite_id and h.user_key = s.user_key and h.kind in ('day30', 'end')
  where s.kind = 'start'
),
laatste as (
  select distinct on (invite_id, user_key) *
  from gekoppeld
  order by invite_id, user_key, (hermeting_kind = 'end') desc
),
per_invite as (
  select
    invite_id,
    count(*) as deelnemers_met_hermeting,
    jsonb_build_object(
      'energie',       round(avg((hermeting_scores->>'energie')::numeric - (start_scores->>'energie')::numeric), 2),
      'vertrouwen',     round(avg((hermeting_scores->>'vertrouwen')::numeric - (start_scores->>'vertrouwen')::numeric), 2),
      'weerstand',      round(avg((hermeting_scores->>'weerstand')::numeric - (start_scores->>'weerstand')::numeric), 2),
      'overtuigingen',  round(avg((hermeting_scores->>'overtuigingen')::numeric - (start_scores->>'overtuigingen')::numeric), 2)
    ) as gemiddeld_verschil,
    jsonb_build_object(
      'ja',     count(*) filter (where progress_vs_start = 'ja'),
      'beetje', count(*) filter (where progress_vs_start = 'beetje'),
      'nee',    count(*) filter (where progress_vs_start = 'nee')
    ) as voortgang_antwoorden
  from laatste
  group by invite_id
)
select * from per_invite where deelnemers_met_hermeting >= 5;

revoke all on report_group_profile_voortgang from anon, authenticated;
grant select on report_group_profile_voortgang to service_role;

-- ── CONTROLE ─────────────────────────────────────────────────
select count(*) as groepen_met_voortgangsbeeld from report_group_profile_voortgang;
