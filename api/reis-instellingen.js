// api/reis-instellingen.js
// POST /api/reis-instellingen { token, signaalOk, proactiefOk }
// De twee keuzes van de deelnemer, aan of uit te zetten vanuit de reis.
// Verwijderen loopt via api/verwijder.js met het anonieme id.

const { supabase } = require('./_lib/supabase');
const { cors } = require('./_lib/access');
const { laadReis, log } = require('./_lib/reis');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { token, signaalOk, proactiefOk } = req.body || {};
  try {
    const reis = await laadReis(token);
    if (!reis) return res.status(404).json({ error: 'onbekend' });
    const update = {};
    if (typeof signaalOk === 'boolean') update.signaal_ok = signaalOk;
    if (typeof proactiefOk === 'boolean') update.proactief_ok = proactiefOk;
    if (!Object.keys(update).length) return res.status(400).json({ error: 'niets te wijzigen' });
    const { error } = await supabase.from('reizen').update(update).eq('id', reis.id);
    if (error) throw error;
    await log('instellingen_gewijzigd', reis, update);
    return res.status(200).json({ ok: true, signaalOk: update.signaal_ok ?? reis.signaal_ok, proactiefOk: update.proactief_ok ?? reis.proactief_ok });
  } catch (err) {
    console.error('reis-instellingen', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
