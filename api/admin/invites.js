// api/admin/invites.js
// POST /api/admin/invites { tenantSlug, productSlug, count, appUrl,
//   context, label, startDate, maxUses, expiresAt, nieuweTenant: { name, type, contactEmail } }
// Met nieuweTenant wordt de organisatie aangemaakt als de slug nog niet bestaat.
// Beheerscherm: /beheer.html

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { cors } = require('../_lib/access');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'POST, GET, OPTIONS', headers: 'Content-Type, x-admin-key' });
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Zonder ingestelde sleutel staat beheer dicht, niet open.
  const verwacht = process.env.ADMIN_KEY;
  if (!verwacht) return res.status(503).json({ error: 'Beheer niet geconfigureerd' });
  const adminKey = String(req.headers['x-admin-key'] || req.body?.adminKey || '');
  const a = crypto.createHash('sha256').update(adminKey).digest();
  const b = crypto.createHash('sha256').update(verwacht).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const {
      tenantSlug, productSlug = 'zetjes', count = 1, appUrl,
      context, label, startDate, maxUses, expiresAt, nieuweTenant,
    } = req.body || {};

    const CONTEXTEN = ['werk', 'ondernemen', 'sales', 'managers', 'gli', 'voornemen', 'rookvrij'];
    if (context && !CONTEXTEN.includes(context)) return res.status(400).json({ error: `Onbekende context '${context}'` });
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ error: 'startDate als JJJJ-MM-DD' });
    const aantal = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);
    const max = maxUses ? parseInt(maxUses, 10) : null;
    if (max !== null && !(max > 0)) return res.status(400).json({ error: 'maxUses moet groter dan 0 zijn' });

    let { data: tenant } = await supabase
      .from('tenants').select('id, name').eq('slug', tenantSlug).eq('active', true).maybeSingle();
    if (!tenant && nieuweTenant?.name) {
      const { data: nieuw, error: nErr } = await supabase.from('tenants').insert({
        name: nieuweTenant.name,
        slug: tenantSlug,
        type: nieuweTenant.type || (context === 'gli' ? 'gli_aanbieder' : 'werkgever'),
        contact_email: nieuweTenant.contactEmail || null,
      }).select('id, name').single();
      if (nErr) return res.status(500).json({ error: nErr.message });
      tenant = nieuw;
    }
    if (!tenant) return res.status(404).json({ error: `Organisatie '${tenantSlug}' niet gevonden` });

    const { data: product, error: pErr } = await supabase
      .from('products').select('id, name').eq('slug', productSlug).eq('active', true).single();
    if (pErr || !product) return res.status(404).json({ error: `Product '${productSlug}' not found` });

    const inserts = Array.from({ length: aantal }, () => ({
      tenant_id: tenant.id,
      product_id: product.id,
      ...(context ? { context } : {}),
      ...(label ? { label: String(label).slice(0, 120) } : {}),
      ...(startDate ? { start_date: startDate } : {}),
      ...(max ? { max_uses: max } : {}),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    }));

    const { data: invites, error: iErr } = await supabase
      .from('invites').insert(inserts).select('token');
    if (iErr) return res.status(500).json({ error: iErr.message });

    const baseUrl = appUrl || process.env.APP_URL || `https://${req.headers.host}`;
    const links = invites.map(i => `${baseUrl}/?token=${i.token}`);

    return res.status(200).json({ tenant: tenant.name, product: product.name, count: links.length, links });
  }

  return res.status(405).end();
};
