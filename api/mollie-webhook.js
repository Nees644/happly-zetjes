// api/mollie-webhook.js
// POST /api/mollie-webhook  (form-encoded, door Mollie: alleen { id })
// Haalt de betaling zelf op bij Mollie (vertrouwt niets uit het verzoek).
// Bij status 'paid': maakt een invite volgens het product in de metadata
// (_lib/producten.js; zonder product: Zetjes | personal) en mailt de link. Idempotent: dezelfde
// betaling levert nooit twee invites op.

const { supabase } = require('./_lib/supabase');
const { haalBetalingOp } = require('./_lib/mollie');
const { stuurMail } = require('./_lib/mail');
const { getProduct } = require('./_lib/producten');

// Zelfde adres als waar Mollie deze aanroep naartoe stuurde (klopt dan ook
// op een preview-deploy); anders de vaste APP_URL.
function appUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) return `https://${host}`;
  return (process.env.APP_URL || 'https://happly-zetjes.vercel.app').replace(/\/$/, '');
}

function mailHtml(link, product) {
  const intro = product.naam === 'rookvrij'
    ? '<p>Gelukt! Hier is je volhoudassistent voor rookvrij. Open de link op je telefoon en zet hem op je beginscherm, dan heb je hem bij de hand als de trek komt.</p>'
    : '<p>Gelukt! Je persoonlijke Zetjes-link staat hieronder.</p>';
  return `${intro}
<p><a href="${link}">${link}</a></p>
<p>Deze link is ${product.looptijdTekst} geldig en werkt op maximaal ${product.maxUses} toestellen.</p>
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

    const product = getProduct(String(betaling.metadata?.product || 'personal'));
    if (!product) { console.error('mollie-webhook: onbekend product', betaling.metadata?.product, paymentId); return res.status(200).end(); }
    if (betaling.amount?.value !== product.prijs) {
      console.error('mollie-webhook: bedrag klopt niet', betaling.amount?.value, product.prijs, paymentId);
      return res.status(200).end();
    }

    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'personal').maybeSingle();
    const { data: productRij } = await supabase.from('products').select('id').eq('slug', 'zetjes').maybeSingle();
    if (!tenant) { console.error('mollie-webhook: tenant personal ontbreekt'); return res.status(500).end(); }

    const { data: invite, error } = await supabase.from('invites').insert({
      tenant_id: tenant.id,
      product_id: productRij?.id || null,
      context: product.context,
      theme: product.context,
      label: product.label,
      max_uses: product.maxUses,
      expires_at: new Date(Date.now() + product.dagen * 86400000).toISOString(),
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

    const link = `${appUrl(req)}/?token=${invite.token}`;
    try {
      await stuurMail({ naar: email, onderwerp: product.naam === 'rookvrij' ? 'Je volhoudassistent voor rookvrij' : 'Je Zetjes-link', html: mailHtml(link, product) });
    } catch (mailErr) {
      // Invite staat er al; Maarten kan de link handmatig doorsturen via het dashboard.
      // Geen e-mailadres of token in de log: wie de log leest, kan anders het account openen.
      console.error('mollie-webhook mail', mailErr.message, '| invite:', invite.id, '| betaling:', paymentId);
    }

    return res.status(200).end();
  } catch (err) {
    console.error('mollie-webhook', err.message);
    return res.status(500).end();
  }
};
