// scripts/scan-tests.js
// Unit-tests op drie voorbeeldprofielen voor de Doelscan-scoring.
// Start: node scripts/scan-tests.js

const assert = require('assert');
const { scoreDoelscan, bouwHerkenningszin } = require('../api/_lib/scan-engine');

// Twaalf items in vaste volgorde: 3x energie, 3x vertrouwen, 3x weerstand, 3x overtuigingen.
const ITEMS = [
  { block: 'energie' }, { block: 'energie' }, { block: 'energie' },
  { block: 'vertrouwen' }, { block: 'vertrouwen' }, { block: 'vertrouwen' },
  { block: 'weerstand' }, { block: 'weerstand' }, { block: 'weerstand' },
  { block: 'overtuigingen' }, { block: 'overtuigingen' }, { block: 'overtuigingen' },
];

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
  // die zit niet bij de kandidaten, dus wint de eerste in vaste volgorde (energie).
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

console.log(`\n${ok} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
