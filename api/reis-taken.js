// api/reis-taken.js
// GET, dagelijkse Vercel-cron (Authorization: Bearer CRON_SECRET).
// Drie taken voor de Volhoudreis, elk idempotent via funnel_events of een
// datumkolom, zodat een tweede run op dezelfde dag niets dubbel stuurt:
// 1. startdagmail: vandaag is dag 1 van de reis
// 2. dag 66 mail: tijd voor de hermeting
// 3. proactief zetje: vandaag is de weekdag uit vak 1, hoogstens één per week
// Het stiltesignaal hoeft niet gelogd: de begeleiderslijst leest
// laatste_activiteit rechtstreeks.
//
// De cron draait één keer per dag, in de ochtend. Het proactieve zetje gaat
// dus 's ochtends uit en noemt het dagdeel van de deelnemer ("vanavond").

const { supabase } = require('./_lib/supabase');
const { todayNL } = require('./_lib/access');
const { stuurMail } = require('./_lib/mail');
const { laadReis, laadKaart, dagInReis, DAGEN, weergave, reisLink, zetjesLink, scanLink, mailHtml, esc, log, appUrl } = require('./_lib/reis');

const WEEK_MS = 6 * 24 * 60 * 60 * 1000; // zes dagen marge: elke week dezelfde dag
const DAGDEEL_TEKST = { ochtend: 'vanochtend', middag: 'vanmiddag', avond: 'vanavond' };

function isCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('reis-taken: CRON_SECRET niet gezet, aanroep geweigerd'); return false; }
  return req.headers?.authorization === `Bearer ${secret}`;
}

