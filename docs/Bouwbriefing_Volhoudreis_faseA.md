# Bouwbriefing Volhoudreis, fase A: de verbinding

Versie 1, 14 oktober 2026. Hoort bij het functioneel ontwerp van dezelfde datum. Dit is de briefing waarmee gebouwd wordt; het FO is het waarom, dit is het wat en hoe.

## 1. Wat fase A oplevert

Na fase A kan een partner (Monter-praktijk, fit20-studio, trainingsbureau) een groep aanmaken, een link delen, en dan loopt elke deelnemer zonder tussenkomst van de trainer door: scan, kaart, Zetjes 66 dagen, hermeting. De trainer geeft het kwartier en verder niets. De aanbieder ziet een eenvoudige lijst: wie zit waar, zonder inhoud.

Dat is genoeg om de pilot met Monter en fit20 te draaien en te factureren. Alles wat de pilot niet nodig heeft, staat in paragraaf 12 en komt daarna.

**Beslissingen uit het FO, vastgelegd op 14 oktober 2026**

| Vraag | Besluit |
| --- | --- |
| Eén database of twee | De reis staat in het Zetjes-project (Supabase ppdxgeatieoxsvoeruuy). De scan blijft in zijn eigen project en meldt een afgeronde meting via één beveiligde route. Gezondheidsgegevens verhuizen niet. |
| Voornaam en e-mail | Beide. E-mail voor de magische link en de hermeting, voornaam voor het zetje. Alleen in de tabel reizen; sessions en profiles blijven anoniem. |
| Proactief zetje | Ja, alleen op het moment dat de deelnemer zelf opgeeft bij vak 1 (weekdag en dagdeel), per mail, één per week, uit te zetten met één klik. |
| Zetjes na dag 66 | Loopt door. Op dag 66 kiest de deelnemer: stoppen, of verder als personal (bestaande koop.html). De aanbieder kan de groep ook verlengen. |
| Naam | De partner kiest. Standaard: de naam van zijn programma, met "volhouden door Happly" eronder. Zonder keuze heet het Volhoudreis. |

## 2. Wat er al staat en wat we ervan gebruiken

Dit is de reden dat fase A kleiner is dan het FO schatte. Gecontroleerd in de code op 14 oktober 2026.

| Al gebouwd | Waar | Gebruik in de reis |
| --- | --- | --- |
| Tenants met type, contact_email, huisstijlvelden ontbreken nog | Zetjes, tabel tenants | De aanbieder. Geen nieuwe tabel |
| Invites: groepslink met context, start_date, expires_at, max_uses, label | Zetjes, tabel invites | De groep. Een groep is een invite met twee extra velden (paragraaf 4). Geen nieuwe tabel groepen |
| Toegang per toestel met anon_id, toestemming in user_profiles | Zetjes, api/_lib/access.js | Blijft. De reis maakt het anon_id aan bij de eerste magische link en onthoudt het |
| Doelscan (12 items, profiel start, dag 30, einde), groepsrapport vanaf 5 | Zetjes, api/scan.js, api/remeasure.js, view report_group_profile | Blijft bestaan voor losse Zetjes-links. In de reis staat hij uit (scan_required = false): de kaart neemt zijn plek |
| Zetjes op maat met profielblok in de systeemprompt | Zetjes, api/claude.js, scan-engine.js profielBlokTekst | Krijgt een tweede bron: het kaartblok |
| Dagelijkse cron 06.00 | Zetjes, vercel.json, api/remeasure.js | Wordt uitgebreid met de reistaken (mails, proactief zetje) |
| Resend-wrapper, afzender hallo@zetjes.nl | Zetjes, api/_lib/mail.js | Krijgt een afzendernaam per aanbieder |
| Zelfkracht Scan, uitslag in de browser berekend, server slaat index, zien, sturen, doen op | happly-scan, api/scan.js | Blijft de voormeting en de hermeting. Krijgt een reis-parameter en meldt de uitslag aan de reis |
| Teamtoken in de link (?team=) als voorbeeld van een koppelparameter | happly-scan, api/scan.js | Hetzelfde patroon voor ?reis= |
| Mollie koop personal (koop.html, checkout.js, webhook) | Zetjes | De keuze op dag 66 |

