// scripts/scan-tests.js
// Unit-tests op drie voorbeeldprofielen voor de Doelscan-scoring.
// Start: node scripts/scan-tests.js

const assert = require('assert');
const { scoreDoelscan, bouwHerkenningszin, hermetingItems, scoreHermeting } = require('../api/_lib/scan-engine');

// Twaalf items in vaste volgorde: 3x energie, 3x vertrouwen, 3x weerstand, 3x overtuigingen.
const Z = ['zelfreflectie', 'zelfregie', 'zelfstarten'];
const ITEMS = ['energie', 'vertrouwen', 'weerstand', 'overtuigingen']
  .flatMap((block) => Z.map((z) => ({ block, z })));

const PHRASES = {
  energie: { kracht: 'begint pas als je er zin in hebt, maar komt dan wel in beweging', valkuil: 'stopt zodra je energie op is' },
  vertrouwen: { kracht: 'begint makkelijk', valkuil: 'haakt af zodra het een keer niet lukt' },
  weerstand: { kracht: 'houdt vol als je eenmaal bezig bent', valkuil: 'stelt de eerste stap steeds uit' },
  overtuigingen: { kracht: 'weet precies waarom je iets doet', valkuil: 'denkt al snel dat het toch geen zin heeft' },
};

let ok = 0, fail = 0;
function test(naam, fn) {
  try { fn(); console.log('ok  ', naam); ok++; }
  catch (e) { console.log('FOUT', naam, '-', e.message); fail++; }
}

// ── Profiel 1: duidelijke hoofdvalkuil vertrouwen, kracht energie ──
test('profiel 1: hoge vertrouwen-score wordt main_block', () => {
  const answers = [5, 4, 4, 5, 4, 4, 2, 2, 1, 3, 2, 2];
  const r = scoreDoelscan({ items: ITEMS, answers, context: 'gli' });
  assert.strictEqual(r.scores.energie, 4.33);
  assert.strictEqual(r.scores.vertrouwen, 4.33);
  // vertrouwen en energie zijn hier gelijk; gli-standaard is overtuigingen,
  // die zit niet bij de kandidaten, dus wint de eerste in vaste volgorde
  // (energie, vertrouwen, overtuigingen, weerstand).
  assert.strictEqual(r.main_block, 'energie');
  assert.strictEqual(r.strength, 'weerstand');
  const zin = bouwHerkenningszin({ phrases: PHRASES, ...r });
  assert.ok(zin.startsWith('Jij houdt vol als je eenmaal bezig bent, maar'));
});

// ── Profiel 2: alles onder de drempel, dus balans ──
test('profiel 2: lage scores overal geeft balans', () => {
  const answers = [2, 3, 2, 2, 3, 2, 3, 2, 3, 2, 2, 3];
  const r = scoreDoelscan({ items: ITEMS, answers, context: 'werk' });
  assert.ok(Object.values(r.scores).every((s) => s < 3.5));
  assert.strictEqual(r.main_block, 'balans');
  const zin = bouwHerkenningszin({ phrases: PHRASES, ...r });
  assert.ok(zin.includes('geen enkele blokkade je duidelijk tegen'));
});

// ── Profiel 3: gelijke hoogste score, context-standaard beslist (werk: weerstand) ──
test('profiel 3: gelijke hoogste score, contextstandaard wint', () => {
  const answers = [3, 3, 3, 3, 3, 3, 5, 4, 5, 5, 4, 5];
  const r = scoreDoelscan({ items: ITEMS, answers, context: 'werk' });
  assert.strictEqual(r.scores.weerstand, 4.67);
  assert.strictEqual(r.scores.overtuigingen, 4.67);
  assert.strictEqual(r.main_block, 'weerstand'); // werk-standaard, geen 'overtuigingen'
  assert.strictEqual(r.strength, 'energie');
});

// ── Foutafhandeling: ongeldig antwoord ──
test('foutieve invoer wordt geweigerd', () => {
  assert.throws(() => scoreDoelscan({ items: ITEMS, answers: [6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], context: 'werk' }));
  assert.throws(() => scoreDoelscan({ items: ITEMS, answers: [1, 2, 3], context: 'werk' }));
});

// ── Hermeting: drie blokkades (kracht overgeslagen), zes items ──
test('hermeting: items sluiten de startkracht uit en laten zelfreflectie weg', () => {
  const items = hermetingItems(ITEMS, 'energie');
  assert.strictEqual(items.length, 6);
  assert.ok(items.every((it) => it.block !== 'energie'));
  assert.ok(items.every((it) => it.z !== 'zelfreflectie'));
});

test('hermeting: een nieuwe hoofdvalkuil komt naar boven, de kracht blijft ongewijzigd', () => {
  const startScores = { energie: 2, vertrouwen: 4.33, weerstand: 2.33, overtuigingen: 1.67 };
  const items = hermetingItems(ITEMS, 'overtuigingen'); // start-kracht was overtuigingen; volgorde: energie, vertrouwen, weerstand
  const r = scoreHermeting({ items, answers: [5, 4, 3, 3, 2, 2], context: 'gli', startScores, startStrength: 'overtuigingen' });
  assert.strictEqual(r.strength, 'overtuigingen'); // ongewijzigd, niet herbevraagd
  assert.strictEqual(r.scores.overtuigingen, startScores.overtuigingen); // niet herberekend, overgenomen van start
  assert.strictEqual(r.scores.energie, 4.5);
  assert.strictEqual(r.scores.vertrouwen, 3);
  assert.strictEqual(r.main_block, 'energie');
});

test('hermeting: alles onder de drempel geeft weer balans', () => {
  const startScores = { energie: 2, vertrouwen: 2, weerstand: 2, overtuigingen: 2 };
  const items = hermetingItems(ITEMS, 'energie');
  const r = scoreHermeting({ items, answers: [2, 2, 2, 2, 2, 2], context: 'werk', startScores, startStrength: 'energie' });
  assert.strictEqual(r.main_block, 'balans');
});

console.log(`\n${ok} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