// Weekdag van vandaag in Nederland: 1 = maandag, 7 = zondag
function weekdagNL() {
  const d = new Date(todayNL() + 'T12:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

async function alGedaan(event, reis) {
  const { data } = await supabase
    .from('funnel_events').select('id').eq('event', event).eq('user_key', reis.anon_id).limit(1).maybeSingle();
  return !!data;
}

// Alle reizen in actieve, niet verlopen groepen. Het aantal reizen is klein
// (tientallen tot honderden); per reis één extra lees is prima voor een
// dagelijkse taak.
async function actieveReizen() {
  const { data } = await supabase.from('reizen').select('token');
  const nu = Date.now();
  const uit = [];
  for (const r of data || []) {
    const reis = await laadReis(r.token);
    const inv = reis?.invites;
    if (!reis || !inv?.active) continue;
    if (inv.expires_at && Date.parse(inv.expires_at) <= nu) continue;
    uit.push(reis);
  }
  return uit;
}

async function mailStartdag(reis, kaart) {
  const w = weergave(reis.invites);
  const naam = reis.voornaam ? `${esc(reis.voornaam)}, ` : '';
  const alineas = [`Vandaag begint ${esc(w.programma)}. Vanaf nu tellen de dagen: ${DAGEN} dagen, en je Zetjes staan klaar voor de momenten die ertoe doen.`];
  if (kaart?.vak3_als && kaart?.vak3_dan) {
    alineas.push(`Je plan staat: als ${esc(kaart.vak3_als)}, dan ${esc(kaart.vak3_dan)}. Zo klein dat het ook op een moeilijke dag kan.`);
  } else {
    alineas.push('Je kaart is nog niet ingevuld. Doe dat vandaag, dan weet Zetjes waar je op let.');
  }
  await stuurMail({
    naar: reis.email, onderwerp: 'Vandaag begint het', afzenderNaam: w.afzenderNaam, replyTo: w.replyTo,
    html: mailHtml({
      kop: `${naam}dag 1 van ${DAGEN}`,
      alineas,
      knopTekst: kaart ? 'Open Zetjes' : 'Vul je kaart in',
      knopUrl: kaart ? zetjesLink(reis) : reisLink(reis),
    }),
  });
}

async function mailDag66(reis) {
  const w = weergave(reis.invites);
  const naam = reis.voornaam ? `${esc(reis.voornaam)}, ` : '';
  await stuurMail({
    naar: reis.email, onderwerp: 'Je tweede meting', afzenderNaam: w.afzenderNaam, replyTo: w.replyTo,
    html: mailHtml({
      kop: `${naam}${DAGEN} dagen`,
      alineas: [
        `Je bent ${DAGEN} dagen onderweg in ${esc(w.programma)}. Tijd voor de tweede meting: dezelfde vragen als bij de start, acht minuten.`,
        'Daarna zie je in je reis het verschil, met je kaart ernaast. Je kaart blijft van jou, en Zetjes kan doorgaan als je dat wilt.',
      ],
      knopTekst: 'Doe de tweede meting',
      knopUrl: scanLink(reis, 'eind'),
    }),
  });
}

// Het wekelijkse zetje: geen AI, drie regels uit de kaart, in de woorden van
// de deelnemer. Onderaan de afmeldlink naar de instellingen van de reis.
async function mailProactief(reis, kaart, dag) {
  const w = weergave(reis.invites);
  const dagdeel = DAGDEEL_TEKST[kaart.vak1_dagdeel] || 'vandaag';
  const alineas = [
    `${dagdeel.charAt(0).toUpperCase() + dagdeel.slice(1)} is je moment${kaart.vak1_moment ? `: ${esc(kaart.vak1_moment)}` : ''}.`,
    `Je plan: als ${esc(kaart.vak3_als)}, dan ${esc(kaart.vak3_dan)}.`,
  ];
  if (kaart.waarom) alineas.push(`Waarom je dit doet: ${esc(kaart.waarom)}`);
  if (kaart.vak4_woorden) alineas.push(`In je eigen woorden: ${esc(kaart.vak4_woorden)}`);
  if (dag != null && dag >= 1 && dag <= DAGEN) alineas.push(`Dag ${dag} van ${DAGEN}.`);
  await stuurMail({
    naar: reis.email, onderwerp: `${reis.voornaam ? reis.voornaam + ', ' : ''}als ${kaart.vak3_als}`,
    afzenderNaam: w.afzenderNaam, replyTo: w.replyTo,
    html: mailHtml({
      kop: 'Je zetje voor deze week',
      alineas,
      knopTekst: 'Lastig moment? Open Zetjes',
      knopUrl: zetjesLink(reis),
      voet: `volhouden door Happly · <a href="${reisLink(reis)}#instellingen" style="color:#A87A94">Niet meer sturen</a>`,
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!isCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const vandaag = todayNL();
  const weekdag = weekdagNL();
  const telling = { startdag: 0, dag66: 0, proactief: 0, fouten: 0 };

  let reizen;
  try { reizen = await actieveReizen(); } catch (err) {
    console.error('reis-taken laden', err.message);
    return res.status(500).json({ error: 'fout' });
  }

  for (const reis of reizen) {
    try {
      const inv = reis.invites || {};
      const dag = dagInReis(inv);
      const kaart = await laadKaart(reis.id);

      // 1. Startdag: dag 1 is vandaag
      if (dag === 1 && !(await alGedaan('mail_startdag', reis))) {
        await mailStartdag(reis, kaart);
        await log('mail_startdag', reis);
        telling.startdag++;
      }

      // 2. Dag 66: eenmalig, ook als de cron een dag heeft gemist (dag 66 tot 72)
      if (dag != null && dag >= DAGEN && dag <= DAGEN + 6 && !reis.scan_eind && !(await alGedaan('mail_dag66', reis))) {
        await mailDag66(reis);
        await log('mail_dag66', reis);
        telling.dag66++;
      }

      // 3. Proactief zetje: aangezet, kaart met weekdag en dagdeel, vandaag die dag, in de 66 dagen, hoogstens één per week
      const laatst = reis.proactief_laatst_at ? Date.parse(reis.proactief_laatst_at) : 0;
      if (reis.proactief_ok && kaart?.vak1_weekdag === weekdag && kaart?.vak1_dagdeel && kaart.vak3_als && kaart.vak3_dan
          && dag != null && dag >= 1 && dag <= DAGEN && Date.now() - laatst > WEEK_MS) {
        await mailProactief(reis, kaart, dag);
        await supabase.from('reizen').update({ proactief_laatst_at: new Date().toISOString() }).eq('id', reis.id);
        await log('proactief_verstuurd', reis, { dag });
        telling.proactief++;
      }
    } catch (err) {
      telling.fouten++;
      console.error('reis-taken reis', err.message);
    }
  }

  return res.status(200).json({ ok: true, datum: vandaag, weekdag, reizen: reizen.length, ...telling });
};
