// api/claude.js
// POST /api/claude { token, anonId, phase: 'clarify'|'zetje', userMsg, clarifyAnswer, sessionId }
// Laadt de context uit de invite, bewaakt de poortwachter, praat met Claude en
// slaat de sessie server-side op (labels in sessions, tekst in session_messages).

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');
const { staticSystem } = require('./_lib/contexts');
const { jsonCall } = require('./_lib/anthropic');

const MAX_INPUT = 2000;

const CLARIFY_SCHEMA = {
  type: 'object',
  properties: {
    vraag: { type: 'string' },
    opties: { type: 'array', items: { type: 'string' } },
  },
  required: ['vraag', 'opties'],
  additionalProperties: false,
};

const ZETJE_SCHEMA = {
  type: 'object',
  properties: {
    badge: { type: 'string' },
    titel: { type: 'string' },
    intro: { type: 'string' },
    stappen: { type: 'array', items: { type: 'string' } },
    pattern: { type: 'string', enum: ['energie', 'vertrouwen', 'weerstand', 'overtuigingen'] },
    intervention: { type: 'string', enum: ['kleine_handeling', 'gedachte_herformuleren', 'gesprek_voorbereiden', 'eigen_reden', 'rust', 'anders'] },
    blocker_type: { type: 'string', enum: ['perfectie', 'uitstellen', 'schaamte', 'overthinking', 'twijfel', 'loslaten', 'koers', 'communicatie', 'energie', 'anders'] },
    moment: { type: 'string', enum: ['schaamte', 'dip', 'groep', 'stilte', 'geen'] },
  },
  required: ['badge', 'titel', 'intro', 'stappen', 'pattern', 'intervention', 'blocker_type', 'moment'],
  additionalProperties: false,
};

function guardSchema(categorieen) {
  return {
    type: 'object',
    properties: { categorie: { type: 'string', enum: categorieen } },
    required: ['categorie'],
    additionalProperties: false,
  };
}

// Variabel deel van de systeemprompt: komt na het cache-breekpunt.
function variableSystem(a) {
  const parts = [];
  if (a.ctx.faseweter && a.phase) {
    parts.push(`FASE: week ${a.weekSinceStart} sinds de start van de groep. ${a.ctx.fasen[a.phase]}`);
  }
  if (a.profile?.profiel_samenvatting) {
    parts.push(`WAT EERDER BIJ DEZE PERSOON SPEELDE (alleen als achtergrond):\n${a.profile.profiel_samenvatting}`);
  }
  return parts.join('\n\n');
}

function systemBlocks(a, taak) {
  return [
    { text: staticSystem(a.ctx), cache: true },
    { text: [variableSystem(a), taak].filter(Boolean).join('\n\n'), cache: false },
  ];
}

async function addMessage(sessionId, role, content) {
  if (!content) return;
  const { count } = await supabase
    .from('session_messages').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
  const { error } = await supabase
    .from('session_messages').insert({ session_id: sessionId, positie: (count || 0) + 1, role, content });
  if (error) throw error;
}

async function createSession(a, fields = {}) {
  const { data, error } = await supabase.from('sessions').insert({
    tenant_id: a.invite.tenant_id,
    product_id: a.invite.product_id,
    invite_id: a.invite.id,
    anon_id: a.anonId,
    context: a.ctx.key,
    theme: a.ctx.key,
    phase: a.phase,
    week_since_start: a.weekSinceStart,
    ...fields,
  }).select('id, created_at').single();
  if (error) throw error;
  return data;
}

async function loadSession(a, sessionId) {
  if (!sessionId) return null;
  const { data } = await supabase
    .from('sessions').select('id, created_at')
    .eq('id', sessionId).eq('anon_id', a.anonId).eq('invite_id', a.invite.id).maybeSingle();
  return data || null;
}

