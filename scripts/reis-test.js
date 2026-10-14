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
process.env.REIS_SCAN_SECRET = 'geheim-scan';
process.env.CRON_SECRET = 'geheim-cron';

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
  assert.equal(r.links.scanStart, `https://scan.test/scan?reis=${reis.token}&meting=start&src=reis`);
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

test('reis-scan weigert zonder of met verkeerd geheim', async () => {
  const reis = db.tabel('reizen')[0];
  const body = { reisToken: reis.token, meting: 'start', scanId: 'scan-1', index: 62, zien: 70, sturen: 55, doen: 61 };
  let r = await call('reis-scan', { body });
  assert.equal(r.status, 401);
  r = await call('reis-scan', { body, headers: { authorization: 'Bearer fout' } });
  assert.equal(r.status, 401);
  assert.equal(db.tabel('reizen')[0].scan_start, undefined);
});

test('reis-scan schrijft de startmeting, de reis loopt door naar Zetjes, een tweede start telt niet', async () => {
  const reis = db.tabel('reizen')[0];
  const kop = { authorization: 'Bearer geheim-scan' };
  let r = await call('reis-scan', { headers: kop, body: { reisToken: reis.token, meting: 'start', scanId: 'scan-1', index: 62.44, zien: 70, sturen: 55, doen: 61 } });
  assert.equal(r.status, 200);
  assert.equal(db.tabel('reizen')[0].scan_start.index, 62.4);
  assert.equal(db.tabel('reizen')[0].scan_start_id, 'scan-1');
  r = await call('reis-scan', { headers: kop, body: { reisToken: reis.token, meting: 'start', scanId: 'scan-2', index: 10, zien: 10, sturen: 10, doen: 10 } });
  assert.equal(r.al, true);
  assert.equal(db.tabel('reizen')[0].scan_start_id, 'scan-1', 'de eerste meting blijft staan');
  const d = await call('reis', { method: 'GET', query: { token: reis.token } });
  assert.equal(d.stappen[1].status, 'klaar');
  assert.equal(d.stappen[1].getallen.index, 62.4);
  assert.equal(d.huidig, 5, 'scan en kaart klaar, programma gestart op dag 1: Zetjes loopt');
  assert.equal(db.tabel('reizen')[0].stap, 5);
});

test('reis-scan: eindmeting zet stap 6 op klaar en de reis op afgerond', async () => {
  const reis = db.tabel('reizen')[0];
  const kop = { authorization: 'Bearer geheim-scan' };
  const r = await call('reis-scan', { headers: kop, body: { reisToken: reis.token, meting: 'eind', scanId: 'scan-9', index: 71, zien: 74, sturen: 66, doen: 72 } });
  assert.equal(r.status, 200);
  const d = await call('reis', { method: 'GET', query: { token: reis.token } });
  assert.equal(d.stappen[5].status, 'klaar');
  assert.equal(d.stappen[5].getallen.index, 71);
  assert.equal(d.stappen[1].getallen.index, 62.4, 'de startmeting blijft ernaast staan');
});

test('reis-scan: onbekende reis geeft 404, slechte getallen 400', async () => {
  const kop = { authorization: 'Bearer geheim-scan' };
  let r = await call('reis-scan', { headers: kop, body: { reisToken: 'f'.repeat(32), meting: 'start', index: 1, zien: 1, sturen: 1, doen: 1 } });
  assert.equal(r.status, 404);
  r = await call('reis-scan', { headers: kop, body: { reisToken: db.tabel('reizen')[0].token, meting: 'start', index: 'x', zien: 1, sturen: 1, doen: 1 } });
  assert.equal(r.status, 400);
});

test('validate geeft de reis terug en biedt geen Doelscan aan', async () => {
  const reis = db.tabel('reizen')[0];
  const r = await call('validate', { body: { token: groep.token, anonId: reis.anon_id } });
  assert.equal(r.valid, true);
  assert.equal(r.anonId, reis.anon_id);
  assert.equal(r.consent, true);
  assert.equal(r.scanNodig, false);
  assert.ok(r.reis, 'reis aanwezig');
  assert.equal(r.reis.dag, 1);
  assert.equal(r.reis.programma, 'Proefprogramma');
  assert.match(r.reis.alsdan, /^Als het regent, dan schoenen aan\.$/);
  assert.ok(r.reis.link.endsWith('/reis/' + reis.token));
});

test('het kaartblok gebruikt de woorden van de kaart en niets anders', () => {
  const { kaartBlokTekst } = require('../api/_lib/reis');
  const blok = kaartBlokTekst({ doel: 'twee keer per week', vak1_moment: 'dinsdagavond', vak1_weekdag: 2, vak1_dagdeel: 'avond',
    vak1_zin: 'nu is het toch al mislukt', vak2_inrichting: 'tas bij de deur', vak3_als: 'het regent', vak3_dan: 'schoenen aan', vak4_woorden: 'je kunt het' }, 23, 'Maarten');
  for (const w of ['twee keer per week', 'dinsdagavond; dinsdag, avond', '"nu is het toch al mislukt"', 'tas bij de deur', 'als het regent, dan schoenen aan', '"je kunt het"', 'Dag 23 van 66', 'Maarten']) {
    assert.ok(blok.includes(w), `ontbreekt: ${w}`);
  }
  assert.equal(kaartBlokTekst(null, 5, 'x'), '');
});

