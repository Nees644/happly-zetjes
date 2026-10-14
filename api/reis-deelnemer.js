// api/reis-deelnemer.js
// GET /api/reis-deelnemer?token=<reistoken>
// Voor de scanpagina (scan.happly.nl) in een reis: voornaam, e-mailadres en
// het doel van de kaart, zodat de deelnemer die niet opnieuw hoeft in te
// vullen. Wie de reistoken heeft, is de deelnemer: de token is zijn magische
// link. Niets anders gaat terug, geen metingen, geen kaartinhoud behalve het
// doel en het als-dan-plan dat de uitslagpagina toont als "wat jij gaat doen".

const { cors } = require('./_lib/access');
const { laadReis, laadKaart } = require('./_lib/reis');

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'GET, OPTIONS' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const reis = await laadReis(req.query?.token);
    if (!reis || !reis.invites?.active) return res.status(404).json({ error: 'onbekend' });
    const kaart = await laadKaart(reis.id);
    return res.status(200).json({
      ok: true,
      voornaam: reis.voornaam,
      email: reis.email,
      programma: reis.invites.programma_naam || reis.invites.label || null,
      doel: kaart?.doel || null,
      alsdan: kaart ? { als: kaart.vak3_als, dan: kaart.vak3_dan } : null,
      startmeting: !!reis.scan_start,
    });
  } catch (err) {
    console.error('reis-deelnemer', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
