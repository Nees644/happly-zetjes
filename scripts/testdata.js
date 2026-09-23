// scripts/testdata.js
// Maakt (of hergebruikt) een testorganisatie met testlinks per context.
// Start: node scripts/testdata.js   (leest sleutels uit lokaal.env)
// Opruimen: node scripts/testdata.js --opruimen

const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', 'lokaal.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] = m[2];
}
const { supabase } = require('../api/_lib/supabase');

const SLUG = 'test-happly';
const weeksAgo = (w) => new Date(Date.now() - w * 7 * 86400000).toISOString().slice(0, 10);

const LINKS = [
  { label: 'TEST werk', context: 'werk' },
  { label: 'TEST ondernemen', context: 'ondernemen' },
  { label: 'TEST gli week 5', context: 'gli', start_date: weeksAgo(5) },
  { label: 'TEST gli max 1', context: 'gli', start_date: weeksAgo(20), max_uses: 1 },
  { label: 'TEST verlopen', context: 'werk', expires_at: new Date(Date.now() - 86400000).toISOString() },
];

async function main() {
  const { data: product } = await supabase.from('products').select('id').eq('slug', 'zetjes').single();
  let { data: tenant } = await supabase.from('tenants').select('id').eq('slug', SLUG).maybeSingle();

  if (process.argv.includes('--opruimen')) {
    if (!tenant) return console.log('Niets op te ruimen.');
    const { data: invites } = await supabase.from('invites').select('id').eq('tenant_id', tenant.id);
    const ids = (invites || []).map((i) => i.id);
    const { data: sessions } = await supabase.from('sessions').select('id').in('invite_id', ids);
    const sids = (sessions || []).map((s) => s.id);
    if (sids.length) {
      await supabase.from('session_messages').delete().in('session_id', sids);
      await supabase.from('sessions').delete().in('id', sids);
    }
    await supabase.from('user_profiles').delete().in('invite_id', ids);
    await supabase.from('invites').delete().in('id', ids);
    await supabase.from('tenant_products').delete().eq('tenant_id', tenant.id);
    await supabase.from('tenants').delete().eq('id', tenant.id);
    return console.log(`Opgeruimd: ${ids.length} links, ${sids.length} sessies.`);
  }

  if (!tenant) {
    const { data, error } = await supabase.from('tenants')
      .insert({ name: 'TEST Happly', slug: SLUG, type: 'werkgever', contact_email: 'hallo@happly.nl' })
      .select('id').single();
    if (error) throw error;
    tenant = data;
    await supabase.from('tenant_products').insert({ tenant_id: tenant.id, product_id: product.id });
  }

  for (const l of LINKS) {
    let { data: inv } = await supabase.from('invites').select('token').eq('tenant_id', tenant.id).eq('label', l.label).maybeSingle();
    if (!inv) {
      const { data, error } = await supabase.from('invites')
        .insert({ tenant_id: tenant.id, product_id: product.id, theme: l.context === 'gli' ? 'werk' : l.context, ...l })
        .select('token').single();
      if (error) throw error;
      inv = data;
    }
    console.log(`${l.label.padEnd(18)} http://localhost:3000/?token=${inv.token}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
