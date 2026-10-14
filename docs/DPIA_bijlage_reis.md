# DPIA-bijlage: de Volhoudreis

Aanvulling op de DPIA van Zetjes. Versie 1, 14 oktober 2026.

## 1. Nieuwe verwerking

De Volhoudreis verbindt drie bestaande verwerkingen (Zelfkracht Scan, Zetjes, de groepslink van een aanbieder) met één nieuw gegevensobject: de reis. De reis is de enige plek waar een deelnemer herkenbaar is.

| Gegeven | Tabel | Doel | Grondslag |
| --- | --- | --- | --- |
| Voornaam, e-mailadres (plus hash van het adres) | reizen | Toegang via magische link; mails van de reis (toegangslink, startdag, dag 66, wekelijks zetje); dubbele aanmelding voorkomen | Toestemming, bij de start uitdrukkelijk gegeven |
| Toestemmingsmoment, keuze signaal, keuze wekelijks zetje | reizen | Vastleggen en uitvoeren van de keuzes van de deelnemer | Toestemming |
| De vier getallen van de scan (index, zien, sturen, doen) bij start en einde, plus het id van de meting in het scanproject | reizen | De deelnemer zijn verschil tonen | Toestemming |
| Stap en laatste activiteit | reizen | Voortgang voor de deelnemer en, bij toestemming, voor de begeleider | Toestemming |
| De Volhoudkaart, vier vakken en doel, per versie | kaarten | Intake van Zetjes; het wekelijkse zetje; de deelnemer zijn kaart laten inzien, wijzigen en printen | Toestemming |
| Anonieme sleutel (anon_id) | reizen, user_profiles | Koppeling van de reis aan de anonieme Zetjes-sessies | Toestemming |
| Gebeurtenissen (reis gestart, scan, kaart, mails verstuurd) | funnel_events | Idempotentie van mails; aantallen voor de aanbieder | Gerechtvaardigd belang (werking van de dienst) |

De scan bewaart in zijn eigen project de reistoken bij de meting (kolom reis_token), zodat een meting aan een reis toe te wijzen is. De token is geen persoonsgegeven op zichzelf; in combinatie met de reis is de meting herleidbaar. Bij verwijdering van de reis vervalt die koppeling.

## 2. Scheiding van identiteit en inhoud

- De reis kent voornaam en e-mail. Zetjes (sessions, session_messages, profiles) kent alleen de anonieme sleutel. Die scheiding bestond al en blijft.
- De kaart hangt aan de reis. Zetjes ontvangt de kaarttekst in de systeemprompt, zonder voornaam en zonder e-mailadres, behalve de voornaam voor de aanspreekvorm.
- De begeleider (route api/reis-begeleider.js) selecteert uitsluitend voornaam, signaal_ok, stap en laatste_activiteit. Een geautomatiseerde test leest de broncode na en faalt zodra een verboden tabel of kolom (kaarten, sessions, session_messages, scan_start, scan_eind, vak-velden, doel, e-mail) in die route verschijnt.
- Zonder signaal_ok krijgt de begeleider geen voornaam en geen activiteitskleur, alleen de stap.

## 3. Verwerkers en doorgifte

Ongewijzigd ten opzichte van de DPIA van Zetjes: Supabase (opslag, EU), Vercel (hosting, EU-regio fra1), Resend (mail), de aanbieder van het taalmodel. Nieuw: de QR-code op de begeleiderspagina wordt gemaakt door api.qrserver.com; daarbij wordt alleen de groepslink doorgegeven, die bedoeld is om te delen. Geen persoonsgegevens.

## 4. Bewaartermijnen

Reisgegevens: tot 12 maanden na het einde van de reis (dag 66 of de einddatum van de groep), tenzij de deelnemer eerder verwijdert. Verwijderen gebeurt direct via Zetjes (Mijn gegevens) en omvat reis, kaarten, sessies, berichten, profielen en gebeurtenissen. De scanmeting blijft anoniem bewaard voor de landelijke cijfers; de reistoken op de meting wordt bij verwijdering leeggemaakt (route in het scanproject, nog te bouwen in fase B; tot die tijd handmatig op verzoek).

## 5. Risico's en maatregelen

| Risico | Maatregel |
| --- | --- |
| Begeleider leest inhoud | Technisch onmogelijk gemaakt in de route; test op de broncode; geen inhoud in de lijst, ook niet bij één deelnemer |
| Magische link lekt (doorgestuurde mail) | De link geeft toegang tot de eigen reis. Geen wachtwoord, dus wie de mail heeft, heeft de reis. Maatregel: de deelnemer kan verwijderen; in fase B: link opnieuw uitgeven en oude ongeldig maken |
| Reistoken in de scanlink zichtbaar in browsergeschiedenis | Token geeft alleen de koppeling, geen gegevens; de scanpagina haalt voornaam en e-mail op met die token, dus de token is vertrouwelijk voor de deelnemer. Zelfde niveau als de magische link |
| Wekelijkse mail met kaartinhoud | Alleen aan het eigen adres, alleen na uitdrukkelijk aanzetten, uit te zetten met één klik in elke mail |
| Dubbele gegevens tussen scanproject en reis | Alleen de vier getallen staan in de reis; de volledige meting blijft in het scanproject |

## 6. Rechten van de deelnemer

Inzage: de reis zelf toont alles wat van hem is vastgelegd. Correctie: kaart en instellingen zijn zelf te wijzigen; voornaam en e-mail via hallo@happly.nl. Verwijdering: zelf, direct. Bezwaar tegen het signaal naar de begeleider: zelf, in de instellingen.