test('begeleiderslijst: voortgang, nooit inhoud', async () => {
  // De broncode zelf: geen verboden tabel of kolom in de route van de begeleider.
  const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'reis-begeleider.js'), 'utf8');
  const code = bron.replace(/\/\/.*$/gm, '');
  for (const verboden of ["from('kaarten')", "from('sessions')", "from('session_messages')", 'scan_start', 'scan_eind', 'vak1', 'vak3', 'vak4', 'doel', 'email']) {
    assert.ok(!code.includes(verboden), `reis-begeleider.js bevat ${verboden}`);
  }
  // Het antwoord: alleen de toegestane velden per deelnemer.
  const r = await call('reis-begeleider', { method: 'GET', query: { token: groep.begeleider_token } });
  assert.equal(r.status, 200);
  assert.equal(r.telling.deelnemers, 2);
  assert.ok(r.groepslink.endsWith('/start/' + groep.token));
  for (const p of r.deelnemers) {
    assert.deepEqual(Object.keys(p).sort(), ['kleur', 'nummer', 'signaal', 'stap', 'voornaam']);
  }
  const maarten = r.deelnemers[0];
  assert.equal(maarten.voornaam, 'Maarten');
  assert.equal(maarten.signaal, true);
  assert.equal(maarten.kleur, 'groen');
  const tweede = r.deelnemers[1];
  assert.equal(tweede.voornaam, 'deelnemer', 'zonder signaal_ok geen voornaam');
  assert.equal(tweede.kleur, null);
  const fout = await call('reis-begeleider', { method: 'GET', query: { token: 'e'.repeat(32) } });
  assert.equal(fout.status, 404);
});

test('instellingen: proactief uitzetten', async () => {
  const reis = db.tabel('reizen')[0];
  const r = await call('reis-instellingen', { body: { token: reis.token, proactiefOk: false } });
  assert.equal(r.ok, true);
  assert.equal(db.tabel('reizen')[0].proactief_ok, false);
  const leeg = await call('reis-instellingen', { body: { token: reis.token } });
  assert.equal(leeg.status, 400);
  await call('reis-instellingen', { body: { token: reis.token, proactiefOk: true } });
});

test('dagelijkse taken: startdagmail en proactief zetje, en nooit twee keer', async () => {
  const reis = db.tabel('reizen')[0];
  // Kaart op de weekdag van vandaag zetten, zodat het proactieve zetje vandaag valt.
  const d = new Date(); const weekdag = d.getDay() === 0 ? 7 : d.getDay();
  const kaart = db.tabel('kaarten').find((k) => k.reis_id === reis.id && k.versie === 2);
  Object.assign(kaart, { vak1_weekdag: weekdag, vak1_dagdeel: 'avond', vak1_moment: 'dinsdagavond', vak4_woorden: 'je kunt het' });
  const voor = mails.length;
  let r = await call('reis-taken', { method: 'GET', headers: { authorization: 'Bearer geheim-cron' } });
  assert.equal(r.status, 200);
  assert.equal(r.startdag, 2, 'dag 1 is vandaag: startdagmail voor beide deelnemers');
  assert.equal(r.proactief, 1, 'kaart staat op vandaag: proactief zetje');
  assert.equal(r.dag66, 0);
  assert.equal(mails.length, voor + 3);
  const onderwerpen = mails.slice(voor).map((m) => m.onderwerp);
  assert.ok(onderwerpen.includes('Vandaag begint het'));
  assert.ok(onderwerpen.some((o) => o.startsWith('Maarten, als het regent')));
  const zetje = mails.slice(voor).find((m) => m.onderwerp.startsWith('Maarten, als'));
  assert.ok(zetje.html.includes('schoenen aan') && zetje.html.includes('je kunt het') && zetje.html.includes('Niet meer sturen'));
  // Tweede run dezelfde dag: niets.
  r = await call('reis-taken', { method: 'GET', headers: { authorization: 'Bearer geheim-cron' } });
  assert.equal(r.startdag + r.proactief + r.dag66, 0);
  assert.equal(mails.length, voor + 3);
  const geweigerd = await call('reis-taken', { method: 'GET', headers: { authorization: 'Bearer fout' } });
  assert.equal(geweigerd.status, 401);
});

test('verwijderen haalt ook de reis en de kaarten weg', async () => {
  const reis = db.tabel('reizen')[0];
  const r = await call('verwijder', { body: { token: groep.token, anonId: reis.anon_id } });
  assert.equal(r.ok, true);
  assert.equal(db.tabel('reizen').find((x) => x.anon_id === reis.anon_id), undefined);
  const d = await call('reis', { method: 'GET', query: { token: reis.token } });
  assert.equal(d.status, 404);
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
