// api/verwijder.js
// POST /api/verwijder { token, anonId }
// Verwijdert direct alle gegevens van deze gebruiker: berichten, sessies,
// Doelscan-profielen, het funnelspoor en het toestemmingsprofiel.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId });

    const { data: sessions, error: sErr } = await supabase
      .from('sessions').select('id').eq('anon_id', a.anonId);
    if (sErr) throw sErr;
    const ids = (sessions || []).map((s) => s.id);

    if (ids.length) {
      const { error: mErr } = await supabase.from('session_messages').delete().in('session_id', ids);
      if (mErr) throw mErr;
      // Sessies eerst, dan pas de profielen: profile_id staat op SET NULL,
      // maar sessies verdwijnen toch liever mee dan dat ze een dood profiel houden.
      const { error: dErr } = await supabase.from('sessions').delete().in('id', ids);
      if (dErr) throw dErr;
    }
    const { error: dsErr } = await supabase.from('profiles').delete().eq('user_key', a.anonId);
    if (dsErr) throw dsErr;
    const { error: fErr } = await supabase.from('funnel_events').delete().eq('user_key', a.anonId);
    if (fErr) throw fErr;
    const { error: pErr } = await supabase.from('user_profiles').delete().eq('anon_id', a.anonId);
    if (pErr) throw pErr;

    // Oude persoonlijke link: het id loskoppelen, zodat een volgend bezoek als nieuw begint.
    if (a.legacy) {
      const { error: iErr } = await supabase.from('invites').update({ anon_id: null }).eq('id', a.invite.id);
      if (iErr) throw iErr;
    }

    return res.status(200).json({ ok: true, verwijderd: ids.length });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('verwijder', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
