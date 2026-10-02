// api/checkout.js
// POST /api/checkout { email, product? }
// Maakt een Mollie-betaling aan (standaard Zetjes | personal, €79 per jaar;
// product 'rookvrij': Zetjes Rookvrij, €19,95 voor 3 maanden) en stuurt de
// betaalpagina terug. Prijzen staan in _lib/producten.js. Het e-mailadres gaat mee als metadata, niet
// in de URL. De invite zelf wordt pas aangemaakt door de webhook, na
// bevestigde betaling (api/mollie-webhook.js).

const { maakBetaling } = require('./_lib/mollie');
const { getProduct } = require('./_lib/producten');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Bij voorkeur het adres waar dit verzoek zelf binnenkwam (klopt dan ook op
// een preview-deploy); anders de vaste APP_URL.
function appUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) return `https://${host}`;
  return (process.env.APP_URL || 'https://happly-zetjes.vercel.app').replace(/\/$/, '');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Vul een geldig e-mailadres in' });
  }
  const product = getProduct(String(req.body?.product || 'personal'));
  if (!product) return res.status(400).json({ error: 'Onbekend product' });

  try {
    const betaling = await maakBetaling({
      bedrag: product.prijs,
      omschrijving: product.omschrijving,
      redirectUrl: `${appUrl(req)}/bedankt.html`,
      webhookUrl: `${appUrl(req)}/api/mollie-webhook`,
      metadata: { email, product: product.naam },
    });
    if (!betaling.checkoutUrl) throw new Error('Geen betaalpagina ontvangen van Mollie');
    return res.status(200).json({ checkoutUrl: betaling.checkoutUrl });
  } catch (err) {
    console.error('checkout', err.message);
    return res.status(500).json({ error: 'Betaling starten is niet gelukt. Probeer het zo opnieuw.' });
  }
};
