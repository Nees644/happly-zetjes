// scripts/gli-tests.js
// Bewaakt de afspraken voor Zetjes bij het leefstijlprogramma (GLI):
// uitdrukkelijke toestemming, alleen verwerking in Europa, en een privacyverklaring
// die zegt wat de code doet. Start: node scripts/gli-tests.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
async function test(naam, fn) {
  try { await fn(); console.log('ok  ', naam); ok++; }
  catch (e) { console.log('FOUT', naam, '-', e.message); fail++; }
}

(async () => {
  const { getContext } = require('../api/_lib/contexts');
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

  await test('GLI verwerkt alleen in Europa', () => {
    assert.strictEqual(gli.alleenEU, true);
  });

  await test('privacyverklaring GLI klopt met de afspraken', () => {
    const p = fs.readFileSync(path.join(__dirname, '../public/privacy-gli.html'), 'utf8');
    assert.ok(p.includes('tien deelnemers'), 'minimum van tien ontbreekt');
    assert.ok(p.includes('artikel 9 lid 2 sub a'), 'grondslag artikel 9 ontbreekt');
    assert.ok(p.includes('Frankfurt'), 'Europese verwerking ontbreekt');
    assert.ok(!/>VS</.test(p) && !p.includes('Verenigde Staten'), 'VS genoemd als verwerkingsplek');
    assert.ok(!/[—–]/.test(p), 'gedachtestreepje gevonden');
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
