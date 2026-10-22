// api/_lib/poortwachter.js
// De poortwachter: classificeert een bericht van de deelnemer voordat er een
// zetje komt. Hij antwoordt nooit zelf; hij kiest een categorie uit de
// context, en de context levert de vaste tekst die daarbij hoort.
//
// In contexten met poortwachterVerplicht (de GLI) is geen poortwachter geen
// zetje: valt de classificatie uit, dan krijgt de deelnemer de tekst
// "probeer het straks nog eens" en geen antwoord van het model.

const { jsonCall } = require('./anthropic');

function schema(categorieen) {
  return {
    type: 'object',
    properties: { categorie: { type: 'string', enum: categorieen } },
    required: ['categorie'],
    additionalProperties: false,
  };
}

function systeemtekst(pw) {
  return `Je bent de poortwachter van Zetjes. Je classificeert alleen, je antwoordt de gebruiker niet.
${pw.beschrijving}
Kies precies één categorie uit: ${pw.categorieen.join(', ')}.
crisis gaat altijd voor: kies crisis bij elk signaal van gedachten aan zelfdoding, zelfbeschadiging of acuut gevaar. Twijfel je tussen ok en een andere categorie zonder crisis-signaal, kies dan ok.`;
}

// Geeft de categorie terug ('ok' als de poortwachter niet is ingesteld).
// Gooit bij een verplichte poortwachter een fout met code 'poortwachter_uit'.
async function classificeer(ctx, tekst) {
  const pw = ctx.poortwachter;
  if (!pw || !tekst) return 'ok';
  try {
    const { data } = await jsonCall({
      label: 'poortwachter',
      alleenEU: Boolean(ctx.alleenEU),
      system: [{ text: systeemtekst(pw), cache: false }],
      user: tekst,
      schema: schema(pw.categorieen),
      maxTokens: 256,
      thinking: false,
    });
    const c = data?.categorie;
    return pw.categorieen.includes(c) ? c : 'ok';
  } catch (err) {
    if (err.code === 'eu_niet_beschikbaar') throw err;
    console.error('poortwachter', err.message);
    if (ctx.poortwachterVerplicht) throw Object.assign(new Error('Poortwachter niet beschikbaar'), { code: 'poortwachter_uit' });
    // Niet verplicht: doorgaan, de systeemprompt bevat dezelfde grenzen.
    return 'ok';
  }
}

function tekstVoor(ctx, categorie) {
  const pw = ctx.poortwachter;
  return pw.teksten[categorie] || pw.teksten.offtopic;
}

const TEKST_UIT = 'Zetjes kan je nu even niet helpen. Probeer het straks nog eens.';

module.exports = { classificeer, tekstVoor, systeemtekst, TEKST_UIT };
