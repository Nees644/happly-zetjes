// scripts/gli-tests.js
// Bewaakt de afspraken voor Zetjes bij het leefstijlprogramma (GLI):
// uitdrukkelijke toestemming, eerlijk over verwerking buiten Europa zolang
// Bedrock EU niet werkt, en een privacyverklaring die zegt wat de code doet. Start: node scripts/gli-tests.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
async function test(naam, fn) {
  try { await fn(); console.log('ok  ', naam); ok++; }
  catch (e) { console.log('FOUT', naam, '-', e.message); fail++; }
}

(async () => {
  const { getContext, CONTEXTS } = require('../api/_lib/contexts');
  const gli = getContext('gli');

  await test('GLI vraagt uitdrukkelijke toestemming met een vinkje', () => {
    const t = gli.ui.toestemming;
    assert.ok(t && t.versie && t.vinkje && t.alineas.length >= 4);
    assert.strictEqual(t.privacy, '/privacy-gli.html');
  });

  await test('toestemmingstekst zonder gedachtestreepjes of uitroeptekens', () => {
    const tekst = [gli.ui.toestemming.vinkje, ...gli.ui.toestemming.alineas].join(' ');
    assert.ok(!/[—–!]/.test(tekst), 'verboden teken gevonden');
  });

  await test('toestemming en code zeggen hetzelfde over de plek van verwerking', () => {
    const tekst = [gli.ui.toestemming.vinkje, ...gli.ui.toestemming.alineas].join(' ');
    if (gli.alleenEU) {
      assert.ok(!tekst.includes('Verenigde Staten'), 'alleenEU aan, maar de tekst noemt de VS');
    } else {
      assert.ok(tekst.includes('Verenigde Staten'), 'route buiten Europa, maar de toestemming zegt het niet');
      assert.ok(gli.ui.toestemming.vinkje.includes('buiten Europa'), 'vinkje noemt buiten Europa niet');
      assert.notStrictEqual(gli.ui.toestemming.versie, 'gli-1', 'versie niet verhoogd');
    }
  });

  await test('privacyverklaring GLI klopt met de afspraken', () => {
    const p = fs.readFileSync(path.join(__dirname, '../public/privacy-gli.html'), 'utf8');
    assert.ok(p.includes('tien deelnemers'), 'minimum van tien ontbreekt');
    assert.ok(p.includes('artikel 9 lid 2 sub a'), 'grondslag artikel 9 ontbreekt');
    assert.ok(p.includes(gli.ui.toestemming.versie), 'versie wijkt af van de toestemming');
    if (gli.alleenEU) {
      assert.ok(!p.includes('Verenigde Staten'), 'VS genoemd terwijl alleenEU aan staat');
    } else {
      assert.ok(p.includes('Verenigde Staten') && p.includes('standaardcontractbepalingen'), 'doorgifte buiten Europa niet beschreven');
      assert.ok(p.includes('artikel 49 lid 1 sub a'), 'toestemming voor doorgifte ontbreekt');
    }
    assert.ok(!/[—–]/.test(p), 'gedachtestreepje gevonden');
  });

  await test('de poortwachter staat op beide fasen en is in de GLI verplicht', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'api', 'claude.js'), 'utf8');
    const fase1 = code.indexOf("phase === 'clarify'");
    const fase2 = code.indexOf("phase === 'zetje'");
    assert.ok(fase1 > 0 && fase2 > fase1);
    assert.ok(code.slice(fase1, fase2).includes('classificeer('), 'fase 1 zonder poortwachter');
    assert.ok(code.slice(fase2).includes('classificeer('), 'fase 2 zonder poortwachter');
    assert.equal(CONTEXTS.gli.poortwachterVerplicht, true);
    assert.ok(code.includes("poortwachter_uit"), 'geen afhandeling als de poortwachter uitvalt');
  });

  await test('veertig gevallen, elke categorie minstens drie keer, crisis minstens drie', () => {
    const gevallen = require('../api/_lib/poortwachter-gevallen');
    assert.equal(gevallen.length, 40);
    const cats = CONTEXTS.gli.poortwachter.categorieen;
    const telling = {};
    for (const g of gevallen) {
      assert.ok(cats.includes(g.categorie), `onbekende categorie ${g.categorie}`);
      assert.ok(g.tekst.length > 10);
      telling[g.categorie] = (telling[g.categorie] || 0) + 1;
    }
    for (const c of cats) assert.ok(telling[c] >= 3, `te weinig gevallen voor ${c}`);
    // Eten in de situatie zonder vraag om advies hoort ok te zijn: minstens vijf van die grensgevallen.
    const grens = gevallen.filter((g) => g.categorie === 'ok' && /eet|gegeten|snoep|chips/i.test(g.tekst));
    assert.ok(grens.length >= 5, 'te weinig grensgevallen met eten in de situatie');
  });

  await test('alleenEU zonder Bedrock-sleutel: weigert, geen terugval', async () => {
    delete require.cache[require.resolve('../api/_lib/anthropic')];
    const keys = ['BEDROCK_API_KEY', 'BEDROCK_ACCESS_KEY_ID', 'BEDROCK_SECRET_ACCESS_KEY'];
    const bewaard = keys.map((k) => process.env[k]);
    keys.forEach((k) => delete process.env[k]);
    const { jsonCall } = require('../api/_lib/anthropic');
    await assert.rejects(
      jsonCall({ system: [{ text: 'x' }], user: 'x', schema: { type: 'object' }, label: 'test', alleenEU: true }),
      (e) => e.code === 'eu_niet_beschikbaar',
    );
    keys.forEach((k, i) => { if (bewaard[i] !== undefined) process.env[k] = bewaard[i]; });
    delete require.cache[require.resolve('../api/_lib/anthropic')];
  });

  console.log(`\n${ok} goed, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
