# Werken aan happly-zetjes

Dit bestand wordt bij elke sessie in deze map geladen. Het staat er zodat een
nieuwe sessie verder kan zonder de hele geschiedenis opnieuw te lezen.

## Wat hier staat

Zetjes: de app voor volhouden (public/index.html), met uitnodigingslinks per
tenant en context, de Doelscan, hermeting op dag 30 en einde, en de koop van
Zetjes personal via Mollie. Supabase-project ppdxgeatieoxsvoeruuy. Deploy via
Vercel; het adres staat in APP_URL (nu happly-zetjes.vercel.app, straks
zetjes.nl).

## De Volhoudreis (sinds 14 oktober 2026)

Het eerste echte product: één reis van zes stappen die de Zelfkracht Scan
(repo happly-scan), de Volhoudkaart en Zetjes verbindt. Besluit, voormeting,
kaart, interventie van de partner, Zetjes dag 1 tot 66, hermeting. "Happly
volhouden inside": de partner zet een link in zijn programma, de trainer geeft
het kwartier, de rest loopt zonder hem.

- Het functioneel ontwerp staat in `docs/FO_Volhoudreis_digitaal.md`, de
  bouwbriefing in `docs/Bouwbriefing_Volhoudreis_faseA.md`. Daar staan de
  besluiten (één database: deze; voornaam en e-mail alleen in `reizen`;
  proactief zetje per mail op het zelf opgegeven moment; Zetjes loopt door na
  dag 66; de partner kiest de naam). Bouw niets wat daarvan afwijkt zonder het
  eerst te melden.
- Een groep is een invite met `is_reis = true`. Geen aparte tabel.
- `reizen` is de enige tabel met voornaam en e-mail. `sessions`,
  `session_messages` en `profiles` blijven anoniem op `anon_id`.
- **Het waarom gaat voor het wat (21 oktober 2026).** De Doelscan vraagt eerst
  waarom iemand dit wil (`profiles.goal_why`) en de Volhoudkaart begint met
  `kaarten.waarom`; Zetjes geeft dat letterlijk terug als de zin wegzakt.
  Migratie `migrations/2026-10-waarom.sql`, nog te draaien in Supabase.
- `kaarten` is de intake van Zetjes in een reis; de Doelscan staat in een reis
  uit (`scan_required = false`). Elke wijziging van de kaart is een nieuwe
  versie; Zetjes leest de hoogste.
- De begeleider ziet voortgang, nooit inhoud. Een route voor de begeleider
  selecteert niets uit `kaarten`, `sessions` of de scanvelden. Een test bewaakt
  dat zodra die route er is.
- De scan blijft op scan.happly.nl en meldt een meting aan `api/reis-scan.js`
  met het gedeelde geheim `REIS_SCAN_SECRET`.

Stand per stap (zie paragraaf 13 van de briefing):

- Stap 1, migraties: `migrations/2026-10-reis.sql` hier en
  `migratie-reis-2026-10-14.sql` in happly-scan. Geschreven en lokaal getest
  op 14 oktober 2026. Beide gedraaid in Supabase op 14 oktober 2026.
- Stap 2, de reis en de kaart: `api/_lib/reis.js` (gedeelde functies, mails),
  `api/reis-start.js` (GET groepsinfo, POST begin), `api/reis.js`,
  `api/reis-kaart.js`, `api/reis-groep.js` (beheer, x-admin-key),
  `public/reis-start.html`, `public/reis.html`, `public/reis.css`,
  `public/happly-logo.png`; nette adressen `/start/:token`, `/reis/:token`,
  `/groep/:token` in `vercel.json`. Tests: `node --test scripts/reis-test.js`
  met `scripts/nep-supabase.js` (database in het geheugen). Nog niet: de
  Zetjes-link uit de reis werkt pas na stap 4 (index.html leest dan `&a=`).
  Stap 1 en 2 staan op main en op productie sinds 14 oktober 2026.
- Stap 3, de brug met de scan: `api/reis-scan.js` hier (Bearer
  `REIS_SCAN_SECRET`); in happly-scan `api/scan.js` (leest `reis` en `meting`,
  meldt na de opslag aan `REIS_URL/api/reis-scan`), `api/lead.js` (reis telt
  als via coach: geen verkoop, geen opvolgreeks), `scan.html` (knop terug naar
  de reis, geen Sprint-blok en deelknop) en `index.html` (stuurt `?reis=` door
  naar de scanpagina). Omgevingsvariabelen: `REIS_SCAN_SECRET` in beide
  Vercel-projecten, `REIS_URL` in het scanproject. Beide gezet op 14 oktober
  2026. `api/reis-deelnemer.js` geeft de scanpagina voornaam, e-mail en doel.
