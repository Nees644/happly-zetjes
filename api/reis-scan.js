// api/reis-scan.js
// POST /api/reis-scan { reisToken, meting: 'start'|'eind', scanId, index, zien, sturen, doen }
// Header: Authorization: Bearer <REIS_SCAN_SECRET>
// Alleen vanaf de scanserver (happly-scan, api/scan.js). Schrijft de vier
// getallen op de reis en zet de stap. Nooit vanuit een browser: cors staat
// dicht en het geheim is de enige sleutel.

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { laadReis, laadKaart, werkStapBij, log, REIS_TOKEN_RE } = require('./_lib/reis');

function geheimKlopt(req) {
  const verwacht = process.env.REIS_SCAN_SECRET;
  if (!verwacht) { console.error('reis-scan: REIS_SCAN_SECRET niet gezet, aanroep geweigerd'); return false; }
  const gegeven = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(gegeven).digest();
  const b = crypto.createHash('sha256').update(verwacht).digest();
  return crypto.timingSafeEqual(a, b);
}

function getal(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!geheimKlopt(req)) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  const meting = b.meting === 'eind' ? 'eind' : 'start';
  const getallen = { index: getal(b.index), zien: getal(b.zien), sturen: getal(b.sturen), doen: getal(b.doen) };
  if (!REIS_TOKEN_RE.test(String(b.reisToken || ''))) return res.status(400).json({ error: 'reisToken' });
  if (Object.values(getallen).some((v) => v == null)) return res.status(400).json({ error: 'getallen' });

  try {
    const reis = await laadReis(b.reisToken);
    if (!reis) return res.status(404).json({ error: 'onbekend' });

    // Eerste meting telt; een tweede start-meting overschrijft niet. Een
    // eindmeting mag wel opnieuw (de laatste geldt), zolang er een start is.
    const veld = meting === 'eind' ? 'scan_eind' : 'scan_start';
    if (meting === 'start' && reis.scan_start) return res.status(200).json({ ok: true, al: true });
    if (meting === 'eind' && !reis.scan_start) return res.status(409).json({ error: 'geen startmeting' });

    const nu = new Date().toISOString();
    const update = { [veld]: { ...getallen, at: nu }, [`${veld}_id`]: b.scanId || null, laatste_activiteit: nu };
    const { error } = await supabase.from('reizen').update(update).eq('id', reis.id);
    if (error) throw error;

    const kaart = await laadKaart(reis.id);
    await werkStapBij({ ...reis, ...update }, kaart);
    await log(meting === 'eind' ? 'scan_eind' : 'scan_start', reis, { index: getallen.index });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reis-scan', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
