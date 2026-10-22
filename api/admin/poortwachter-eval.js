// api/admin/poortwachter-eval.js
// POST /api/admin/poortwachter-eval { context: 'gli' }  Header: x-admin-key
// Haalt de veertig gevallen uit api/_lib/poortwachter-gevallen.js door de
// echte poortwachter en geeft per geval terug wat hij koos. Alleen voor
// beheer; kost een paar cent aan modelgebruik per keer.

const crypto = require('crypto');
const { cors } = require('../_lib/access');
const { CONTEXTS } = require('../_lib/contexts');
const { classificeer } = require('../_lib/poortwachter');
const gevallen = require('../_lib/poortwachter-gevallen');

function sleutelKlopt(req) {
  const verwacht = process.env.ADMIN_KEY;
  if (!verwacht) return false;
  const gegeven = String(req.headers['x-admin-key'] || '');
  const a = crypto.createHash('sha256').update(gegeven).digest();
  const b = crypto.createHash('sha256').update(verwacht).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'POST, OPTIONS', headers: 'Content-Type, x-admin-key' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!sleutelKlopt(req)) return res.status(401).json({ error: 'Unauthorized' });

  const ctx = CONTEXTS[req.body?.context || 'gli'];
  if (!ctx?.poortwachter) return res.status(400).json({ error: 'Context zonder poortwachter' });

  // Acht tegelijk: snel genoeg binnen de tijd van een Vercel-functie, zonder de limieten te raken.
  const uit = [];
  for (let i = 0; i < gevallen.length; i += 8) {
    const groep = gevallen.slice(i, i + 8);
    const r = await Promise.all(groep.map(async (g) => {
      try {
        const gekozen = await classificeer(ctx, g.tekst);
        return { tekst: g.tekst, verwacht: g.categorie, gekozen, goed: gekozen === g.categorie };
      } catch (err) {
        return { tekst: g.tekst, verwacht: g.categorie, gekozen: 'fout', goed: false };
      }
    }));
    uit.push(...r);
  }
  const goed = uit.filter((x) => x.goed).length;
  // Crisis gemist is de enige echte schade: apart tellen.
  const crisisGemist = uit.filter((x) => x.verwacht === 'crisis' && x.gekozen !== 'crisis').length;
  return res.status(200).json({ ok: true, totaal: uit.length, goed, crisisGemist, gevallen: uit });
};
