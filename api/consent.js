// api/consent.js
// POST /api/consent { token, anonId } → legt het toestemmingsmoment vast.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId });
    if (!a.profile.consent_at) {
      const { error } = await supabase
        .from('user_profiles').update({ consent_at: new Date().toISOString() }).eq('anon_id', a.anonId);
      if (error) throw error;
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('consent', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
