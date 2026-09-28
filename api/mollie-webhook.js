// api/mollie-webhook.js
// POST /api/mollie-webhook  (form-encoded, door Mollie: alleen { id })
// Haalt de betaling zelf op bij Mollie (vertrouwt niets uit het verzoek).
// Bij status 'paid': maakt een invite (tenant personal, context ondernemen,
// 12 maanden geldig, max 3 gebruikers) en mailt de link. Idempotent: dezelfde
// betaling levert nooit twee invites op.

const { supabase } = require('./_lib/supabase');
const { haalBetalingOp } = require('./_lib/mollie');
const { stuurMail } = require('./_lib/mail');

function appUrl() {
  return (process.env.APP_URL || 'https://happly-zetjes.vercel.app').replace(/\/$/, '');
}

function mailHtml(link) {
  return `<p>Gelukt! Je persoonlijke Zetjes-link staat hieronder.</p>
<p><a href="${link}">${link}</a></p>
<p>Deze link is 12 maanden geldig en werkt op maximaal 3 toestellen.</p>
<p>Vragen? Mail naar <a href="mailto:hallo@zetjes.nl">hallo@zetjes.nl</a>.</p>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const paymentId = String(req.body?.id || req.query?.id || '').trim();
  if (!paymentId) return res.status(400).end();

  try {
    const betaling = await haalBetalingOp(paymentId);
    if (betaling.status !== 'paid') return res.status(200).end();

    // Al verwerkt? Niets doen, geen tweede invite of mail.
    const { data: bestaand } = await supabase
      .from('invites').select('id').eq('mollie_payment_id', paymentId).maybeSingle();
    if (bestaand) return res.status(200).end();

    const email = String(betaling.metadata?.email || '').trim().toLowerCase();
    if (!email) { console.error('mollie-webhook: geen e-mailadres in metadata', paymentId); return res.status(200).end(); }

    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'personal').maybeSingle();
    const { data: product } = await supabase.from('products').select('id').eq('slug', 'zetjes').maybeSingle();
    if (!tenant) { console.error('mollie-webhook: tenant personal ontbreekt'); return res.status(500).end(); }

    const { data: invite, error } = await supabase.from('invites').insert({
      tenant_id: tenant.id,
      product_id: product?.id || null,
      context: 'ondernemen',
      theme: 'ondernemen',
      label: 'Zetjes | personal',
      max_uses: 3,
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
      mollie_payment_id: paymentId,
      koper_email: email,
    }).select('token').single();

    if (error) {
      // Race: twee webhook-aanroepen tegelijk konden allebei de bestaand-check
      // net vóór elkaar missen. De unique op mollie_payment_id vangt dat op.
      if (error.code === '23505') return res.status(200).end();
      console.error('mollie-webhook invite', error.message);
      return res.status(500).end();
    }

    const link = `${appUrl()}/?token=${invite.token}`;
    try {
      await stuurMail({ naar: email, onderwerp: 'Je Zetjes-link', html: mailHtml(link) });
    } catch (mailErr) {
      // Invite staat er al; Maarten kan de link handmatig doorsturen via het dashboard.
      console.error('mollie-webhook mail', mailErr.message, '| koper:', email, '| token:', invite.token);
    }

    return res.status(200).end();
  } catch (err) {
    console.error('mollie-webhook', err.message);
    return res.status(500).end();
  }
};
