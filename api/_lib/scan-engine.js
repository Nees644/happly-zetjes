// api/_lib/scan-engine.js
// Pure scoringslogica van de Doelscan. Geen database, geen AI-call: de
// herkenningszin is deterministisch, zoals bijlage 14 hoofdstuk 4 vraagt.
// Wordt gebruikt door api/scan.js (de route) en door scripts/scan-tests.js.

const BLOKKADES = ['energie', 'vertrouwen', 'weerstand', 'overtuigingen'];
const DREMPEL = 3.5;

// Welke blokkade in een context het vaakst tot uitval leidt. Gebruikt bij een
// gelijke hoogste score, als tie-break tussen de gelijk scorende blokkades.
// Bron: bijlage 14 hoofdstuk 4, bijlage 15 hoofdstuk 4. 'voornemen' bestaat
// nog niet als context (aparte briefing 13); alvast opgenomen.
const CONTEXT_STANDAARD = {
  gli: 'overtuigingen',
  voornemen: 'energie',
  werk: 'weerstand',
  ondernemen: 'weerstand',
  sales: 'weerstand',
  managers: 'weerstand',
};

function contextStandaard(context) {
  return CONTEXT_STANDAARD[context] || 'weerstand';
}

// items: 12 objecten {block, ...}, in dezelfde volgorde als answers.
// answers: 12 getallen, elk 1 tot en met 5.
function valideer(items, answers) {
  if (!Array.isArray(items) || items.length !== 12) throw new Error('scan: 12 items verwacht');
  if (!Array.isArray(answers) || answers.length !== 12) throw new Error('scan: 12 antwoorden verwacht');
  answers.forEach((a, i) => {
    if (!Number.isInteger(a) || a < 1 || a > 5) throw new Error(`scan: antwoord ${i + 1} moet een geheel getal van 1 tot 5 zijn`);
  });
  const perBlok = { energie: 0, vertrouwen: 0, weerstand: 0, overtuigingen: 0 };
  items.forEach((it) => {
    if (!BLOKKADES.includes(it.block)) throw new Error(`scan: onbekende blokkade "${it.block}"`);
    perBlok[it.block] += 1;
  });
  BLOKKADES.forEach((b) => {
    if (perBlok[b] !== 3) throw new Error(`scan: verwacht 3 items voor ${b}, kreeg ${perBlok[b]}`);
  });
}

// Gemiddelde per blokkade (3 items elk), afgerond op 2 decimalen voor opslag.
function gemiddeldenPerBlok(items, answers) {
  const som = { energie: 0, vertrouwen: 0, weerstand: 0, overtuigingen: 0 };
  items.forEach((it, i) => { som[it.block] += answers[i]; });
  const scores = {};
  BLOKKADES.forEach((b) => { scores[b] = Math.round((som[b] / 3) * 100) / 100; });
  return scores;
}

function hoogsteBlok(scores, context) {
  const max = Math.max(...BLOKKADES.map((b) => scores[b]));
  const kandidaten = BLOKKADES.filter((b) => scores[b] === max);
  if (kandidaten.length === 1) return { blok: kandidaten[0], waarde: max };
  const standaard = contextStandaard(context);
  const blok = kandidaten.includes(standaard) ? standaard : kandidaten[0];
  return { blok, waarde: max };
}

function laagsteBlok(scores) {
  const min = Math.min(...BLOKKADES.map((b) => scores[b]));
  const kandidaten = BLOKKADES.filter((b) => scores[b] === min);
  // Bij een gelijke laagste is er geen contextstandaard-regel gegeven;
  // vaste volgorde houdt de uitkomst voorspelbaar en reproduceerbaar.
  return kandidaten[0];
}

// Berekent het profiel uit de twaalf antwoorden. Geeft { scores, main_block, strength }.
// main_block is 'balans' als geen enkele blokkade de drempel van 3,5 haalt.
function scoreDoelscan({ items, answers, context }) {
  valideer(items, answers);
  const scores = gemiddeldenPerBlok(items, answers);
  const hoogste = hoogsteBlok(scores, context);
  const main_block = hoogste.waarde >= DREMPEL ? hoogste.blok : 'balans';
  const strength = laagsteBlok(scores);
  return { scores, main_block, strength };
}

// Sjabloon: "Jij [kracht], maar [valkuil]." Deterministisch, geen AI-call.
// phrases: { [blok]: { kracht: '...', valkuil: '...' } }, per context in contexts.js.
function bouwHerkenningszin({ phrases, main_block, strength }) {
  const krachtZin = phrases[strength]?.kracht;
  if (!krachtZin) throw new Error(`scan: geen krachtzin voor blokkade "${strength}"`);
  if (main_block === 'balans') {
    return `Jij ${krachtZin}. Op dit moment houdt geen enkele blokkade je duidelijk tegen.`;
  }
  const valkuilZin = phrases[main_block]?.valkuil;
  if (!valkuilZin) throw new Error(`scan: geen valkuilzin voor blokkade "${main_block}"`);
  return `Jij ${krachtZin}, maar ${valkuilZin}.`;
}

module.exports = { BLOKKADES, DREMPEL, CONTEXT_STANDAARD, contextStandaard, scoreDoelscan, bouwHerkenningszin };
