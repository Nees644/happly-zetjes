// scripts/reis-test.js
// Tests voor de Volhoudreis zonder database en zonder mail.
// Start: node --test scripts/reis-test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.APP_URL = 'https://zetjes.test';
process.env.SCAN_URL = 'https://scan.test';
process.env.ADMIN_KEY = 'geheim-admin';

const { installeer } = require('./nep-supabase');
const db = installeer();

// Mail onderscheppen
const mailPad = path.join(__dirname, '..', 'api', '_lib', 'mail.js');
const mails = [];
require.cache[require.resolve(mailPad)] = {
  id: mailPad, filename: mailPad, loaded: true,
  exports: { stuurMail: async (m) => { mails.push(m); return { id: 'nep' }; } },
};

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
    handler({ method, body, query, headers: { origin: 'https://zetjes.test', ...headers } }, res);
  });
}

const vandaag = new Date().toISOString().slice(0, 10);
db.tabel('products').push({ id: 'p1', slug: 'zetjes', name: 'Zetjes', active: true });
db.tabel('tenants').push({ id: 't1', slug: 'happly', name: 'Happly', active: true, contact_email: 'maarten@happly.nl', type: 'overig' });

let groep;

test('groep aanmaken vraagt de beheersleutel', async () => {
  const r = await call('reis-groep', { body: { tenantSlug: 'happly', label: 'Proef', startDate: vandaag } });
  assert.equal(r.status, 401);
});

test('groep aanmaken geeft groepslink en begeleiderslink', async () => {
  const r = await call('reis-groep', {
    headers: { 'x-admin-key': 'geheim-admin' },
    body: { tenantSlug: 'happly', label: 'Proef Happly', programmaNaam: 'Proefprogramma', startDate: vandaag, maxUses: 2, begeleiderEmail: 'coach@test.nl' },
  });
  assert.equal(r.status, 200);
  assert.match(r.groepslink, /^https:\/\/zetjes\.test\/start\/[0-9a-f-]{36}$/);
  assert.match(r.begeleiderslink, /^https:\/\/zetjes\.test\/groep\/[0-9a-f]{32}$/);
  groep = db.tabel('invites')[0];
  assert.equal(groep.is_reis, true);
  assert.equal(groep.scan_required, false);
});

test('reis starten maakt anon_id met toestemming en stuurt de link', async () => {
  const r = await call('reis-start', {
    body: { inviteToken: groep.token, voornaam: 'Maarten', email: 'M@Test.nl ', toestemming: true, signaalOk: true, proactiefOk: true },
  });
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  const reis = db.tabel('reizen')[0];
  assert.match(reis.anon_id, /^anon_[a-f0-9]{24}$/);
  assert.equal(reis.email, 'M@Test.nl');
  const profiel = db.tabel('user_profiles').find((p) => p.anon_id === reis.anon_id);
  assert.ok(profiel.consent_at, 'toestemming staat op het anonieme profiel');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].naar, 'M@Test.nl');
  assert.ok(mails[0].html.includes(`https://zetjes.test/reis/${reis.token}`));
  assert.equal(mails[0].afzenderNaam, 'Happly via Zetjes');
  assert.equal(mails[0].replyTo, 'coach@test.nl');
});

test('zelfde adres in dezelfde groep: geen tweede reis, wel de link opnieuw', async () => {
  const r = await call('reis-start', { body: { inviteToken: groep.token, email: 'm@test.nl', toestemming: true } });
  assert.equal(r.bestaand, true);
  assert.equal(db.tabel('reizen').length, 1);
  assert.equal(mails.length, 2);
});

test('zonder toestemming geen reis', async () => {
  const r = await call('reis-start', { body: { inviteToken: groep.token, email: 'ander@test.nl', toestemming: false } });
  assert.equal(r.status, 400);
  assert.equal(db.tabel('reizen').length, 1);
});

