// api/admin/invites.js
// POST /api/admin/invites { tenantSlug, productSlug, count, appUrl }

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import access from '../_lib/access.js';

const { cors } = access;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
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
    const { tenantSlug, productSlug = 'zetjes', count = 1, appUrl } = req.body || {};

    const { data: tenant, error: tErr } = await supabase
      .from('tenants').select('id, name').eq('slug', tenantSlug).eq('active', true).single();
    if (tErr || !tenant) return res.status(404).json({ error: `Tenant '${tenantSlug}' not found` });

    const { data: product, error: pErr } = await supabase
      .from('products').select('id, name').eq('slug', productSlug).eq('active', true).single();
    if (pErr || !product) return res.status(404).json({ error: `Product '${productSlug}' not found` });

    const inserts = Array.from({ length: count }, () => ({
      tenant_id: tenant.id,
      product_id: product.id,
    }));

    const { data: invites, error: iErr } = await supabase
      .from('invites').insert(inserts).select('token');
    if (iErr) return res.status(500).json({ error: iErr.message });

    const baseUrl = appUrl || process.env.APP_URL || 'https://jouw-app.vercel.app';
    const links = invites.map(i => `${baseUrl}/?token=${i.token}`);

    return res.status(200).json({ tenant: tenant.name, product: product.name, count: links.length, links });
  }

  return res.status(405).end();
}
