// api/session.js
// POST /api/session { token, anonId, sessionId, phase: 'feedback', data: { feedback } }
// Slaat de terugkoppeling op. Sessies zelf worden aangemaakt in api/claude.js.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');

const FEEDBACK = ['ja', 'beetje', 'nee', 'skip'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId, sessionId, phase, data } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId });

    if (phase === 'feedback' && sessionId && FEEDBACK.includes(data?.feedback)) {
      const { data: s } = await supabase
        .from('sessions').select('id, created_at')
        .eq('id', sessionId).eq('anon_id', a.anonId).eq('invite_id', a.invite.id).maybeSingle();
      if (!s) return res.status(404).json({ error: 'Sessie niet gevonden' });
      const { error } = await supabase.from('sessions').update({
        feedback: data.feedback,
        duration_seconds: Math.round((Date.now() - Date.parse(s.created_at)) / 1000),
      }).eq('id', s.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Onbekende fase' });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('session', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
