// api/validate.js
// POST /api/validate { token }
// Returns { valid, anonId, tenantId, productSlug, productName, theme }

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false, error: 'No token' });

  const { data: invite, error } = await supabase
    .from('invites')
    .select('id, tenant_id, product_id, anon_id, active, theme, products(slug, name)')
    .eq('token', token)
    .single();

  if (error || !invite) return res.status(401).json({ valid: false, error: 'Token not found' });
  if (!invite.active)   return res.status(403).json({ valid: false, error: 'Token inactive' });

  // Eerste gebruik: genereer anoniem ID
  let anonId = invite.anon_id;
  if (!anonId) {
    anonId = 'anon_' + uuidv4().replace(/-/g, '').slice(0, 16);
    await supabase.from('invites')
      .update({ anon_id: anonId, used_at: new Date().toISOString() })
      .eq('id', invite.id);
  }

  return res.status(200).json({
    valid:       true,
    anonId,
    tenantId:    invite.tenant_id,
    productId:   invite.product_id,
    productSlug: invite.products?.slug || 'zetjes',
    productName: invite.products?.name || 'Zetjes',
    theme:       invite.theme || 'werk',
  });
}
