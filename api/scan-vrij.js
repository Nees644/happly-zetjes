// api/scan-vrij.js
// De losse, gratis Doelscan zonder invite (bijlage 15 hoofdstuk 6, "Losse scan").
// Geen token, geen toestemmingsscherm: dit is een marketingpagina, geen
// gekoppelde app-sessie. Context vast op 'ondernemen' (de neutrale kern,
// zoals personal die ook gebruikt). Sessies en profielen hangen aan de
// vaste tenant 'personal', zonder invite_id.
//
// POST { phase: 'scan', anonId, goalText, goalWhen, goalHard, answers, firstStep }
// POST { phase: 'zetje', anonId, profileId }
// POST { phase: 'lead', anonId, profileId, email }

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { getContext } = require('./_lib/contexts');
const { jsonCall } = require('./_lib/anthropic');
const { staticSystem } = require('./_lib/contexts');
const {
  scoreDoelscan, bouwHerkenningszin, labelVoorScore, eersteStapBruikbaar, BLOKKADES, profielBlokTekst,
} = require('./_lib/scan-engine');

const MAX_INPUT = 2000;
const CONTEXT_KEY = 'ondernemen';
const TRIAL_DAGEN = 7;

const ZETJE_SCHEMA = {
  type: 'object',
  properties: {
    badge: { type: 'string', description: 'Korte naam van wat er speelt, maximaal 2 woorden' },
    titel: { type: 'string', description: 'Prikkelende titel van het zetje, maximaal 8 woorden' },
    intro: { type: 'string', description: 'De spiegel: één zin die laat voelen dat je begrijpt wat er speelt' },
    stappen: { type: 'array', items: { type: 'string' }, description: 'Eén tot drie concrete stappen, elk maximaal 15 woorden' },
  },
  required: ['badge', 'titel', 'intro', 'stappen'],
  additionalProperties: false,
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function schoon(t, max = MAX_INPUT) {
  return String(t || '').trim().slice(0, max);
}

async function personalTenant() {
  const { data } = await supabase.from('tenants').select('id').eq('slug', 'personal').maybeSingle();
  return data;
}

function uitslag(ctx, profile) {
  const balken = {};
  BLOKKADES.forEach((b) => { balken[b] = labelVoorScore(profile.scores[b]); });
  const bruikbaar = eersteStapBruikbaar(profile.first_step);
  return {
    ok: true,
    profileId: profile.id,
    balken,
    mainBlock: profile.main_block,
    strength: profile.strength,
    recognition: profile.recognition,
    alinea: ctx.scan.alineas[profile.main_block],
    goalText: profile.goal_text,
    eersteZetjeUitAntwoord: bruikbaar,
    eersteStap: bruikbaar ? profile.first_step : null,
  };
}

async function handleScan(req, res, tenant) {
  const anonId = String(req.body?.anonId || '').trim() || 'vrij_' + crypto.randomBytes(12).toString('hex');
  const goalText = schoon(req.body?.goalText, 200);
  const goalWhen = schoon(req.body?.goalWhen, 150);
  const goalHard = schoon(req.body?.goalHard, 150);
  const firstStep = schoon(req.body?.firstStep, 300);
  const answers = req.body?.answers;

  if (!goalText) return res.status(400).json({ error: 'Vul in wat je wilt bereiken' });
  const ctx = getContext(CONTEXT_KEY);

  let score;
  try {
    score = scoreDoelscan({ items: ctx.scan.items, answers, context: CONTEXT_KEY });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const recognition = bouwHerkenningszin({ phrases: ctx.scan.phrases, ...score });

  const { data: profile, error } = await supabase.from('profiles').insert({
    invite_id: null,
    user_key: anonId,
    context: CONTEXT_KEY,
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
    console.error('scan-vrij opslaan', error.message);
    return res.status(500).json({ error: 'fout' });
  }

  await supabase.from('funnel_events').insert({ event: 'losse_scan_voltooid', src: 'scan', user_key: anonId, meta: { main_block: score.main_block } });

  return res.status(200).json({ ...uitslag(ctx, profile), anonId });
}

async function handleZetje(req, res, tenant) {
  const anonId = String(req.body?.anonId || '').trim();
  const profileId = String(req.body?.profileId || '').trim();
  if (!anonId || !profileId) return res.status(400).json({ error: 'Ontbrekende gegevens' });

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', profileId).eq('user_key', anonId).maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Profiel niet gevonden' });

  const ctx = getContext(CONTEXT_KEY);
  const bruikbaar = eersteStapBruikbaar(profile.first_step);

  const { data: sessie, error: sErr } = await supabase.from('sessions').insert({
    tenant_id: tenant?.id || null,
    anon_id: anonId,
    context: CONTEXT_KEY,
    theme: CONTEXT_KEY,
    profile_id: profile.id,
  }).select('id, created_at').single();
  if (sErr) { console.error('scan-vrij sessie', sErr.message); return res.status(500).json({ error: 'fout' }); }

  if (bruikbaar) {
    const zetje = { badge: 'Eigen zetje', titel: 'Jouw eigen eerste stap', intro: '', stappen: [profile.first_step] };
    await supabase.from('session_messages').insert({ session_id: sessie.id, positie: 1, role: 'assistant', content: JSON.stringify(zetje) });
    return res.status(200).json({ ...zetje, sessionId: sessie.id });
  }

  const profielBlok = profielBlokTekst(ctx, profile);

  let z;
  try {
    ({ data: z } = await jsonCall({
      label: 'zetje-vrij',
      system: [
        { text: staticSystem(ctx), cache: true },
        { text: `${profielBlok}\n\nTAAK NU: geef het eerste zetje bij dit doel. Geen verhelderingsvraag nodig.`, cache: false },
      ],
      user: `Doel: ${profile.goal_text}`,
      schema: ZETJE_SCHEMA,
      maxTokens: 6000,
      effort: 'medium',
    }));
  } catch (err) {
    console.error('scan-vrij zetje', err.message);
    return res.status(500).json({ error: 'fout' });
  }

  const zetje = { badge: z.badge, titel: z.titel, intro: z.intro, stappen: (z.stappen || []).slice(0, 3) };
  await supabase.from('session_messages').insert({ session_id: sessie.id, positie: 1, role: 'assistant', content: JSON.stringify(zetje) });
  return res.status(200).json({ ...zetje, sessionId: sessie.id });
}

async function handleLead(req, res, tenant) {
  const anonId = String(req.body?.anonId || '').trim();
  const profileId = String(req.body?.profileId || '').trim();
  const email = schoon(req.body?.email, 200);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Vul een geldig e-mailadres in' });

  const { data: profile } = await supabase
    .from('profiles').select('main_block').eq('id', profileId).eq('user_key', anonId).maybeSingle();

  const { error: lErr } = await supabase.from('leads').insert({
    email, context: CONTEXT_KEY, main_block: profile?.main_block || null, profile_id: profileId || null, bron: 'scan',
  });
  if (lErr) { console.error('scan-vrij lead', lErr.message); return res.status(500).json({ error: 'fout' }); }

  // Trial-invite van 7 dagen, alleen bruikbaar door de aanvrager zelf (max_uses 1).
  let link = null;
  if (tenant) {
    const { data: product } = await supabase.from('products').select('id').eq('slug', 'zetjes').maybeSingle();
    const { data: invite, error: iErr } = await supabase.from('invites').insert({
      tenant_id: tenant.id,
      product_id: product?.id || null,
      context: CONTEXT_KEY,
      theme: CONTEXT_KEY,
      label: 'TRIAL vanaf Doelscan',
      max_uses: 1,
      expires_at: new Date(Date.now() + TRIAL_DAGEN * 86400000).toISOString(),
      // Deed net al de gratis Doelscan; niet nog eens vragen in de app zelf.
      // (De app gebruikt bij het eerste bezoek een eigen, nieuw anoniem id,
      // dus het profiel van de losse scan koppelt niet vanzelf mee.)
      scan_required: false,
    }).select('token').single();
    if (!iErr && invite) {
      const base = (process.env.APP_URL || 'https://happly-zetjes.vercel.app').replace(/\/$/, '');
      link = `${base}/?token=${invite.token}`;
    } else if (iErr) {
      console.error('scan-vrij trial-invite', iErr.message);
    }
  }

  await supabase.from('funnel_events').insert({ event: 'losse_scan_lead', src: 'scan', user_key: anonId, meta: { email_gegeven: true } });

  return res.status(200).json({ ok: true, link });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const tenant = await personalTenant();

  try {
    const phase = req.body?.phase;
    if (phase === 'scan') return await handleScan(req, res, tenant);
    if (phase === 'zetje') return await handleZetje(req, res, tenant);
    if (phase === 'lead') return await handleLead(req, res, tenant);
    return res.status(400).json({ error: 'Onbekende fase' });
  } catch (err) {
    console.error('scan-vrij', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
