// api/_lib/scan-engine.js
// Pure scoringslogica van de Doelscan. Geen database, geen AI-call: de
// herkenningszin is deterministisch, zoals bijlage 14 hoofdstuk 4 vraagt.
// Wordt gebruikt door api/scan.js (de route) en door scripts/scan-tests.js.

const BLOKKADES = ['energie', 'vertrouwen', 'overtuigingen', 'weerstand'];
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

// blokken: welke blokkades meedingen (standaard alle vier; de hermeting
// gebruikt hier een deelverzameling van drie, zie scoreHermeting).
function hoogsteBlok(scores, context, blokken = BLOKKADES) {
  const max = Math.max(...blokken.map((b) => scores[b]));
  const kandidaten = blokken.filter((b) => scores[b] === max);
  if (kandidaten.length === 1) return { blok: kandidaten[0], waarde: max };
  const standaard = contextStandaard(context);
  // Bevat de standaard niet de gelijke hoogste blokkades: vaste volgorde
  // (energie, vertrouwen, overtuigingen, weerstand) beslist.
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

// Welke items de hermeting gebruikt: zelfregie en zelfstarten (niet
// zelfreflectie) van de drie blokkades die bij de start NIET de kracht
// waren. Bijlage 14/15 noemen "zes items" bij "de twee hoogste blokkades",
// wat niet optelt (2 blokkades x 2 z's = 4, geen 6); dit haalt de drempel
// van zes door drie blokkades te nemen in plaats van twee, en laat alleen
// de eigen kracht ongemeten (die hoeft niet opnieuw bewezen te worden).
// Zie de toelichting aan Maarten bij het opleveren van deze stap.
function hermetingBlokken(startStrength) {
  return BLOKKADES.filter((b) => b !== startStrength);
}

function hermetingItems(alleItems, startStrength) {
  const blokken = hermetingBlokken(startStrength);
  return alleItems.filter((it) => blokken.includes(it.block) && it.z !== 'zelfreflectie');
}

// Scoort de hermeting (6 items, 3 blokkades x zelfregie/zelfstarten).
// De kracht van bij de start wordt niet herbevraagd en blijft ongewijzigd;
// scores bevat voor dat blok de oorspronkelijke startscore, zodat een latere
// vergelijking altijd over alle vier de blokkades gaat.
function scoreHermeting({ items, answers, context, startScores, startStrength }) {
  const blokken = hermetingBlokken(startStrength);
  if (!Array.isArray(items) || items.length !== 6) throw new Error('hermeting: 6 items verwacht');
  if (!Array.isArray(answers) || answers.length !== 6) throw new Error('hermeting: 6 antwoorden verwacht');
  answers.forEach((a, i) => {
    if (!Number.isInteger(a) || a < 1 || a > 5) throw new Error(`hermeting: antwoord ${i + 1} moet een geheel getal van 1 tot 5 zijn`);
  });
  const perBlok = {};
  blokken.forEach((b) => { perBlok[b] = 0; });
  items.forEach((it, i) => {
    if (!blokken.includes(it.block) || it.z === 'zelfreflectie') {
      throw new Error(`hermeting: item ${i + 1} hoort niet bij de hermetingset`);
    }
    perBlok[it.block] += answers[i];
  });
  blokken.forEach((b) => {
    const n = items.filter((it) => it.block === b).length;
    if (n !== 2) throw new Error(`hermeting: verwacht 2 items voor ${b}, kreeg ${n}`);
  });

  const scores = { ...startScores };
  blokken.forEach((b) => { scores[b] = Math.round((perBlok[b] / 2) * 100) / 100; });

  const hoogste = hoogsteBlok(scores, context, blokken);
  const main_block = hoogste.waarde >= DREMPEL ? hoogste.blok : 'balans';
  return { scores, main_block, strength: startStrength };
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

// Mensentaal in plaats van een cijfer voor de vier balken op de uitslagpagina
// (bijlage 15 hoofdstuk 4: "vier balken, labels in mensentaal, geen cijfers").
function labelVoorScore(waarde) {
  if (waarde >= DREMPEL) return 'veel';
  if (waarde >= 2.5) return 'gemiddeld';
  return 'weinig';
}

// Eén item minimaal bruikbaar als eerste zetje: geen vraag, niet te kort.
function eersteStapBruikbaar(tekst) {
  const t = (tekst || '').trim();
  return t.length >= 8 && !t.endsWith('?');
}

module.exports = {
  BLOKKADES, DREMPEL, CONTEXT_STANDAARD, contextStandaard,
  scoreDoelscan, bouwHerkenningszin, labelVoorScore, eersteStapBruikbaar,
  hermetingBlokken, hermetingItems, scoreHermeting,
};
