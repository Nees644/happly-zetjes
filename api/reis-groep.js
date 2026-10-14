// api/reis-groep.js
// POST /api/reis-groep, header x-admin-key (dezelfde ADMIN_KEY als api/admin/invites.js)
// { tenantSlug, label, programmaNaam, context, startDate, interventieStart,
//   maxUses, begeleiderEmail, dagenGeldig }
// Maakt een groep: een invite met is_reis = true. Geeft de groepslink en de
// begeleiderslink terug. In fase A doet Happly dit; later de aanbieder zelf.

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { cors } = require('./_lib/access');
const { appUrl, schoon } = require('./_lib/reis');

const CONTEXTEN = ['werk', 'ondernemen', 'gli', 'rookvrij', 'voornemen'];
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

function sleutelKlopt(req) {
  const verwacht = process.env.ADMIN_KEY;
  if (!verwacht) return false;
  const gegeven = String(req.headers['x-admin-key'] || req.body?.adminKey || '');
  const a = crypto.createHash('sha256').update(gegeven).digest();
  const b = crypto.createHash('sha256').update(verwacht).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'POST, OPTIONS', headers: 'Content-Type, x-admin-key' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.ADMIN_KEY) return res.status(503).json({ error: 'Beheer niet geconfigureerd' });
  if (!sleutelKlopt(req)) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  const label = schoon(b.label, 80);
  const programmaNaam = schoon(b.programmaNaam, 80) || label;
  const context = CONTEXTEN.includes(b.context) ? b.context : 'werk';
  const startDate = DATUM_RE.test(b.startDate || '') ? b.startDate : null;
  const interventieStart = DATUM_RE.test(b.interventieStart || '') ? b.interventieStart : startDate;
  const maxUses = Number.isInteger(b.maxUses) && b.maxUses > 0 ? b.maxUses : 25;
  const dagenGeldig = Number.isInteger(b.dagenGeldig) && b.dagenGeldig > 0 ? b.dagenGeldig : 100;
  const begeleiderEmail = schoon(b.begeleiderEmail, 200);
  if (!label || !startDate) return res.status(400).json({ error: 'label en startDate (JJJJ-MM-DD) zijn nodig' });

  try {
    const { data: tenant } = await supabase
      .from('tenants').select('id, name').eq('slug', b.tenantSlug).eq('active', true).maybeSingle();
    if (!tenant) return res.status(404).json({ error: `Aanbieder '${b.tenantSlug}' niet gevonden` });
    const { data: product } = await supabase.from('products').select('id').eq('slug', 'zetjes').maybeSingle();
    if (!product) return res.status(500).json({ error: 'Product zetjes ontbreekt' });

    // Verloopt na de interventiestart plus dagenGeldig: ruimte voor 66 dagen en de hermeting.
    const verloopt = new Date(Date.parse(interventieStart) + dagenGeldig * 86400000).toISOString();
    const { data: inv, error } = await supabase.from('invites').insert({
      tenant_id: tenant.id, product_id: product.id, context, label,
      programma_naam: programmaNaam, start_date: startDate, interventie_start: interventieStart,
      expires_at: verloopt, max_uses: maxUses, is_reis: true, scan_required: false, remeasure_day30: false,
      begeleider_email: begeleiderEmail,
    }).select('token, begeleider_token').single();
    if (error) throw error;

    return res.status(200).json({
      ok: true, aanbieder: tenant.name, label, programma: programmaNaam, context,
      groepslink: `${appUrl()}/start/${inv.token}`,
      begeleiderslink: `${appUrl()}/groep/${inv.begeleider_token}`,
      verlooptOp: verloopt.slice(0, 10),
    });
  } catch (err) {
    console.error('reis-groep', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