async function firstUserMessage(sessionId) {
  const { data } = await supabase
    .from('session_messages').select('content')
    .eq('session_id', sessionId).eq('role', 'user').order('positie').limit(1).maybeSingle();
  return data?.content || null;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId, phase, sessionId } = req.body || {};
  const userMsg = String(req.body?.userMsg || '').slice(0, MAX_INPUT).trim();
  const clarifyAnswer = String(req.body?.clarifyAnswer || '').slice(0, MAX_INPUT).trim();

  let a;
  try {
    a = await resolveAccess({ token, anonId });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('claude access', err.message);
    return res.status(500).json({ error: 'fout' });
  }
  if (!a.profile?.consent_at) return res.status(403).json({ reason: 'toestemming' });

  try {
    // ── FASE 1: poortwachter + verhelderingsvraag ────────────────
    if (phase === 'clarify') {
      if (!userMsg) return res.status(400).json({ error: 'Lege invoer' });
      const pw = a.ctx.poortwachter;

      let categorie = 'ok';
      try {
        const { data: guard } = await jsonCall({
          label: 'poortwachter',
          system: [{ text: `Je bent de poortwachter van Zetjes. Je classificeert alleen, je antwoordt de gebruiker niet.
${pw.beschrijving}
Kies precies één categorie uit: ${pw.categorieen.join(', ')}.
crisis gaat altijd voor: kies crisis bij elk signaal van gedachten aan zelfdoding, zelfbeschadiging of acuut gevaar. Twijfel je tussen ok en een andere categorie zonder crisis-signaal, kies dan ok.`, cache: false }],
          user: userMsg,
          schema: guardSchema(pw.categorieen),
          maxTokens: 256,
          thinking: false,
        });
        categorie = guard?.categorie || 'ok';
      } catch (err) {
        // Poortwachter faalt: doorgaan, de systeemprompt bevat dezelfde grenzen.
        console.error('poortwachter', err.message);
      }

      if (categorie !== 'ok') {
        const redirect = pw.teksten[categorie] || pw.teksten.offtopic;
        const s = await createSession(a, {
          gatekeeper_triggered: true,
          gatekeeper_reason: categorie === 'crisis' ? 'mentaal' : categorie,
        });
        await addMessage(s.id, 'user', userMsg);
        await addMessage(s.id, 'assistant', redirect);
        return res.status(200).json({ off_topic: true, crisis: categorie === 'crisis', redirect, sessionId: s.id });
      }

      const s = await createSession(a);
      await addMessage(s.id, 'user', userMsg);

      let clarify;
      try {
        ({ data: clarify } = await jsonCall({
          label: 'clarify',
          system: systemBlocks(a, 'TAAK NU: stel de verhelderingsvraag. Geef precies drie antwoordopties.'),
          user: userMsg,
          schema: CLARIFY_SCHEMA,
          effort: 'low',
        }));
      } catch (err) {
        console.error('clarify', err.message);
        clarify = { vraag: 'Wat maakt dit het moeilijkst voor je?', opties: ['Ik weet het niet', 'De druk van anderen', 'Mijn eigen twijfel'] };
      }
      const opties = (clarify.opties || []).slice(0, 3);
      await addMessage(s.id, 'assistant', clarify.vraag);
      return res.status(200).json({ off_topic: false, vraag: clarify.vraag, opties, sessionId: s.id });
    }

    // ── FASE 2: zetje ────────────────────────────────────────────
    if (phase === 'zetje') {
      let s = await loadSession(a, sessionId);
      let situatie = s ? await firstUserMessage(s.id) : null;
      if (!s) {
        if (!userMsg) return res.status(400).json({ error: 'Lege invoer' });
        s = await createSession(a);
        await addMessage(s.id, 'user', userMsg);
        situatie = userMsg;
      }
      if (clarifyAnswer) await addMessage(s.id, 'user', clarifyAnswer);

      const { data: z } = await jsonCall({
        label: 'zetje',
        system: systemBlocks(a, 'TAAK NU: geef het zetje, met de labels voor analyse.'),
        user: `Situatie: ${situatie || userMsg}\nAntwoord op de verhelderingsvraag: ${clarifyAnswer || 'geen'}`,
        schema: ZETJE_SCHEMA,
        maxTokens: 6000,
        effort: 'medium',
      });

      const zetje = { badge: z.badge, titel: z.titel, intro: z.intro, stappen: (z.stappen || []).slice(0, 3) };
      await addMessage(s.id, 'assistant', JSON.stringify(zetje));
      const { error } = await supabase.from('sessions').update({
        pattern: z.pattern,
        intervention: z.intervention,
        blocker_type: z.blocker_type,
        moment: a.ctx.key === 'gli' && z.moment !== 'geen' ? z.moment : null,
        duration_seconds: Math.round((Date.now() - Date.parse(s.created_at)) / 1000),
      }).eq('id', s.id);
      if (error) throw error;

      return res.status(200).json({ ...zetje, sessionId: s.id });
    }

    return res.status(400).json({ error: 'Onbekende fase' });
  } catch (err) {
    console.error('claude', err.message);
    return res.status(500).json({ error: 'API call failed' });
  }
};
