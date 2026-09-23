// api/session.js
// POST /api/session { token, anonId, sessionId, phase: 'feedback', data: { feedback, toelichting } }
// Slaat de terugkoppeling op (gevraagd bij het volgende bezoek). Sessies zelf worden
// aangemaakt in api/claude.js.

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
        .from('sessions').select('id')
        .eq('id', sessionId).eq('anon_id', a.anonId).eq('invite_id', a.invite.id).maybeSingle();
      if (!s) return res.status(404).json({ error: 'Sessie niet gevonden' });
      // duration_seconds blijft de tijd tot het zetje; de terugvraag komt uren of dagen later.
      const { error } = await supabase.from('sessions').update({ feedback: data.feedback }).eq('id', s.id);
      if (error) throw error;

      // Toelichting bij "Niet echt": vrije tekst, dus in session_messages (nooit in rapportages).
      const toelichting = String(data.toelichting || '').trim().slice(0, 250);
      if (data.feedback === 'nee' && toelichting) {
        const { count } = await supabase
          .from('session_messages').select('id', { count: 'exact', head: true }).eq('session_id', s.id);
        const { error: mErr } = await supabase.from('session_messages').insert({
          session_id: s.id, positie: (count || 0) + 1, role: 'user', soort: 'feedback_toelichting', content: toelichting,
        });
        if (mErr) throw mErr;
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Onbekende fase' });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('session', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
