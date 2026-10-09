// api/validate.js
// POST /api/validate { token, anonId }
// Controleert de link (bestaat, actief, niet verlopen, niet vol), meldt een nieuw
// toestel aan en geeft de context terug. De frontend kiest nooit zelf de context.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');
const { hermetingItems } = require('./_lib/scan-engine');

const TERUGVRAAG_NA_UUR = 2;
const TERUGVRAAG_MAX_DAGEN = 30;
const DAG30_MS = 30 * 24 * 60 * 60 * 1000;
// Grens vóór de echte vervaldatum: eenmaal verlopen blokkeert resolveAccess
// de toegang, dus de hermeting-bij-het-einde moet er vóór die tijd bij kunnen.
const EINDE_VENSTER_DAGEN = 7;

// Het laatste zetje zonder terugkoppeling, als het minstens 2 uur oud is:
// daar vragen we bij dit bezoek naar ("Heeft het geholpen?").
async function openFeedback(anonId, inviteId) {
  const tot = new Date(Date.now() - TERUGVRAAG_NA_UUR * 3600000).toISOString();
  const vanaf = new Date(Date.now() - TERUGVRAAG_MAX_DAGEN * 86400000).toISOString();
  const { data: s } = await supabase
    .from('sessions').select('id')
    .eq('anon_id', anonId).eq('invite_id', inviteId)
    .not('pattern', 'is', null).is('feedback', null)
    .lte('created_at', tot).gte('created_at', vanaf)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!s) return null;
  const { data: m } = await supabase
    .from('session_messages').select('content')
    .eq('session_id', s.id).eq('role', 'assistant')
    .order('positie', { ascending: false }).limit(1).maybeSingle();
  let titel = null;
  try { titel = JSON.parse(m?.content || '{}').titel || null; } catch {}
  return { sessionId: s.id, titel };
}

// Heeft deze gebruiker de Doelscan al gedaan op deze link? Alleen relevant als
// de context een scan heeft en de invite hem niet uitschakelt.
async function scanStatus(ctx, invite, anonId) {
  if (!ctx.scan || invite.scan_required === false) return { nodig: false };
  const { data } = await supabase
    .from('profiles').select('id').eq('invite_id', invite.id).eq('user_key', anonId)
    .eq('kind', 'start').limit(1).maybeSingle();
  if (data) return { nodig: false };
  return {
    nodig: true,
    config: {
      goalPrompt: ctx.scan.goalPrompt,
      whenPrompt: ctx.scan.whenPrompt,
      hardPrompt: ctx.scan.hardPrompt,
      openPrompt: ctx.scan.openPrompt,
      items: ctx.scan.items.map((it) => ({ text: it.text })),
    },
  };
}

// Is de hermeting nu aan de orde? Op dag 30 na de Doelscan, of in de laatste
// week vóór de invite verloopt (zie EINDE_VENSTER_DAGEN hierboven). Werkt
// zonder de cron: die logt alleen voor het funnelspoor (api/remeasure.js).
async function remeasureStatus(ctx, invite, anonId) {
  if (!ctx.scan || invite.remeasure_day30 === false) return { nodig: false };
  const { data: start } = await supabase
    .from('profiles').select('measured_at, strength').eq('invite_id', invite.id).eq('user_key', anonId)
    .eq('kind', 'start').maybeSingle();
  if (!start) return { nodig: false };

  const heeftAl = async (kind) => {
    const { data } = await supabase
      .from('profiles').select('id').eq('invite_id', invite.id).eq('user_key', anonId)
      .eq('kind', kind).maybeSingle();
    return !!data;
  };

  let kind = null;
  if (invite.expires_at) {
    const dagenTotVerval = (Date.parse(invite.expires_at) - Date.now()) / 86400000;
    if (dagenTotVerval <= EINDE_VENSTER_DAGEN && !(await heeftAl('end'))) kind = 'end';
  }
  if (!kind && Date.now() - Date.parse(start.measured_at) >= DAG30_MS && !(await heeftAl('day30'))) {
    kind = 'day30';
  }
  if (!kind) return { nodig: false };

  return {
    nodig: true,
    kind,
    config: {
      progressPrompt: 'Ben je dichter bij je doel dan een maand geleden?',
      items: hermetingItems(ctx.scan.items, start.strength).map((it) => ({ text: it.text })),
    },
  };
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId, register: true });
    const consent = !!a.profile?.consent_at;
    const scan = consent ? await scanStatus(a.ctx, a.invite, a.anonId) : { nodig: false };
    // Hermeting pas aanbieden ná de Doelscan zelf, nooit tegelijk.
    const remeasure = consent && !scan.nodig ? await remeasureStatus(a.ctx, a.invite, a.anonId) : { nodig: false };
    return res.status(200).json({
      valid: true,
      anonId: a.anonId,
      context: a.ctx.key,
      label: a.ctx.label,
      ui: a.ctx.ui,
      phase: a.phase,
      weekSinceStart: a.weekSinceStart,
      tenantType: a.invite.tenants?.type || null,
      productName: a.invite.products?.name || 'Zetjes',
      consent,
      scanNodig: scan.nodig,
      scanConfig: scan.config || null,
      remeasureNodig: remeasure.nodig,
      remeasureKind: remeasure.kind || null,
      remeasureConfig: remeasure.config || null,
      openFeedback: consent && !scan.nodig && !remeasure.nodig ? await openFeedback(a.anonId, a.invite.id) : null,
    });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('validate', err.message);
    return res.status(500).json({ valid: false, reason: 'fout' });
  }
};
