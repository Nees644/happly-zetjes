// scripts/doel-test.js
// Het opgeslagen doel is achtergrond, nooit het onderwerp. Aanleiding (9
// november 2026): een vraag over uitstel op het werk gaf als stap 1 "je doel
// was beetje afvallen", omdat profiel en kaart het zetje op het doel richtten.
// Start: node --test scripts/doel-test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { installeer } = require('./nep-supabase');
const db = installeer();

const { profielBlokTekst, DOEL_ALS_ACHTERGROND } = require('../api/_lib/scan-engine');
const { kaartBlokTekst } = require('../api/_lib/reis');
const { getContext } = require('../api/_lib/contexts');
const { schoonLabel, loadKaartBlok } = require('../api/claude');

const profiel = { goal_text: 'beetje afvallen', goal_why: 'fitter zijn', main_block: 'uitstellen' };
const kaart = { reis_id: 'r1', versie: 1, doel: 'beetje afvallen', waarom: 'fitter zijn', vak3_als: 'ik moe thuiskom', vak3_dan: 'loop ik tien minuten', created_at: new Date().toISOString() };

test('het profiel zegt niet meer dat het zetje op het doel gericht moet zijn', () => {
  const t = profielBlokTekst(getContext('werk'), profiel);
  assert.ok(!/richt het zetje hierop/i.test(t));
  assert.ok(t.includes(DOEL_ALS_ACHTERGROND));
  assert.ok(t.indexOf(DOEL_ALS_ACHTERGROND) < t.indexOf('beetje afvallen'), 'de regel staat voor het doel');
});

test('de kaart maakt het als-dan-plan alleen eerste stap als de situatie over het doel gaat', () => {
  const t = kaartBlokTekst(kaart, 3, 'Maarten');
  assert.ok(t.includes(DOEL_ALS_ACHTERGROND));
  assert.ok(/Gaat de situatie wel over dit doel/.test(t));
  assert.ok(t.indexOf(DOEL_ALS_ACHTERGROND) < t.indexOf('als-dan-plan als eerste stap'));
});

test('de regel zegt dat elke stap over de getypte situatie gaat', () => {
  assert.ok(/noem het doel dan niet/.test(DOEL_ALS_ACHTERGROND));
  assert.ok(/elke stap gaat over de situatie/.test(DOEL_ALS_ACHTERGROND));
});

test('een kaart uit een andere reis komt niet mee op deze link', async () => {
  db.tabel('invites').push({ id: 'i-gli', token: 'gli', context: 'gli', is_reis: true });
  db.tabel('reizen').push({ id: 'r1', invite_id: 'i-gli', anon_id: 'anon-1', voornaam: 'Maarten', created_at: new Date().toISOString() });
  db.tabel('kaarten').push(kaart);
  assert.equal(await loadKaartBlok('anon-1', 'i-werk'), '');
  const eigen = await loadKaartBlok('anon-1', 'i-gli');
  assert.ok(eigen.includes('beetje afvallen'), 'op de eigen reislink blijft de kaart werken');
});

test('het label zegt nooit doorzetten', () => {
  assert.equal(schoonLabel('Doorzetten'), 'Volhouden');
  assert.equal(schoonLabel('doorzetter'), 'Volhouden');
  assert.equal(schoonLabel('Twijfel'), 'Twijfel');
});