Wat er niet is en gebouwd wordt: de reis zelf (tabel, scherm, magische link), de kaart (tabel, scherm, koppeling aan Zetjes), de brug met de scan, drie mails, het proactieve zetje, de lijst voor de begeleider.

## 3. Waar wat draait

```
Deelnemer
  │
  ├─ zetjes.nl/reis/<reistoken>          scherm van de reis (Zetjes-repo, public/reis.html)
  │     ├─ stap 2: knop naar scan.happly.nl/?reis=<reistoken>
  │     ├─ stap 3: kaart invullen (in reis.html)
  │     ├─ stap 5: knop naar Zetjes (index.html?token=<invitetoken>, anon_id uit de reis)
  │     └─ stap 6: knop naar scan.happly.nl/?reis=<reistoken>&meting=eind
  │
Scan (happly-scan)                        Zetjes (happly-zetjes)
  api/scan.js slaat op, ziet ?reis=  ──►  api/reis-scan.js  (server naar server, gedeeld geheim)
                                          schrijft index, zien, sturen, doen op de reis
```

De reis woont in de Zetjes-repo en het Zetjes-domein. De scan blijft op scan.happly.nl met zijn eigen uitslagpagina en mail; hij krijgt alleen een parameter en één uitgaande melding. Het FO sprak van de scan "in de reis, in de huisstijl van de aanbieder". Dat is fase D (white label); in fase A opent de scan in een nieuw tabblad met de knop "terug naar je reis" op de uitslagpagina. Dat scheelt een week en de deelnemer merkt er weinig van.

## 4. Gegevens

Eén migratie, idempotent, in de stijl van de bestaande: `migrations/2026-10-reis.sql`. Verwijdert niets.

### 4.1 Groep: twee velden op invites

```sql
alter table invites
  add column if not exists is_reis boolean default false,
  add column if not exists programma_naam text,          -- wat de deelnemer ziet als naam van de reis
  add column if not exists interventie_start date,       -- dag 1 van de 66; leeg = start_date
  add column if not exists begeleider_email text,        -- krijgt de lijst, geen inhoud
  add column if not exists begeleider_token text unique default gen_random_uuid()::text;
```

Een groep is dus een invite met `is_reis = true`. Alles wat Zetjes al van een invite weet (context, geldigheid, maximum, tenant) geldt meteen voor de groep. `scan_required` wordt bij een reis op false gezet, zodat de Doelscan niet in de weg staat.

### 4.2 Reizen

```sql
create table if not exists reizen (
  id               uuid primary key default gen_random_uuid(),
  invite_id        uuid not null references invites(id) on delete cascade,
  token            text unique not null default encode(gen_random_bytes(16), 'hex'),
  anon_id          text unique,                -- de sleutel die Zetjes kent; aangemaakt bij stap 1
  voornaam         text,
  email            text not null,
  email_hash       text not null,              -- sha256 van trim+lower, voor opzoeken en dubbelcheck
  toestemming_at   timestamptz,
  signaal_ok       boolean default false,      -- mag de begeleider een stip zien
  proactief_ok     boolean default false,      -- mag er een wekelijks zetje per mail
  stap             smallint not null default 1 check (stap between 1 and 7),  -- 7 = afgerond
  scan_start_id    uuid,                       -- id in het scanproject, nooit scores hier behalve de vier getallen
  scan_start       jsonb,                      -- {index, zien, sturen, doen, at}
  scan_eind_id     uuid,
  scan_eind        jsonb,
  laatste_activiteit timestamptz,
  magische_link_at timestamptz,
  created_at       timestamptz default now(),
  unique (invite_id, email_hash)
);
create index if not exists reizen_invite_idx on reizen(invite_id);
create index if not exists reizen_anon_idx on reizen(anon_id);
alter table reizen enable row level security;
-- policy "service only" zoals de andere tabellen
```

