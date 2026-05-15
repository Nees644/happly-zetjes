// api/claude.js
// POST /api/claude { token, phase, userMsg, clarifyAnswer }
// Valideert token, laadt thema-config, proxiet naar Anthropic

import { createClient } from '@supabase/supabase-js';
import { getTheme } from './themes.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getInvite(token) {
  const { data, error } = await supabase
    .from('invites')
    .select('tenant_id, product_id, anon_id, active, theme')
    .eq('token', token)
    .single();
  if (error || !data || !data.active) return null;
  return data;
}

async function callAnthropic(system, userMsg, maxTokens = 1000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, phase, userMsg, clarifyAnswer } = req.body || {};
  const invite = await getInvite(token);
  if (!invite) return res.status(401).json({ error: 'Unauthorized' });

  // Laad thema-config — fallback naar 'werk'
  const themeSlug = invite.theme || 'werk';
  const theme = getTheme(themeSlug);

  try {

    // ── FASE 1: poortwachter + verduidelijkingsvraag ─────────────────
    if (phase === 'clarify') {

      // Stap 1: poortwachter check
      const guardData = await callAnthropic(
        theme.poortwachter_prompt,
        userMsg,
        100
      );
      const guardText = guardData?.content?.[0]?.text || '{"relevant": true}';
      let guard = { relevant: true };
      try { guard = JSON.parse(guardText.match(/\{.*\}/s)?.[0] || '{"relevant":true}'); } catch {}

      if (!guard.relevant) {
        return res.status(200).json({
          off_topic: true,
          redirect: `Zetjes helpt je bij wat je tegenhoudt ${themeSlug === 'ondernemen' ? 'als ondernemer' : 'op het werk of in je hoofd'}. Wat speelt er voor jou op dat vlak?`
        });
      }

      // Stap 2: verduidelijkingsvraag genereren
      const clarifySystem = `${theme.systeem_prompt}

TAAK: Genereer één korte, gerichte verduidelijkingsvraag op basis van wat de gebruiker deelt.
Genereer ook 3 korte klikbare antwoordopties (max 6 woorden elk).
Antwoord alleen in dit JSON-formaat:
{
  "vraag": "...",
  "opties": ["...", "...", "..."]
}`;

      const clarifyData = await callAnthropic(clarifySystem, userMsg, 300);
      const clarifyText = clarifyData?.content?.[0]?.text || '';
      let clarify = { vraag: 'Wat maakt dit het moeilijkst voor je?', opties: ['Ik weet het niet', 'De druk van anderen', 'Mijn eigen twijfel'] };
      try { clarify = JSON.parse(clarifyText.match(/\{.*\}/s)?.[0] || '{}'); } catch {}

      return res.status(200).json({ off_topic: false, ...clarify });
    }

    // ── FASE 2: zetje genereren ──────────────────────────────────────
    if (phase === 'zetje') {

      const zetjeSystem = `${theme.systeem_prompt}

TAAK: Genereer een persoonlijk Zetje op basis van de situatie en het antwoord op de verduidelijkingsvraag.
Antwoord alleen in dit JSON-formaat:
{
  "badge": "Korte naam van de blokkade (max 2 woorden, bijv. Perfectie, Twijfel, Loslaten)",
  "titel": "Prikkelende titel van het Zetje (max 8 woorden)",
  "intro": "Één zin die laat voelen dat je begrijpt wat er speelt (empathisch, geen oordeel)",
  "stappen": [
    "Concrete stap 1 (max 15 woorden)",
    "Concrete stap 2 (max 15 woorden)",
    "Concrete stap 3 (max 15 woorden)"
  ],
  "blocker_type": "intern label voor analyse: perfectie | uitstellen | schaamte | overthinking | twijfel | loslaten | koers | communicatie | energie | anders"
}`;

      const context = `Situatie: ${userMsg}\nVerduidelijking: ${clarifyAnswer || 'geen'}`;
      const zetjeData = await callAnthropic(zetjeSystem, context, 600);
      const zetjeText = zetjeData?.content?.[0]?.text || '';
      let zetje = {
        badge: 'Zetje',
        titel: 'Eén stap is genoeg',
        intro: 'Je zit vast — en dat is oké. Hier is wat je nu kunt doen.',
        stappen: ['Adem even uit', 'Kies één kleine actie', 'Doe die actie nu'],
        blocker_type: 'anders'
      };
      try { zetje = JSON.parse(zetjeText.match(/\{.*\}/s)?.[0] || '{}'); } catch {}

      return res.status(200).json(zetje);
    }

    return res.status(400).json({ error: 'Onbekende fase' });

  } catch (err) {
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