test('vol is vol', async () => {
  await call('reis-start', { body: { inviteToken: groep.token, email: 'twee@test.nl', toestemming: true } });
  const r = await call('reis-start', { body: { inviteToken: groep.token, email: 'drie@test.nl', toestemming: true } });
  assert.equal(r.status, 403);
  assert.equal(r.error, 'vol');
  assert.equal(r.contactEmail, 'maarten@happly.nl');
});

test('de reis toont stap 1 klaar, stap 2 bezig, scanlink met de reistoken', async () => {
  const reis = db.tabel('reizen')[0];
  const r = await call('reis', { method: 'GET', query: { token: reis.token } });
  assert.equal(r.status, 200);
  assert.equal(r.voornaam, 'Maarten');
  assert.equal(r.programma, 'Proefprogramma');
  assert.equal(r.stappen[0].status, 'klaar');
  assert.equal(r.stappen[1].status, 'bezig');
  assert.equal(r.stappen[2].status, 'nog');
  assert.equal(r.huidig, 2);
  assert.equal(r.dag, 1);
  assert.equal(r.links.scanStart, `https://scan.test/?reis=${reis.token}&meting=start&src=reis`);
  assert.ok(r.links.zetjes.includes(`token=${groep.token}`) && r.links.zetjes.includes(reis.anon_id));
  assert.equal(r.email, undefined, 'het e-mailadres gaat niet terug naar de browser');
});

test('onbekende reistoken geeft 404, ook bij een bijna goede', async () => {
  const r = await call('reis', { method: 'GET', query: { token: 'zz'.repeat(16) } });
  assert.equal(r.status, 404);
});

test('kaart zonder als-dan wordt geweigerd', async () => {
  const reis = db.tabel('reizen')[0];
  const r = await call('reis-kaart', { body: { token: reis.token, kaart: { doel: 'x', vak3_als: 'het regent' } } });
  assert.equal(r.status, 400);
});

test('kaart opslaan maakt versie 1, wijzigen versie 2, en de reis leest de hoogste', async () => {
  const reis = db.tabel('reizen')[0];
  let r = await call('reis-kaart', { body: { token: reis.token, kaart: {
    doel: 'twee keer per week', vak1_moment: 'dinsdagavond', vak1_weekdag: 2, vak1_dagdeel: 'avond',
    vak1_zin: 'nu is het toch al mislukt', vak2_inrichting: 'tas bij de deur',
    vak3_als: 'het dinsdagavond regent', vak3_dan: 'loop ik naar de hoek', vak4_woorden: 'je kunt het',
  } } });
  assert.equal(r.status, 200);
  assert.equal(r.versie, 1);
  r = await call('reis-kaart', { body: { token: reis.token, kaart: { vak3_als: 'het regent', vak3_dan: 'schoenen aan', vak1_weekdag: 9, vak1_dagdeel: 'nacht' } } });
  assert.equal(r.versie, 2);
  const k = db.tabel('kaarten').find((x) => x.versie === 2);
  assert.equal(k.vak1_weekdag, null, 'ongeldige weekdag wordt leeg');
  assert.equal(k.vak1_dagdeel, null);
  const d = await call('reis', { method: 'GET', query: { token: reis.token } });
  assert.equal(d.kaart.versie, 2);
  assert.equal(d.kaart.vak3_dan, 'schoenen aan');
  assert.equal(d.stappen[2].status, 'klaar');
  assert.equal(d.huidig, 2, 'de scan is nog niet gedaan, dus de reis wijst nog naar stap 2');
});

test('taalregels in de schermen en de mails', () => {
  const teksten = ['public/reis.html', 'public/reis-start.html', 'api/_lib/reis.js']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  for (const woord of [/\bafhakers?\b/i, /\bopgevers?\b/i, /\bstoppers?\b/i, /\bdoorzet/i, /\bcohort/i, /\bstreak/i, /—/]) {
    assert.doesNotMatch(teksten, woord, `verboden: ${woord}`);
  }
  // Geen uitroeptekens in lopende tekst (wel toegestaan in code: !==, !d, enzovoort)
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'reis.html'), 'utf8');
  const zichtbaar = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(zichtbaar, /!/, 'geen uitroeptekens in de zichtbare tekst');
});