Het e-mailadres staat alleen hier. Sessions, session_messages en profiles kennen alleen anon_id, zoals nu. Een deelnemer verwijderen (api/verwijder.js bestaat al) verwijdert de reis en daarmee de koppeling; de anonieme sessies blijven anoniem.

### 4.3 Kaarten

```sql
create table if not exists kaarten (
  id              uuid primary key default gen_random_uuid(),
  reis_id         uuid not null references reizen(id) on delete cascade,
  doel            text,                        -- bovenaan de kaart, voorgevuld uit de context
  vak1_moment     text,                        -- wanneer het misgaat
  vak1_weekdag    smallint check (vak1_weekdag between 1 and 7),
  vak1_dagdeel    text check (vak1_dagdeel in ('ochtend','middag','avond')),
  vak1_zin        text,                        -- de zin die hij dan tegen zichzelf zegt
  vak2_inrichting text,
  vak3_als        text,
  vak3_dan        text,
  vak4_woorden    text,
  versie          smallint not null default 1,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create unique index if not exists kaarten_reis_versie_idx on kaarten(reis_id, versie);
alter table kaarten enable row level security;
```

Een aanpassing maakt een nieuwe versie; de oude blijft. Zetjes leest altijd de hoogste versie. Vak 1 heeft naast de vrije tekst twee gestructureerde velden (weekdag, dagdeel) voor het proactieve zetje; zonder die twee is er geen proactief zetje, ook niet als proactief_ok aan staat.

### 4.4 Reisgebeurtenissen

Geen nieuwe tabel. `funnel_events` bestaat al met event, invite_id, user_key, meta. De reis logt daarin: reis_gestart, magische_link_verstuurd, scan_start, kaart_ingevuld, zetjes_eerste, dag30, scan_eind, signaal_stilte, proactief_verstuurd. De begeleiderslijst en later het dashboard lezen hieruit.

## 5. Routes

Alle nieuwe routes in de Zetjes-repo, map `api/`, zelfde stijl als de bestaande (cors uit access.js, service role, geen inhoud in logs).

| Route | Methode | Doet | Wie |
| --- | --- | --- | --- |
| `api/reis-start.js` | POST {inviteToken, voornaam, email, toestemming, signaal_ok, proactief_ok} | Controleert de groepslink (resolveAccess met register), maakt anon_id en user_profiles-rij met consent_at, maakt de reis, stuurt de magische link. Bestaat het adres al in deze groep: stuurt de magische link opnieuw, maakt niets dubbel | Deelnemer |
| `api/reis.js` | GET ?token= | Geeft de reis terug: stap, data per stap, kaart (hoogste versie), dagteller, naam van het programma, kleur en naam van de aanbieder. Nooit het e-mailadres van anderen, nooit sessies | Deelnemer |
| `api/reis-kaart.js` | POST {token, kaart} | Slaat een nieuwe versie op, zet stap op 4 als die lager was, logt kaart_ingevuld | Deelnemer |
| `api/reis-scan.js` | POST {reisToken, meting: 'start' of 'eind', scanId, index, zien, sturen, doen}, header `Authorization: Bearer <REIS_SCAN_SECRET>` | Alleen vanaf de scanserver. Schrijft de vier getallen op de reis, zet stap, logt | Scanserver |
| `api/reis-groep.js` | POST {tenantSlug, label, programma_naam, context, start_date, interventie_start, max_uses, begeleider_email}, header met ADMIN_SECRET (bestaat al in api/admin/invites.js) | Maakt de groep (invite met is_reis), geeft de groepslink en de begeleiderslink terug | Happly, later de aanbieder zelf |
| `api/reis-begeleider.js` | GET ?token= (begeleider_token) | De lijst: per deelnemer voornaam, stap, dag, laatste activiteit als stip (groen tot 7 dagen, grijs 7 tot 10, oranje erna). Alleen deelnemers met signaal_ok. Nooit kaart, nooit sessies, nooit scanscores | Begeleider |
| `api/reis-taken.js` | GET, cron, Bearer CRON_SECRET | Dagelijks 06.00: startdagmail (interventie_start = vandaag), dag 66 mail (hermeting), proactief zetje (vandaag = vak1_weekdag en proactief_ok), stilte-signaal loggen (10 dagen zonder sessie). Voegt zich bij de bestaande cron op remeasure, of krijgt een eigen regel in vercel.json | Systeem |

