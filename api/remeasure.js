// api/remeasure.js
// GET  → dagelijkse Vercel-cron: logt wie klaar staat voor de hermeting, puur
//        voor het funnelspoor. De hermeting zelf wordt dynamisch aangeboden
//        bij het openen van de app (api/validate.js), niet door deze cron:
//        er is nog geen mail (bijlage 15 hoofdstuk 6, "geen mailflow bouwen
//        als er nog geen e-mail bekend is").
// POST { token, anonId, kind: 'day30'|'end', answers, progress } → slaat de
//        hermeting op als profiel met dat kind.

const { supabase } = require('./_lib/supabase');
const { resolveAccess, sendAccessError } = require('./_lib/access');
const { hermetingItems, scoreHermeting } = require('./_lib/scan-engine');

// access.js z'n cors() staat vast op POST; deze route heeft ook GET nodig (de cron).
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const DAG30_MS = 30 * 24 * 60 * 60 * 1000;
const VENSTER_MS = 24 * 60 * 60 * 1000; // marge van één dag rond precies 30 dagen
const PROGRESS = ['ja', 'beetje', 'nee'];

function isCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.warn('remeasure: CRON_SECRET niet gezet, cron-aanroep niet beveiligd'); return true; }
  return req.headers.authorization === `Bearer ${secret}`;
}

async function handleCron(req, res) {
  if (!isCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const nu = Date.now();
  const dag30Vanaf = new Date(nu - DAG30_MS - VENSTER_MS).toISOString();
  const dag30Tot = new Date(nu - DAG30_MS + VENSTER_MS).toISOString();

  const { data: kandidaten } = await supabase
    .from('profiles').select('id, invite_id, user_key, measured_at')
    .eq('kind', 'start').gte('measured_at', dag30Vanaf).lte('measured_at', dag30Tot);

  let dag30 = 0;
  for (const p of kandidaten || []) {
    const { data: bestaand } = await supabase
      .from('profiles').select('id').eq('invite_id', p.invite_id).eq('user_key', p.user_key)
      .eq('kind', 'day30').maybeSingle();
    if (bestaand) continue;
    await supabase.from('funnel_events').insert({
      event: 'hermeting_klaar_dag30', src: 'cron', invite_id: p.invite_id, user_key: p.user_key,
    });
    dag30++;
  }

  // Bijna verlopen invites: binnen 7 dagen, met een startprofiel en nog geen 'end'.
  // Dit ligt vóór de echte vervaldatum, want validate.js blokkeert de toegang
  // zodra een invite verlopen is en de hermeting kan dan niet meer in-app.
  const zevenDagen = new Date(nu + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: bijnaVerlopen } = await supabase
    .from('invites').select('id, remeasure_day30')
    .not('expires_at', 'is', null).lte('expires_at', zevenDagen).gt('expires_at', new Date(nu).toISOString());

  let einde = 0;
  for (const inv of bijnaVerlopen || []) {
    if (inv.remeasure_day30 === false) continue;
    const { data: starts } = await supabase
      .from('profiles').select('user_key').eq('invite_id', inv.id).eq('kind', 'start');
    for (const s of starts || []) {
      const { data: bestaand } = await supabase
        .from('profiles').select('id').eq('invite_id', inv.id).eq('user_key', s.user_key).eq('kind', 'end').maybeSingle();
      if (bestaand) continue;
      await supabase.from('funnel_events').insert({
        event: 'hermeting_klaar_einde', src: 'cron', invite_id: inv.id, user_key: s.user_key,
      });
      einde++;
    }
  }

  return res.status(200).json({ ok: true, dag30, einde });
}

async function handlePost(req, res) {
  const { token, anonId, kind } = req.body || {};
  const answers = req.body?.answers;
  const progress = req.body?.progress;

  if (!['day30', 'end'].includes(kind)) return res.status(400).json({ error: 'Onbekend soort hermeting' });
  if (!PROGRESS.includes(progress)) return res.status(400).json({ error: 'Ongeldig antwoord op de voortgangsvraag' });

  let a;
  try {
    a = await resolveAccess({ token, anonId });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('remeasure access', err.message);
    return res.status(500).json({ error: 'fout' });
  }
  if (!a.profile?.consent_at) return res.status(403).json({ reason: 'toestemming' });

  const { data: start } = await supabase
    .from('profiles').select('*').eq('invite_id', a.invite.id).eq('user_key', a.anonId)
    .eq('kind', 'start').maybeSingle();
  if (!start) return res.status(400).json({ error: 'Nog geen Doelscan gedaan op deze link' });

  const { data: bestaand } = await supabase
    .from('profiles').select('id').eq('invite_id', a.invite.id).eq('user_key', a.anonId)
    .eq('kind', kind).maybeSingle();
  if (bestaand) return res.status(200).json({ ok: true, profileId: bestaand.id });

  const items = hermetingItems(a.ctx.scan.items, start.strength);
  let score;
  try {
    score = scoreHermeting({ items, answers, context: a.ctx.key, startScores: start.scores, startStrength: start.strength });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { data: profile, error } = await supabase.from('profiles').insert({
    invite_id: a.invite.id,
    user_key: a.anonId,
    context: a.ctx.key,
    scores: score.scores,
    main_block: score.main_block,
    strength: score.strength,
    progress_vs_start: progress,
    kind,
  }).select('id').single();
  if (error) {
    console.error('remeasure opslaan', error.message);
    return res.status(500).json({ error: 'fout' });
  }

  await supabase.from('funnel_events').insert({
    event: kind === 'day30' ? 'hermeting_dag30_ingevuld' : 'hermeting_einde_ingevuld',
    src: 'app', invite_id: a.invite.id, user_key: a.anonId,
  });

  return res.status(200).json({ ok: true, profileId: profile.id });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return handleCron(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).end();
};
