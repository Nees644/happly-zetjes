// api/reis-gewoonte.js
// POST /api/reis-gewoonte { token, anonId, antwoorden: [1..7 x4] } of { ..., overgeslagen: true }
// De weekvraag van de gewoontemeting, vanuit Zetjes. De deelnemer is de
// anonieme sleutel van het toestel; de reis hoort daarbij. Er gaat niets terug
// behalve ok: de score is niet voor de deelnemer en niet voor de begeleider.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');
const { laadReisOpAnon, laadKaart, gewoonteVraag, log } = require('./_lib/reis');

function antwoord(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { token, anonId, antwoorden, overgeslagen } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId });
    const reis = await laadReisOpAnon(a.anonId);
    if (!reis) return res.status(404).json({ error: 'geen reis' });
    const kaart = await laadKaart(reis.id);
    const vraag = await gewoonteVraag(reis, kaart);
    if (!vraag) return res.status(409).json({ error: 'niet aan de beurt' });

    const rij = { reis_id: reis.id, dag: vraag.dag, overgeslagen: false };
    if (overgeslagen === true) {
      rij.overgeslagen = true;
    } else {
      const lijst = Array.isArray(antwoorden) ? antwoorden.map(antwoord) : [];
      if (lijst.length !== 4 || lijst.some((v) => v == null)) return res.status(400).json({ error: 'antwoorden' });
      [rij.a1, rij.a2, rij.a3, rij.a4] = lijst;
      rij.score = Math.round((lijst.reduce((s, v) => s + v, 0) / 4) * 100) / 100;
    }
    const { error } = await supabase.from('gewoontemeting').insert(rij);
    if (error) throw error;
    await log(rij.overgeslagen ? 'gewoonte_overgeslagen' : 'gewoonte_gemeten', reis, { dag: vraag.dag });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('reis-gewoonte', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
