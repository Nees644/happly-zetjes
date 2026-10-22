// api/_lib/reis.js
// Gedeelde functies voor de Volhoudreis: reis laden, dag tellen, de stand per
// stap bepalen, de kaart lezen en de mails bouwen. Zie docs/Bouwbriefing_Volhoudreis_faseA.md.
//
// De reis is de enige plek met voornaam en e-mail. Alles wat hier naar de
// browser gaat, is van de deelnemer zelf; de begeleider krijgt via
// reis-begeleider.js een aparte, smallere selectie.

const crypto = require('crypto');
const { supabase } = require('./supabase');
const { todayNL } = require('./access');
const { stuurMail } = require('./mail');

const REIS_TOKEN_RE = /^[0-9a-f]{32}$/;
const DAGEN = 66;
const MAX_TEKST = 400;

function appUrl() {
  return (process.env.APP_URL || 'https://happly-zetjes.vercel.app').replace(/\/$/, '');
}

function scanUrl() {
  return (process.env.SCAN_URL || 'https://scan.happly.nl').replace(/\/$/, '');
}

function emailHash(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

function geldigEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.length <= 200;
}

function schoon(t, max = MAX_TEKST) {
  if (t == null) return null;
  const s = String(t).replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

// Dag in de reis: 1 op interventie_start (of start_date), DAGEN op de laatste dag.
// Voor de start negatief (aantal dagen tot de start), erna telt hij door.
function dagInReis(invite) {
  const start = invite.interventie_start || invite.start_date;
  if (!start) return null;
  const verschil = Math.floor((Date.parse(todayNL()) - Date.parse(start)) / 86400000);
  return verschil + 1;
}

const SELECT_REIS = 'id, invite_id, token, anon_id, voornaam, email, toestemming_at, signaal_ok, proactief_ok, stap, ' +
  'scan_start_id, scan_start, scan_eind_id, scan_eind, laatste_activiteit, proactief_laatst_at, created_at, ' +
  'invites(id, token, tenant_id, context, label, programma_naam, start_date, interventie_start, expires_at, active, is_reis, begeleider_email, tenants(name, slug, contact_email))';

async function laadReis(token) {
  if (!token || !REIS_TOKEN_RE.test(String(token))) return null;
  const { data } = await supabase.from('reizen').select(SELECT_REIS).eq('token', token).maybeSingle();
  return data || null;
}

async function laadReisOpAnon(anonId) {
  if (!anonId) return null;
  const { data } = await supabase.from('reizen').select(SELECT_REIS).eq('anon_id', anonId).maybeSingle();
  return data || null;
}

async function laadKaart(reisId) {
  const { data } = await supabase
    .from('kaarten').select('*').eq('reis_id', reisId)
    .order('versie', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// De stand van de zes stappen, afgeleid uit de gegevens. Niet uit een vlag:
// dan kan hij niet uit de pas lopen met wat er echt is.
function standVanStappen(reis, kaart) {
  const inv = reis.invites || {};
  const dag = dagInReis(inv);
  const gestart = dag != null && dag >= 1;
  const klaar = (s) => ({ status: 'klaar', ...s });
  const bezig = (s) => ({ status: 'bezig', ...s });
  const nog = (s) => ({ status: 'nog', ...s });

  const s1 = klaar({ datum: reis.created_at });
  const s2 = reis.scan_start ? klaar({ datum: reis.scan_start.at, getallen: reis.scan_start }) : bezig({});
  const s3 = kaart ? klaar({ datum: kaart.created_at, versie: kaart.versie }) : (reis.scan_start ? bezig({}) : nog({}));
  const s4 = { status: gestart ? 'klaar' : 'nog', start: inv.interventie_start || inv.start_date, naam: inv.programma_naam || inv.label };
  const s5 = !gestart ? nog({ dag }) : (dag <= DAGEN ? bezig({ dag }) : klaar({ dag }));
  const s6 = reis.scan_eind ? klaar({ datum: reis.scan_eind.at, getallen: reis.scan_eind })
    : (gestart && dag >= DAGEN - 6 ? bezig({ dag }) : nog({ dag }));

  const stappen = [s1, s2, s3, s4, s5, s6];
  // Hoogste stap die nog niet klaar is; 7 als alles klaar is.
  let huidig = 7;
  for (let i = 0; i < stappen.length; i++) {
    if (stappen[i].status !== 'klaar') { huidig = i + 1; break; }
  }
  return { stappen, huidig, dag, dagen: DAGEN };
}

// Schrijft de afgeleide stap terug, voor de lijst van de begeleider.
async function werkStapBij(reis, kaart) {
  const { huidig } = standVanStappen(reis, kaart);
  if (huidig !== reis.stap) {
    await supabase.from('reizen').update({ stap: huidig }).eq('id', reis.id);
  }
  return huidig;
}

async function log(event, reis, meta) {
  try {
    await supabase.from('funnel_events').insert({
      event, src: 'reis', invite_id: reis.invite_id, user_key: reis.anon_id, meta: meta || null,
    });
  } catch (err) {
    console.error('reis log', event, err.message);
  }
}

// Wat de deelnemer ziet: de naam van het programma en de aanbieder. De partner
// kiest de naam; zonder keuze heet het Volhoudreis.
function weergave(invite) {
  const tenant = invite?.tenants || {};
  return {
    programma: invite?.programma_naam || invite?.label || 'Volhoudreis',
    aanbieder: tenant.name || 'Happly',
    afzenderNaam: `${tenant.name || 'Happly'} via Zetjes`,
    replyTo: invite?.begeleider_email || tenant.contact_email || null,
  };
}

function reisLink(reis) { return `${appUrl()}/reis/${reis.token}`; }
function zetjesLink(reis) { return `${appUrl()}/?token=${reis.invites.token}&a=${encodeURIComponent(reis.anon_id)}`; }
function scanLink(reis, meting) {
  // Rechtstreeks naar de scanpagina, niet naar de voorpagina van de scan.
  return `${scanUrl()}/scan?reis=${reis.token}&meting=${meting}&src=reis`;
}

// Het kaartblok voor de systeemprompt van Zetjes (bouwbriefing paragraaf 8).
// In de woorden van de deelnemer; Zetjes verzint er geen andere bij.
const WEEKDAGEN = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
function kaartBlokTekst(kaart, dag, voornaam) {
  if (!kaart) return '';
  const r = ['DE KAART VAN DEZE PERSOON (zelf ingevuld bij de start, in eigen woorden):'];
  if (voornaam) r.push(`Voornaam: ${voornaam}`);
  if (kaart.waarom) r.push(`Waarom hij dit wil, in eigen woorden: "${kaart.waarom}"`);
  if (kaart.doel) r.push(`Doel: ${kaart.doel}`);
  const moment = [kaart.vak1_moment, kaart.vak1_weekdag ? `${WEEKDAGEN[kaart.vak1_weekdag]}${kaart.vak1_dagdeel ? ', ' + kaart.vak1_dagdeel : ''}` : null].filter(Boolean).join('; ');
  if (moment) r.push(`Moeilijk moment: ${moment}`);
  if (kaart.vak1_zin) r.push(`Wat hij dan tegen zichzelf zegt: "${kaart.vak1_zin}"`);
  if (kaart.vak2_inrichting) r.push(`Wat hij anders heeft ingericht: ${kaart.vak2_inrichting}`);
  if (kaart.vak3_als && kaart.vak3_dan) r.push(`Zijn plan: als ${kaart.vak3_als}, dan ${kaart.vak3_dan}`);
  if (kaart.vak4_woorden) r.push(`Zijn eigen woorden als het zwaar wordt: "${kaart.vak4_woorden}"`);
  if (dag != null && dag >= 1) r.push(`Dag ${dag} van ${DAGEN}.`);
  r.push('');
  r.push('Gebruik dit zo: zakt de zin weg of schrijft hij dat het geen nut heeft, geef dan eerst zijn waarom terug, letterlijk, als vraag of herinnering. Herken de zin uit "wat hij dan tegen zichzelf zegt" als die terugkomt en benoem dat het het moment is, niet de waarheid. Verwijs naar het als-dan-plan als eerste stap, of maak hem kleiner als hij vandaag te groot is. Sluit af met zijn eigen woorden, letterlijk, als dat past. Verzin geen andere woorden voor hem en herhaal de kaart niet als lijst.');
  return r.join('\n');
}

// ── De gewoontemeting ────────────────────────────────────────
// Vier zinnen (SRBAI, Gardner 2012) over het doel van de kaart, één keer per
// week vanaf dag 7, tot ruim na de hermeting. De deelnemer ziet nooit een
// cijfer; de antwoorden zijn er om per persoon de curve te leren kennen.
const GEWOONTE_VANAF_DAG = 7;
const GEWOONTE_TOT_DAG = DAGEN + 34;
const GEWOONTE_INTERVAL_DAGEN = 7;
const GEWOONTE_ZINNEN = [
  'iets wat ik automatisch doe',
  'iets wat ik doe zonder erbij na te denken',
  'iets wat ik doe zonder dat ik het bewust hoef te onthouden',
  'iets waar ik al mee begonnen ben voordat ik het besef',
];

async function laatsteGewoontemeting(reisId) {
  const { data } = await supabase
    .from('gewoontemeting').select('id, dag, created_at').eq('reis_id', reisId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// Is de weekvraag aan de beurt? Alleen in de dagen van de reis, alleen met
// een kaart (anders is er geen doel om naar te vragen), en nooit vaker dan
// eens per zeven dagen, overgeslagen of niet.
async function gewoonteVraag(reis, kaart) {
  const dag = dagInReis(reis.invites || {});
  if (!kaart || dag == null || dag < GEWOONTE_VANAF_DAG || dag > GEWOONTE_TOT_DAG) return null;
  const laatste = await laatsteGewoontemeting(reis.id);
  if (laatste) {
    const sinds = (Date.now() - Date.parse(laatste.created_at)) / 86400000;
    if (sinds < GEWOONTE_INTERVAL_DAGEN) return null;
  }
  const doel = kaart.doel ? kaart.doel.replace(/\.$/, '') : 'Wat ik volhoud';
  const aanhef = doel.charAt(0).toUpperCase() + doel.slice(1);
  return { dag, aanhef, zinnen: GEWOONTE_ZINNEN };
}

// ── Het tempo, de boodschap bij de start ─────────────────────
// Het gemiddelde is het anker, de scan geeft de persoonlijke draai. Altijd een
// sterkte uit de scan (de eigen hoogste dimensie), nooit een tekort, en nooit
// een persoonlijk aantal dagen: dat hebben we pas als de gewoontemeting
// genoeg reizen heeft gezien, en dan nog alleen als band. Geen wedstrijd.
const TEMPO_STERKTE = {
  doen: 'Jouw scan zegt dat beginnen en doorgaan jouw kracht is.',
  sturen: 'Jouw scan zegt dat je zelf je richting bepaalt, en dat draagt de eerste weken.',
  zien: 'Jouw scan zegt dat je je eigen patronen herkent, en wie het moment ziet aankomen, kan het voor zijn.',
};
function tempoTekst(reis, kaart) {
  const s = reis.scan_start || {};
  const dims = ['doen', 'sturen', 'zien'].filter((d) => typeof s[d] === 'number');
  let sterkte = null;
  if (dims.length) {
    const hoogste = dims.reduce((a, b) => (s[b] > s[a] ? b : a));
    if (s[hoogste] >= 50) sterkte = TEMPO_STERKTE[hoogste];
  }
  if (!sterkte && kaart?.waarom) sterkte = 'Jouw waarom staat op je kaart, en dat is wat de eerste weken draagt.';
  if (!sterkte) sterkte = 'Je kaart staat, en dat is wat de eerste weken draagt.';
  return [
    `Een nieuwe gewoonte kost gemiddeld ${DAGEN} dagen. Sommigen zijn er in 18, anderen hebben meer tijd nodig; het is geen wedstrijd.`,
    'Wat het tempo bepaalt is niet wilskracht maar twee dingen: snel beginnen en doorgaan als de motivatie wegzakt.',
    sterkte,
    'Op de momenten dat het wegzakt staan wij ernaast. Daar winnen we de dagen.',
  ];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Eén sobere mailvorm voor alle reismails: kop, alinea's, één knop, voet.
function mailHtml({ kop, alineas, knopTekst, knopUrl, voet }) {
  const p = (alineas || []).map((a) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1A0A12">${a}</p>`).join('');
  const knop = knopUrl ? `<p style="margin:22px 0"><a href="${knopUrl}" style="display:inline-block;background:#CC0066;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:600;font-size:16px">${esc(knopTekst)}</a></p>` : '';
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#FDF8FB;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:22px;line-height:1.25;margin:0 0 18px;color:#1A0A12">${esc(kop)}</h1>
${p}${knop}
<p style="margin:28px 0 0;font-size:12px;color:#A87A94">${voet || 'volhouden door Happly'}</p>
</div></body></html>`;
}

async function mailMagischeLink(reis) {
  const w = weergave(reis.invites);
  const naam = reis.voornaam ? `${esc(reis.voornaam)}, ` : '';
  await stuurMail({
    naar: reis.email,
    onderwerp: `Je link voor ${w.programma}`,
    afzenderNaam: w.afzenderNaam,
    replyTo: w.replyTo,
    html: mailHtml({
      kop: `${naam}dit is je toegang`,
      alineas: [
        `Bewaar deze mail. De knop hieronder is je toegang tot je reis bij ${esc(w.programma)}, nu en de komende weken.`,
        'Eerste stap: de Zelfkracht Scan, acht minuten. Daarna vul je je kaart in, en dan staan je Zetjes klaar.',
      ],
      knopTekst: 'Open je reis',
      knopUrl: reisLink(reis),
    }),
  });
  await supabase.from('reizen').update({ magische_link_at: new Date().toISOString() }).eq('id', reis.id);
}

module.exports = {
  REIS_TOKEN_RE, DAGEN, appUrl, scanUrl, emailHash, geldigEmail, schoon, dagInReis,
  laadReis, laadReisOpAnon, laadKaart, standVanStappen, werkStapBij, log, weergave,
  reisLink, zetjesLink, scanLink, esc, mailHtml, mailMagischeLink, kaartBlokTekst,
  GEWOONTE_ZINNEN, GEWOONTE_VANAF_DAG, gewoonteVraag, laatsteGewoontemeting, tempoTekst,
};
