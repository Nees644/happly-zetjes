// api/_lib/mollie.js
// Kleine wrapper om Mollie's REST API, geen SDK nodig voor deze twee calls.

const MOLLIE_BASE = 'https://api.mollie.com/v2';

function client() {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) throw new Error('MOLLIE_API_KEY ontbreekt');
  return key;
}

async function mollieFetch(path, options = {}) {
  const res = await fetch(`${MOLLIE_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${client()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Mollie-fout (${res.status})`);
  return data;
}

// Maakt een betaling aan. Geeft { id, checkoutUrl } terug.
async function maakBetaling({ bedrag, omschrijving, redirectUrl, webhookUrl, metadata }) {
  const data = await mollieFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: bedrag },
      description: omschrijving,
      redirectUrl,
      webhookUrl,
      metadata,
    }),
  });
  return { id: data.id, checkoutUrl: data._links?.checkout?.href || null };
}

// Haalt de betaling zelf op bij Mollie; nooit de status uit het verzoek vertrouwen.
async function haalBetalingOp(id) {
  return mollieFetch(`/payments/${encodeURIComponent(id)}`);
}

module.exports = { maakBetaling, haalBetalingOp };
