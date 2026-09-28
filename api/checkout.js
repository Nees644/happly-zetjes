// api/checkout.js
// POST /api/checkout { email }
// Maakt een Mollie-betaling aan voor Zetjes | personal (€79 per jaar) en
// stuurt de betaalpagina terug. Het e-mailadres gaat mee als metadata, niet
// in de URL. De invite zelf wordt pas aangemaakt door de webhook, na
// bevestigde betaling (api/mollie-webhook.js).

const { maakBetaling } = require('./_lib/mollie');

const PRIJS = '79.00';
const OMSCHRIJVING = 'Zetjes | personal jaarabonnement';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function appUrl() {
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

  try {
    const betaling = await maakBetaling({
      bedrag: PRIJS,
      omschrijving: OMSCHRIJVING,
      redirectUrl: `${appUrl()}/bedankt.html`,
      webhookUrl: `${appUrl()}/api/mollie-webhook`,
      metadata: { email },
    });
    if (!betaling.checkoutUrl) throw new Error('Geen betaalpagina ontvangen van Mollie');
    return res.status(200).json({ checkoutUrl: betaling.checkoutUrl });
  } catch (err) {
    console.error('checkout', err.message);
    return res.status(500).json({ error: 'Betaling starten is niet gelukt. Probeer het zo opnieuw.' });
  }
};
