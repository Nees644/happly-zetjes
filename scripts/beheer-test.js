// scripts/beheer-test.js
// Tests voor het beheer van toegangslinks zonder database.
// Start: node --test scripts/beheer-test.js

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_URL = 'https://zetjes.test';
process.env.ADMIN_KEY = 'geheim-admin';

const { installeer } = require('./nep-supabase');
const db = installeer();

function call(naam, { method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  const handler = require(`../api/${naam}.js`);
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, ...o }); return this; },
      end() { resolve({ status: this.statusCode }); return this; },
    };
    handler({ method, body, query, headers: { origin: 'https://zetjes.test', host: 'zetjes.test', ...headers } }, res);
  });
}

const admin = { 'x-admin-key': 'geheim-admin' };
const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

db.tabel('products').push({ id: 'p1', slug: 'zetjes', name: 'Zetjes', active: true });

let token;

test('zonder sleutel staat beheer dicht, ook voor de lijst', async () => {
  const r = await call('admin/invites', { method: 'GET' });
  assert.equal(r.status, 401);
});

test('een link krijgt een einddatum die de hele dag nog geldt', async () => {
  const r = await call('admin/invites', {
    headers: admin,
    body: { tenantSlug: 'demo', nieuweTenant: { name: 'Demo' }, context: 'gli', label: 'demo Monter', maxUses: 1, expiresAt: morgen },
  });
  assert.equal(r.status, 200);
  assert.equal(r.links.length, 1);
  token = r.links[0].split('token=')[1];
  const inv = db.tabel('invites').find((i) => i.token === token);
  assert.ok(Date.parse(inv.expires_at) > Date.now());
  assert.match(inv.expires_at, /T21:59:59/);
});

test('een einddatum in het verleden wordt geweigerd', async () => {
  const r = await call('admin/invites', {
    headers: admin,
    body: { tenantSlug: 'demo', context: 'gli', expiresAt: gisteren },
  });
  assert.equal(r.status, 400);
});

test('de lijst toont gebruik, geldigheid en status, en de app laat de link binnen', async () => {
  const r = await call('admin/invites', { method: 'GET', headers: admin, query: { tenantSlug: 'demo' } });
  assert.equal(r.status, 200);
  const l = r.links.find((x) => x.token === token);
  assert.ok(l);
  assert.equal(l.status, 'open');
  assert.equal(l.gebruikt, 0);
  assert.equal(l.maxGebruik, 1);
  assert.equal(l.actief, true);

  const { resolveAccess } = require('../api/_lib/access');
  const a = await resolveAccess({ token, register: true });
  assert.ok(a);
  const r2 = await call('admin/invites', { method: 'GET', headers: admin, query: { tenantSlug: 'demo' } });
  const l2 = r2.links.find((x) => x.token === token);
  assert.equal(l2.gebruikt, 1);
  assert.equal(l2.status, 'vol');
});

test('uitzetten sluit de link, ook voor wie hem al gebruikte; aanzetten opent hem weer', async () => {
  const uit = await call('admin/invites', { method: 'PATCH', headers: admin, body: { token, active: false } });
  assert.equal(uit.status, 200);
  assert.equal(uit.actief, false);

  const { resolveAccess } = require('../api/_lib/access');
  const anonId = db.tabel('user_profiles')[0].anon_id;
  await assert.rejects(resolveAccess({ token, anonId }), (e) => e.reason === 'inactief');

  const lijst = await call('admin/invites', { method: 'GET', headers: admin });
  assert.equal(lijst.links.find((x) => x.token === token).status, 'uit');

  const aan = await call('admin/invites', { method: 'PATCH', headers: admin, body: { token, active: true } });
  assert.equal(aan.actief, true);
  const a = await resolveAccess({ token, anonId });
  assert.ok(a);
});

test('een onbekende link of een ontbrekende keuze geeft een nette fout', async () => {
  const r1 = await call('admin/invites', { method: 'PATCH', headers: admin, body: { token: 'bestaat-niet', active: false } });
  assert.equal(r1.status, 404);
  const r2 = await call('admin/invites', { method: 'PATCH', headers: admin, body: { token } });
  assert.equal(r2.status, 400);
});