Bestaande routes die wijzigen:

- `api/validate.js`: als het anon_id bij een reis hoort, geeft hij `reis: {token, dag, programma_naam}` terug, en `scanNodig` is altijd false. Zo weet index.html dat hij in een reis zit en toont de dagteller.
- `api/claude.js`: `loadDoelscanProfile` krijgt een broer `loadKaart(anonId)`. Is er een kaart, dan komt er een kaartblok in `variableSystem`, naast of in plaats van het profielblok. Tekst van het blok: zie paragraaf 8.
- `api/verwijder.js`: verwijdert ook de reis en kaarten bij dit anon_id.

In de scan-repo wijzigt één bestand:

- `api/scan.js`: leest `reis` en `meting` uit de body (de pagina geeft ze door uit de URL, net als `team`). Is `reis` een geldige token (32 hex), dan na de insert een POST naar `https://zetjes.nl/api/reis-scan` met het geheim. Mislukt die melding, dan wordt de meting gewoon opgeslagen en komt er een regel in de log; de deelnemer merkt niets, de reis haalt het later niet alsnog op (dat is fase B: een herstelknop in de begeleiderslijst). `index.html` van de scan: de uitslagpagina toont bij een reis-parameter de knop "Terug naar je reis" naar `zetjes.nl/reis/<token>`.

## 6. Schermen

Drie nieuwe pagina's in `public/` van Zetjes, dezelfde opbouw en huisstijl als index.html (zand, zwart, magenta; DM Serif Display en DM Sans). Mobiel eerst, want de kaart wordt in de zaal op de telefoon ingevuld.

### 6.1 `reis-start.html` (de groepslink: zetjes.nl/start/<invitetoken>)

Eén scherm. Naam van het programma en de aanbieder bovenaan. Drie velden: voornaam, e-mail, en de toestemming (één zin, link naar privacy.html). Twee vinkjes, standaard uit: "Mijn begeleider mag zien hoe ver ik ben, niet wat ik invul" en "Stuur me op mijn lastige moment één keer per week een zetje per mail". Knop: Begin. Daarna: "Kijk in je mail, daar staat je link." Geen wachtwoord, nergens.

### 6.2 `reis.html` (de reis: zetjes.nl/reis/<reistoken>)

Boven: naam programma, voornaam, dag X van 66 zodra stap 5 loopt.

Zes stappen onder elkaar als tijdlijn, elke stap met status (nog niet, bezig, klaar) en de datum:

1. **Begonnen.** Datum. Klaar.
2. **Zelfkracht Scan.** Knop "Doe de scan (8 minuten)" naar scan.happly.nl/?reis=<token>&src=reis. Na terugkomst: de vier getallen en "je uitslag staat ook in je mail". Het filmpje (drie minuten) staat hier, embed van een bestand op TransIP of Vimeo; zolang het er niet is, staat er de tekst van het kwartier in vier regels.
3. **Volhoudkaart.** Vier vakken met de letterlijke teksten uit het kwartier als vraag. Vak 1 heeft naast de tekst twee keuzes: weekdag en dagdeel. Vak 3 is twee velden: Als ... dan .... Opslaan. De kaart blijft open en te wijzigen; elke wijziging is een versie. Onder de kaart: "Print" (de browser print de kaart als A4 in dezelfde vier vakken, css @media print).
4. **[Naam programma].** Startdatum en einddatum als die bekend zijn. Verder niets.
5. **Zetjes.** Knop "Open Zetjes" naar index.html?token=<invitetoken> met het anon_id in de link (`&a=<anon_id>`, index.html slaat het op in localStorage zoals nu). Dagteller. Onder de knop: de als-dan-zin uit vak 3, als herinnering.
6. **Hermeting.** Vanaf dag 60 een knop naar de scan met &meting=eind. Daarna: beide metingen naast elkaar, met de kaart ernaast. En de keuze: "Doorgaan met Zetjes" (koop.html) of "Ik ben klaar".