- Stap 4, Zetjes op de kaart: `api/claude.js` zet het kaartblok
  (`kaartBlokTekst` in `api/_lib/reis.js`) in de systeemprompt, bij de
  verhelderingsvraag en het zetje; `api/validate.js` geeft `reis` terug
  (link, dag, programma, als-dan) en biedt in een reis nooit de Doelscan aan;
  `public/index.html` leest `&a=` uit de reislink, toont de dagteller en de
  link naar de reis; `api/verwijder.js` verwijdert ook de reis en de kaarten.
  Open punt: er is nog geen context voor bewegen; een fit20-groep draait op
  context `werk` en toont dus werkvoorbeelden. Dat is inhoudswerk in
  `api/_lib/contexts.js`.
- Stap 5, dagelijkse taken: `api/reis-taken.js` op de cron (vercel.json,
  06.10 UTC, Bearer `CRON_SECRET`): startdagmail op dag 1, hermetingmail op
  dag 66 (tot 72, eenmalig), het wekelijkse zetje per mail op de weekdag uit
  vak 1 (`proactief_laatst_at` bewaakt één per week; de cron draait eenmaal
  per dag, dus het zetje gaat 's ochtends en noemt het dagdeel).
  `api/reis-instellingen.js` zet signaal en wekelijks zetje aan of uit; de
  afmeldlink in de mail opent de reis op `#instellingen`.
- Stap 6, de begeleider: `api/reis-begeleider.js` en `public/begeleider.html`
  op `/groep/:begeleider_token`. Selecteert alleen voornaam, signaal_ok, stap
  en laatste_activiteit; de test leest de broncode na op verboden tabellen en
  kolommen. QR-code via api.qrserver.com (externe dienst; de groepslink is
  toch bedoeld om te delen).

## ikhoudvol.nl (sinds 16 oktober 2026)

De reeks Ik houd vol: gewone mensen, twintig seconden, vijf zinnen (wie, waarvoor, wat daarvoor, wanneer lastig, slotzin Ik houd vol; sinds 21 oktober 2026 staat het waarvoor voor het wat, want de reden draagt het volhouden). Statische site in `ikhoudvol/`, eigen Vercel-project met Root Directory `ikhoudvol`; de Zetjes-app serveert alleen `public` en ziet deze map niet. `ikhoudvol/opnemen.html` is de opneempagina: zinnen invullen, autocue onder de camera, kader voor hoofd en ogen (alleen op het scherm, gelijk aan de snit van de montage), opname blijft op de telefoon tot de deelnemer hem verstuurt. Vlak voor de opname maakt de pagina een startfoto (Lach maar); die gaat mee met de video en wordt in de montage het openingsbeeld en de omslag op de site (monteer.py --foto). Montage gebeurt buiten deze repository (monteer.py in het startpakket).

Open punt, afgesproken 16 oktober 2026: dezelfde opneempagina als stap in de Volhoudreis, direct na de kaart. De deelnemer spreekt zijn als-dan-plan hardop in en stuurt het naar een vriend of deelt het (openbare toezegging). Eerst ontwerpen en melden, dan bouwen.

## Werkregels

- Nederlands in code en commentaar. Geen gedachtestreepjes, geen uitroeptekens.
- Taal naar buiten: volhouden en volhouders; nooit afhakers, opgevers of
  stoppers als zelfstandig naamwoord; niet doorzetten; nooit cohort of streak.
- Geen inhoud van deelnemers in logs. Alleen labels en aantallen.
- Migraties zijn idempotent, verwijderen niets en eindigen met een
  controleregel die één rij teruggeeft.
- Sinds 30 oktober 2026 geeft Supabase nieuwe tabellen in `public` geen
  Data API-toegang meer vanzelf. Elke migratie die een tabel aanmaakt, geeft
  in dezelfde migratie `grant select, insert, update, delete on public.<tabel>
  to service_role;`. Niets aan `anon` of `authenticated`: de app praat alleen
  met de service-sleutel en de tabellen blijven dicht. Bestaande tabellen en
  nieuwe kolommen zijn niet geraakt.
- Testen lokaal: `scripts/` met node. Een migratie eerst afspelen op een lokale
  Postgres (schema plus alle eerdere migraties, dan de nieuwe twee keer).
