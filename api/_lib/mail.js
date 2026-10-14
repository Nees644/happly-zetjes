// api/_lib/mail.js
// Kleine wrapper om Resend, verzendadres hallo@zetjes.nl.

const AFZENDER = 'Zetjes <hallo@zetjes.nl>';

// afzenderNaam: de naam voor de @-regel, bijvoorbeeld "fit20 Zaltbommel via Zetjes".
// Het adres blijft hallo@zetjes.nl, want dat domein is bij Resend bekend.
async function stuurMail({ naar, onderwerp, html, afzenderNaam, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY ontbreekt');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: afzenderNaam ? `${String(afzenderNaam).replace(/[<>"\r\n]/g, '')} <hallo@zetjes.nl>` : AFZENDER,
      to: naar, subject: onderwerp, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Resend-fout (${res.status})`);
  return data;
}

module.exports = { stuurMail };
