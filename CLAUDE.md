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

## Werkregels

- Nederlands in code en commentaar. Geen gedachtestreepjes, geen uitroeptekens.
- Taal naar buiten: volhouden en volhouders; nooit afhakers, opgevers of
  stoppers als zelfstandig naamwoord; niet doorzetten; nooit cohort of streak.
- Geen inhoud van deelnemers in logs. Alleen labels en aantallen.
- Migraties zijn idempotent, verwijderen niets en eindigen met een
  controleregel die één rij teruggeeft.
- Testen lokaal: `scripts/` met node. Een migratie eerst afspelen op een lokale
  Postgres (schema plus alle eerdere migraties, dan de nieuwe twee keer).
