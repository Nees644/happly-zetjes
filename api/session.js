// api/session.js
// POST /api/session { token, sessionId, phase, data }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, sessionId, phase, data } = req.body || {};

  const { data: invite, error } = await supabase
    .from('invites')
    .select('tenant_id, product_id, anon_id, active')
    .eq('token', token)
    .single();

  if (error || !invite || !invite.active) return res.status(401).json({ error: 'Unauthorized' });

  const { tenant_id, product_id, anon_id } = invite;

  if (phase === 'start') {
    const { data: row, error: err } = await supabase
      .from('sessions')
      .insert({
        tenant_id, product_id, anon_id,
        situation: data.situation,
        clarify_q: data.clarify_q || null,
        clarify_a: data.clarify_a || null,
      })
      .select('id').single();
    if (err) return res.status(500).json({ error: err.message });
    return res.status(200).json({ sessionId: row.id });
  }

  if (phase === 'zetje' && sessionId) {
    const { error: err } = await supabase.from('sessions').update({
      zetje_badge:  data.badge,
      zetje_title:  data.titel,
      zetje_intro:  data.intro,
      zetje_steps:  data.stappen,
      blocker_type: data.blocker_type || null,
    }).eq('id', sessionId).eq('anon_id', anon_id);
    if (err) return res.status(500).json({ error: err.message });
    return res.status(200).json({ ok: true });
  }

  if (phase === 'feedback' && sessionId) {
    const { error: err } = await supabase.from('sessions').update({
      feedback: data.feedback
    }).eq('id', sessionId).eq('anon_id', anon_id);
    if (err) return res.status(500).json({ error: err.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown phase' });
}
