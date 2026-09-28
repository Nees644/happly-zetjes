// api/_lib/mail.js
// Kleine wrapper om Resend, verzendadres hallo@zetjes.nl.

const AFZENDER = 'Zetjes <hallo@zetjes.nl>';

async function stuurMail({ naar, onderwerp, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY ontbreekt');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: AFZENDER, to: naar, subject: onderwerp, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Resend-fout (${res.status})`);
  return data;
}

module.exports = { stuurMail };
