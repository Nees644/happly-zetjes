// api/reis-kaart.js
// POST /api/reis-kaart { token, kaart: { doel, vak1_moment, vak1_weekdag, vak1_dagdeel,
//   vak1_zin, vak2_inrichting, vak3_als, vak3_dan, vak4_woorden } }
// Slaat de Volhoudkaart op als nieuwe versie. De oude blijft staan; Zetjes
// leest de hoogste. Vak 3 (als-dan) is het minimum: zonder plan geen kaart.

const { supabase } = require('./_lib/supabase');
const { cors } = require('./_lib/access');
const { laadReis, laadKaart, schoon, log, werkStapBij } = require('./_lib/reis');

const DAGDELEN = ['ochtend', 'middag', 'avond'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, kaart: k } = req.body || {};
  if (!k || typeof k !== 'object') return res.status(400).json({ error: 'Geen kaart meegegeven' });

  const rij = {
    doel: schoon(k.doel, 200),
    vak1_moment: schoon(k.vak1_moment),
    vak1_weekdag: Number.isInteger(k.vak1_weekdag) && k.vak1_weekdag >= 1 && k.vak1_weekdag <= 7 ? k.vak1_weekdag : null,
    vak1_dagdeel: DAGDELEN.includes(k.vak1_dagdeel) ? k.vak1_dagdeel : null,
    vak1_zin: schoon(k.vak1_zin, 200),
    vak2_inrichting: schoon(k.vak2_inrichting),
    vak3_als: schoon(k.vak3_als, 200),
    vak3_dan: schoon(k.vak3_dan, 200),
    vak4_woorden: schoon(k.vak4_woorden, 200),
  };
  if (!rij.vak3_als || !rij.vak3_dan) {
    return res.status(400).json({ error: 'Vul je als-dan-plan in, dat is het hart van de kaart' });
  }

  try {
    const reis = await laadReis(token);
    if (!reis) return res.status(404).json({ error: 'onbekend' });
    if (!reis.invites?.active) return res.status(403).json({ error: 'inactief' });

    const vorige = await laadKaart(reis.id);
    const versie = vorige ? vorige.versie + 1 : 1;
    const { data: nieuw, error } = await supabase
      .from('kaarten').insert({ reis_id: reis.id, versie, ...rij }).select('id, versie, created_at').single();
    if (error) throw error;

    await supabase.from('reizen').update({ laatste_activiteit: new Date().toISOString() }).eq('id', reis.id);
    await werkStapBij(reis, nieuw);
    await log(versie === 1 ? 'kaart_ingevuld' : 'kaart_aangepast', reis, {
      versie, proactief_mogelijk: !!(rij.vak1_weekdag && rij.vak1_dagdeel),
    });
    return res.status(200).json({ ok: true, versie: nieuw.versie, datum: nieuw.created_at });
  } catch (err) {
    console.error('reis-kaart', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
