// api/admin/invites.js
// Beheer van toegangslinks. Alleen met x-admin-key.
//
// POST  { tenantSlug, productSlug, count, appUrl, context, label, startDate,
//         maxUses, expiresAt, nieuweTenant: { name, type, contactEmail } }
//       Met nieuweTenant wordt de organisatie aangemaakt als de slug nog niet bestaat.
// GET   ?tenantSlug=   lijst van links met gebruik, geldigheid en status
// PATCH { token, active: true|false }   een link uitzetten of weer aanzetten
//
// Een link is de sleutel voor de deelnemer; wie hem heeft, komt binnen. Daarom
// moet een link altijd uit te zetten zijn en bij voorkeur een einddatum hebben.
// Beheerscherm: /beheer.html

const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { cors } = require('../_lib/access');

const CONTEXTEN = ['werk', 'ondernemen', 'sales', 'managers', 'gli', 'voornemen', 'rookvrij'];
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

function sleutelKlopt(req) {
  const verwacht = process.env.ADMIN_KEY;
  if (!verwacht) return null;
  const adminKey = String(req.headers['x-admin-key'] || req.body?.adminKey || '');
  const a = crypto.createHash('sha256').update(adminKey).digest();
  const b = crypto.createHash('sha256').update(verwacht).digest();
  return crypto.timingSafeEqual(a, b);
}

// Einddatum uit het formulier (JJJJ-MM-DD) wordt het einde van die dag in
// Nederland, zodat een link die "geldig tot 23 oktober" is, die dag nog werkt.
function eindeVanDag(datum) {
  if (!DATUM_RE.test(datum)) return null;
  const d = new Date(`${datum}T23:59:59+02:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function maak(req, res) {
  const {
    tenantSlug, productSlug = 'zetjes', count = 1, appUrl,
    context, label, startDate, maxUses, expiresAt, nieuweTenant,
  } = req.body || {};

  if (context && !CONTEXTEN.includes(context)) return res.status(400).json({ error: `Onbekende context '${context}'` });
  if (startDate && !DATUM_RE.test(startDate)) return res.status(400).json({ error: 'startDate als JJJJ-MM-DD' });
  const aantal = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);
  const max = maxUses ? parseInt(maxUses, 10) : null;
  if (max !== null && !(max > 0)) return res.status(400).json({ error: 'maxUses moet groter dan 0 zijn' });

  let verloopt = null;
  if (expiresAt) {
    verloopt = DATUM_RE.test(expiresAt) ? eindeVanDag(expiresAt) : (Number.isNaN(Date.parse(expiresAt)) ? null : new Date(expiresAt).toISOString());
    if (!verloopt) return res.status(400).json({ error: 'expiresAt als JJJJ-MM-DD' });
    if (Date.parse(verloopt) <= Date.now()) return res.status(400).json({ error: 'De einddatum ligt in het verleden' });
  }

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
    ...(verloopt ? { expires_at: verloopt } : {}),
  }));

  const { data: invites, error: iErr } = await supabase
    .from('invites').insert(inserts).select('token');
  if (iErr) return res.status(500).json({ error: iErr.message });

  const baseUrl = appUrl || process.env.APP_URL || `https://${req.headers.host}`;
  const links = invites.map((i) => `${baseUrl}/?token=${i.token}`);

  return res.status(200).json({ tenant: tenant.name, product: product.name, count: links.length, links });
}

async function lijst(req, res) {
  const tenantSlug = String(req.query?.tenantSlug || '').trim();
  let tenantId = null;
  if (tenantSlug) {
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
    if (!tenant) return res.status(200).json({ links: [] });
    tenantId = tenant.id;
  }

  let q = supabase
    .from('invites')
    .select('id, token, active, context, label, start_date, expires_at, max_uses, is_reis, created_at, tenants(name, slug)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data: invites, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const nu = Date.now();
  const links = [];
  for (const inv of invites || []) {
    const { count } = await supabase
      .from('user_profiles').select('anon_id', { count: 'exact', head: true })
      .eq('invite_id', inv.id);
    const verlopen = Boolean(inv.expires_at && Date.parse(inv.expires_at) <= nu);
    const vol = inv.max_uses != null && (count || 0) >= inv.max_uses;
    links.push({
      token: inv.token,
      link: `${baseUrl}/?token=${inv.token}`,
      organisatie: inv.tenants?.name || null,
      organisatieSlug: inv.tenants?.slug || null,
      context: inv.context,
      label: inv.label,
      startDatum: inv.start_date,
      geldigTot: inv.expires_at,
      gebruikt: count || 0,
      maxGebruik: inv.max_uses,
      reis: Boolean(inv.is_reis),
      actief: Boolean(inv.active),
      aangemaakt: inv.created_at,
      status: !inv.active ? 'uit' : verlopen ? 'verlopen' : vol ? 'vol' : 'open',
    });
  }
  return res.status(200).json({ links });
}

async function zetAanOfUit(req, res) {
  const token = String(req.body?.token || '').trim();
  const active = req.body?.active;
  if (!token || typeof active !== 'boolean') return res.status(400).json({ error: 'token en active (true of false) zijn verplicht' });

  const { data: inv } = await supabase.from('invites').select('id').eq('token', token).maybeSingle();
  if (!inv) return res.status(404).json({ error: 'Link niet gevonden' });

  const { error } = await supabase.from('invites').update({ active }).eq('id', inv.id);
  if (error) return res.status(500).json({ error: error.message });
  // Alleen de handeling, nooit inhoud.
  console.log(JSON.stringify({ beheer: active ? 'link_aan' : 'link_uit' }));
  return res.status(200).json({ ok: true, actief: active });
}

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'POST, GET, PATCH, OPTIONS', headers: 'Content-Type, x-admin-key' });
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Zonder ingestelde sleutel staat beheer dicht, niet open.
  const klopt = sleutelKlopt(req);
  if (klopt === null) return res.status(503).json({ error: 'Beheer niet geconfigureerd' });
  if (!klopt) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'POST') return await maak(req, res);
    if (req.method === 'GET') return await lijst(req, res);
    if (req.method === 'PATCH') return await zetAanOfUit(req, res);
    return res.status(405).end();
  } catch (err) {
    console.error('admin/invites', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
