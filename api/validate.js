// api/validate.js
// POST /api/validate { token, anonId }
// Controleert de link (bestaat, actief, niet verlopen, niet vol), meldt een nieuw
// toestel aan en geeft de context terug. De frontend kiest nooit zelf de context.

const { supabase } = require('./_lib/supabase');
const { cors, resolveAccess, sendAccessError } = require('./_lib/access');

const TERUGVRAAG_NA_UUR = 2;
const TERUGVRAAG_MAX_DAGEN = 30;

// Het laatste zetje zonder terugkoppeling, als het minstens 2 uur oud is:
// daar vragen we bij dit bezoek naar ("Heeft het geholpen?").
async function openFeedback(anonId, inviteId) {
  const tot = new Date(Date.now() - TERUGVRAAG_NA_UUR * 3600000).toISOString();
  const vanaf = new Date(Date.now() - TERUGVRAAG_MAX_DAGEN * 86400000).toISOString();
  const { data: s } = await supabase
    .from('sessions').select('id')
    .eq('anon_id', anonId).eq('invite_id', inviteId)
    .not('pattern', 'is', null).is('feedback', null)
    .lte('created_at', tot).gte('created_at', vanaf)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!s) return null;
  const { data: m } = await supabase
    .from('session_messages').select('content')
    .eq('session_id', s.id).eq('role', 'assistant')
    .order('positie', { ascending: false }).limit(1).maybeSingle();
  let titel = null;
  try { titel = JSON.parse(m?.content || '{}').titel || null; } catch {}
  return { sessionId: s.id, titel };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, anonId } = req.body || {};
  try {
    const a = await resolveAccess({ token, anonId, register: true });
    return res.status(200).json({
      valid: true,
      anonId: a.anonId,
      context: a.ctx.key,
      label: a.ctx.label,
      ui: a.ctx.ui,
      phase: a.phase,
      weekSinceStart: a.weekSinceStart,
      tenantType: a.invite.tenants?.type || null,
      productName: a.invite.products?.name || 'Zetjes',
      consent: !!a.profile?.consent_at,
      openFeedback: a.profile?.consent_at ? await openFeedback(a.anonId, a.invite.id) : null,
    });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('validate', err.message);
    return res.status(500).json({ valid: false, reason: 'fout' });
  }
};