Onderaan altijd klein: "volhouden door Happly". Instellingen: beide vinkjes aan of uit te zetten, en "Verwijder mijn gegevens" (api/verwijder.js).

### 6.3 `begeleider.html` (zetjes.nl/groep/<begeleidertoken>)

Eén tabel: voornaam, stap als zes stippen, dag, laatste activiteit als kleur. Bovenaan: aantal deelnemers, aantal met scan, aantal met kaart, aantal met hermeting. De groepslink en QR-code om opnieuw te delen. Niets klikbaar naar inhoud. Deelnemers zonder signaal_ok staan er als "deelnemer" zonder voornaam en zonder kleur, met alleen de stap.

### 6.4 Wijziging in `index.html` (Zetjes)

Als validate een `reis` teruggeeft: dagteller in de kop ("dag 23 van 66"), en de link "Je reis" naar reis.html. De Doelscan-schermen slaan over. Verder ongewijzigd.

## 7. De brug met de scan, precies

1. De reis maakt de link: `https://scan.happly.nl/?reis=<reistoken>&src=reis` (hermeting: `&meting=eind`).
2. De scanpagina bewaart `reis` en `meting` zoals hij `team` bewaart, en geeft ze mee in de body van POST /api/scan.
3. `api/scan.js` slaat de meting op zoals altijd. Met de nieuwe kolom `reis_token text` op index_scan_results (migratie in de scan-repo, één regel, getrapt vangnet zoals bij teamkracht_team_id). Daarna, buiten de respons om maar wel afgewacht (Vercel beëindigt een functie na de respons): POST naar `REIS_URL/api/reis-scan` met Bearer `REIS_SCAN_SECRET` en body {reisToken, meting, scanId, index, zien, sturen, doen}.
4. `api/reis-scan.js` controleert het geheim, zoekt de reis, schrijft `scan_start` of `scan_eind`, zet stap 3 (na start) of 7 (na eind), logt.
5. De uitslagpagina van de scan toont "Terug naar je reis". De mailstap van de scan blijft: de deelnemer krijgt zijn uitslag per mail zoals iedereen. Het adres is al bekend uit de reis; de scan vraagt het toch opnieuw, want de scan weet niets van de reis behalve de token. Dat is in fase A acceptabel; in fase D vult de reis het adres voor.

