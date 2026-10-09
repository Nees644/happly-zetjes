// api/scan.js
// POST /api/scan { token, anonId, goalText, goalWhen, goalHard, answers, firstStep }
// Verwerkt de Doelscan: scoort de twaalf antwoorden, bouwt de herkenningszin
// en slaat het profiel op. Geen AI-call, deterministisch (bijlage 14 hoofdstuk 4).

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');
const { scoreDoelscan, bouwHerkenningszin, labelVoorScore, eersteStapBruikbaar, BLOKKADES } = require('./_lib/scan-engine');

const MAX_TEKST = 300;

function schoon(t) {
  return String(t || '').trim().slice(0, MAX_TEKST);
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId } = req.body || {};
  const goalText = schoon(req.body?.goalText);
  const goalWhen = schoon(req.body?.goalWhen);
  const goalHard = schoon(req.body?.goalHard);
  const firstStep = schoon(req.body?.firstStep);
  const answers = req.body?.answers;

  let a;
  try {
    a = await resolveAccess({ token, anonId });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('scan access', err.message);
    return res.status(500).json({ error: 'fout' });
  }
  if (!a.profile?.consent_at) return res.status(403).json({ reason: 'toestemming' });

  const scanConfig = a.ctx.scan;
  if (!scanConfig) return res.status(400).json({ error: 'Deze context heeft geen Doelscan' });

  // Al een startprofiel voor deze gebruiker op deze link: niet nog een keer opslaan,
  // dat zou de groepsfoto dubbel tellen. Geef het bestaande profiel terug.
  const { data: bestaand } = await supabase
    .from('profiles').select('*')
    .eq('invite_id', a.invite.id).eq('user_key', a.anonId).eq('kind', 'start')
    .maybeSingle();
  if (bestaand) return res.status(200).json(uitslag(a.ctx, bestaand, bestaand.id));

  let score;
  try {
    score = scoreDoelscan({ items: scanConfig.items, answers, context: a.ctx.key });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!goalText) return res.status(400).json({ error: 'Vul in wat je wilt bereiken' });

  const recognition = bouwHerkenningszin({ phrases: scanConfig.phrases, ...score });

  const { data: profile, error } = await supabase.from('profiles').insert({
    invite_id: a.invite.id,
    user_key: a.anonId,
    context: a.ctx.key,
    goal_text: goalText,
    goal_when: goalWhen || null,
    goal_hard: goalHard || null,
    scores: score.scores,
    main_block: score.main_block,
    strength: score.strength,
    recognition,
    first_step: firstStep || null,
    kind: 'start',
  }).select('*').single();
  if (error) {
    console.error('scan opslaan', error.message);
    return res.status(500).json({ error: 'fout' });
  }

  await supabase.from('funnel_events').insert({
    event: 'scan_voltooid', src: 'app', invite_id: a.invite.id, user_key: a.anonId,
    meta: { main_block: score.main_block, strength: score.strength },
  });

  return res.status(200).json(uitslag(a.ctx, profile, profile.id));
};

function uitslag(ctx, profile, profileId) {
  const balken = {};
  BLOKKADES.forEach((b) => { balken[b] = labelVoorScore(profile.scores[b]); });
  const eersteZetjeUitAntwoord = eersteStapBruikbaar(profile.first_step);
  return {
    ok: true,
    profileId,
    balken,
    mainBlock: profile.main_block,
    strength: profile.strength,
    recognition: profile.recognition,
    alinea: ctx.scan.alineas[profile.main_block],
    goalText: profile.goal_text,
    eersteZetjeUitAntwoord,
    eersteStap: eersteZetjeUitAntwoord ? profile.first_step : null,
  };
}
