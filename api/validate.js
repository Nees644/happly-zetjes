// api/validate.js
// POST /api/validate { token, anonId }
// Controleert de link (bestaat, actief, niet verlopen, niet vol), meldt een nieuw
// toestel aan en geeft de context terug. De frontend kiest nooit zelf de context.

const { cors, resolveAccess, sendAccessError } = require('./_lib/access');

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
    });
  } catch (err) {
    if (sendAccessError(res, err)) return;
    console.error('validate', err.message);
    return res.status(500).json({ valid: false, reason: 'fout' });
  }
};