Twee geheimen, door Maarten te zetten in Vercel: `REIS_SCAN_SECRET` in beide projecten (dezelfde waarde), `REIS_URL` in het scanproject (https://zetjes.nl). Aanmaken: 32 willekeurige tekens, bijvoorbeeld uit een wachtwoordmanager.

## 8. Zetjes op de kaart

Het kaartblok dat in `variableSystem` komt, in de stijl van het profielblok:

```
DE KAART VAN DEZE PERSOON (zelf ingevuld bij de start, in eigen woorden):
Doel: {doel}
Wanneer het misgaat: {vak1_moment}. Wat hij dan tegen zichzelf zegt: "{vak1_zin}"
Wat hij anders heeft ingericht: {vak2_inrichting}
Zijn plan: als {vak3_als}, dan {vak3_dan}
Zijn eigen woorden als het zwaar wordt: "{vak4_woorden}"
Dag {dag} van 66.

Gebruik dit zo: herken de zin uit vak 1 als die terugkomt en benoem dat het het moment is, niet de waarheid. Verwijs naar het als-dan-plan als eerste stap, of maak hem kleiner als hij vandaag te groot is. Sluit af met de woorden uit vak 4, letterlijk, als dat past. Verzin geen andere woorden voor hem.
```

Het proactieve zetje (mail, één per week op vak1_weekdag, dagdeel bepaalt het uur: 08.00, 13.00, 19.00) is geen Claude-call. Het is een vaste mail met drie regels uit de kaart: de als-dan-zin, de woorden uit vak 4, en de dagteller. In de woorden van de deelnemer, niet van Happly. Onderwerp: "{voornaam}, {vak3_als}". Onderaan: "Niet meer sturen" (één klik, zet proactief_ok uit).

## 9. Mails in fase A

Drie, via de bestaande Resend-wrapper. Afzender: "{naam aanbieder} via Zetjes <hallo@zetjes.nl>". Reply-to: begeleider_email als die er is. Het FO noemde zeven mails; de overige vier (uitnodiging vooraf, na de scan, dag 30, na de hermeting) zijn fase C.

| Moment | Onderwerp | Inhoud |
| --- | --- | --- |
| Direct bij start | Je link voor {programma} | Eén knop naar de reis. "Bewaar deze mail, dit is je toegang. Eerste stap: de scan, 8 minuten." |
| Startdag interventie (cron) | Vandaag begint het | Dagteller start. Knop naar Zetjes. De als-dan-zin uit vak 3 als die er is; anders: "Vul eerst je kaart in" met knop |
| Dag 66 (cron) | Je tweede meting | Knop naar de scan met &meting=eind. "Daarna zie je het verschil." |

Plus het wekelijkse proactieve zetje uit paragraaf 8, alleen bij proactief_ok.

Alle mails: geen inhoud van de kaart behalve in het proactieve zetje naar de deelnemer zelf. Geen cijfers. Geen uitroeptekens.

## 10. Rechten en privacy

- De reis kent voornaam en e-mail; Zetjes-sessies blijven anoniem. In de DPIA komt de reis erbij als nieuwe verwerking met als doel: toegang en hermeting. Maarten werkt de DPIA bij; de briefing levert de tekst van paragraaf 4 als bijlage.
- De begeleider ziet voortgang, nooit inhoud. Dat is technisch afgedwongen: `api/reis-begeleider.js` selecteert geen enkele kolom uit kaarten, sessions of scan_*. Een test bewaakt dat (paragraaf 11).
- Zonder signaal_ok ziet de begeleider stap en niets anders, ook geen voornaam.
- De vier scangetallen staan op de reis zodat de deelnemer zijn verschil ziet. De aanbieder ziet in fase A geen scores, ook niet geaggregeerd; dat komt in fase B met dezelfde grens als report_group: vanaf vijf.
- Verwijderen: de bestaande route verwijdert reis, kaarten en sessies bij het anon_id. De meting in het scanproject blijft staan zonder reis_token (die wordt leeggemaakt via de brug, zelfde geheim, route `api/reis-los.js` in de scan-repo, één functie).
- Toestemming is één zin met link naar privacy.html; privacy.html krijgt een alinea over de reis.

## 11. Tests

In `scripts/` van Zetjes, node:test zoals de bestaande apitest.js:

1. reis-start maakt geen dubbele reis bij hetzelfde adres in dezelfde groep, en stuurt wel opnieuw de link.
2. reis-begeleider geeft nooit een veld terug uit kaarten, sessions, scan_start, scan_eind (test leest de SQL-select in de bron en het antwoord van een proefaanroep).
3. reis-scan weigert zonder of met verkeerd geheim.
4. Een kaart zonder weekdag en dagdeel levert nooit een proactief zetje op, ook met proactief_ok.
5. Het kaartblok bevat alle vijf velden letterlijk en niets erbuiten.
6. De taalregels: geen afhaker, opgever, stopper als zelfstandig naamwoord, geen doorzetten, geen uitroeptekens, in reis.html, reis-start.html, begeleider.html en de mailteksten.
7. In de scan-repo: scan.js slaat de meting ook op als de brug faalt (brug gemockt op fout).

## 12. Wat niet in fase A zit

Bewust, om in drie weken live te zijn:

- Scan in de huisstijl van de aanbieder en binnen de reis (fase D). Nu: nieuw tabblad met terugknop.
- Mails 2, 4, 5 en 7 uit het FO (fase C).
- Dag 30 tussenmeting in de reis (fase C). De Zetjes-eigen hermeting dag 30 draait niet in de reis omdat de Doelscan uit staat.
- Dashboard voor de aanbieder met gemeten verschil per groep vanaf vijf deelnemers (fase B).
- Aanwezigheid aanvinken per sessie (fase B).
- Herstelknop als de brug een meting niet heeft doorgegeven (fase B).
- Groep aanmaken door de aanbieder zelf (fase B; nu doet Happly het met de admin-route).
- Eigen domein per aanbieder (fase D).
- Foto van een papieren kaart uitlezen: vervalt, de kaart is digitaal.

## 13. Volgorde en akkoordmomenten

Elke stap is apart te testen en live te zetten. Maarten keurt bij elke ster.

| Stap | Wat | Omvang | Akkoord |
| --- | --- | --- | --- |
| 1 | Migratie 2026-10-reis.sql in Zetjes; kolom reis_token in de scan. Maarten draait beide in Supabase | 1 dag | ★ SQL nalezen, draaien |
| 2 | api/reis-start, api/reis, api/reis-groep, mail 1; reis-start.html en reis.html met stap 1 en 3 (kaart). Eerste groep aanmaken: Proef Happly | 4 dagen | ★ Zelf een reis beginnen en een kaart invullen op de telefoon |
| 3 | De brug: scan.js, api/reis-scan.js, terugknop; geheimen in Vercel | 2 dagen | ★ Scan doen vanuit de reis, getallen zien verschijnen |
| 4 | Zetjes op de kaart: validate, claude.js kaartblok, index.html dagteller en link; verwijder.js | 3 dagen | ★ Een zetje vragen en herkennen dat het de eigen woorden gebruikt |
| 5 | Cron reis-taken: startdagmail, dag 66 mail, proactief zetje, stilte loggen | 2 dagen | ★ Proefmails ontvangen op een testreis met vervroegde datums |
| 6 | begeleider.html en api/reis-begeleider; stap 6 in reis.html (hermeting en keuze) | 3 dagen | ★ Lijst zien zonder inhoud; hermeting doen |
| 7 | Tests, privacy.html, DPIA-bijlage, LEESMIJ voor de partner (hoe deel ik de link, wat ziet de deelnemer) | 2 dagen | ★ Live voor Monter en fit20 |

Zeventien werkdagen bouwen, ruim drie weken met jouw testrondes ertussen. De eerdere schatting van twee tot drie weken hield geen rekening met de brug en de cron; dit is de eerlijke telling.

**Wat Maarten doet**

- Stap 1: de twee SQL-bestanden draaien in Supabase (SQL Editor, plakken, Run; het bestand eindigt met een controleregel die één rij teruggeeft).
- Stap 3: `REIS_SCAN_SECRET` zetten in beide Vercel-projecten en `REIS_URL` in het scanproject (Vercel, project, Settings, Environment Variables, Add).
- Resend: domein zetjes.nl staat al; niets te doen tenzij de afzender happly.nl moet worden.
- Het filmpje van drie minuten opnemen; tot die tijd staat de tekst van het kwartier op de reis.
- Bij elke ster testen op de eigen telefoon, niet alleen op de laptop.

**Wat dit mogelijk maakt voor de verkoop**

Na stap 7 is "Happly volhouden inside" een link die een partner in zijn programma zet. De licentie per groep (scan, kaart, Zetjes 66 dagen, hermeting, begeleiderslijst) is daarmee een product dat zonder jou draait. Prijsstelling staat buiten deze briefing; de bestaande ondergrens blijft gelden tot de pilot iets anders leert.
