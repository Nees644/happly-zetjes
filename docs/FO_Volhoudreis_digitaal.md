# Functioneel ontwerp: de digitale Volhoudreis

Versie 1, 14 oktober 2026. Ter akkoord voordat er gebouwd wordt.

## 0. Waar dit op bouwt

Dit ontwerp verbindt twee systemen die er al zijn. Het bouwt geen derde.

| Wat er al is | Waar | Wat het kan |
| --- | --- | --- |
| Zelfkracht Scan | scan.happly.nl (repo happly-scan, Supabase uqulkznqcqpbagbvtqdr) | Meting met e-mailadres, uitslagmail via Resend, opvolgreeks dag 0/3/7/56, hermeting per e-mailadres |
| Zetjes | app (repo happly-zetjes, Supabase ppdxgeatieoxsvoeruuy) | Tenants, uitnodigingslinks per tenant en context, Doelscan als intake (doel, wanneer, waar het lastig wordt), profielen op start, dag 30 en einde, zetjes op maat, hermeting met voortgangsvraag |

Het gat: de twee systemen kennen elkaar niet. De scan kent een e-mailadres, Zetjes kent een anonieme sleutel. De Volhoudkaart bestaat alleen op papier. De aanbieder ziet niets. Dit ontwerp dicht dat gat met één nieuw onderdeel, de reis, en laat de rest staan.

## 1. Uitgangspunten

1. **Eén reis per deelnemer.** De deelnemer doorloopt zes stappen in één omgeving, met één link. Hij hoeft nergens opnieuw in te loggen of over te typen.
2. **De trainer hoeft niets te doen** behalve het kwartier geven (of het filmpje laten zien) en zijn groep aanmaken. Geen printen, geen verzamelen, geen codes uitdelen.
3. **De aanbieder ziet voortgang, nooit inhoud.** Wie waar staat in de reis, ja. Wat iemand op zijn kaart schreef of aan Zetjes vroeg, nooit. Dat is al zo afgesproken voor Monter.
4. **White label vanaf dag één.** Elke aanbieder krijgt de reis in eigen naam en kleur, met "powered by Happly" klein onderaan. Dat is al mogelijk in Zetjes (tenant en context) en wordt doorgetrokken.
5. **Bouwen op wat er is.** De scan blijft de scan, Zetjes blijft Zetjes. De reis is een dunne laag erbovenop die de twee verbindt en de kaart toevoegt.
6. **Gezondheidsgegevens blijven in de EU** en de scheiding tussen signaal en inhoud blijft bestaan.

## 2. De rollen

| Rol | Wie | Wat hij ziet en doet |
| --- | --- | --- |
| Deelnemer | Iemand in een programma, training of met een eigen doel | Zijn eigen reis: zes stappen, waar hij staat, zijn kaart, Zetjes, zijn uitslagen |
| Begeleider | Trainer, coach, leefstijlcoach, studiomedewerker | Zijn groep: wie waar staat, zonder inhoud. Het kwartier. Signalen bij stilte |
| Aanbieder | Eigenaar of coördinator van de organisatie | Alle groepen, het gemeten verschil per groep, de licentie, de huisstijl |
| Happly | Maarten | Alle aanbieders, de effectdata geaggregeerd, nieuwe aanbieders aanmaken |

## 3. De reis in zes stappen, als schermen

Elke stap heeft een status: nog niet, bezig, klaar. De deelnemer ziet alle zes als een tijdlijn, met de datum erbij.

### Stap 1. Uitnodiging (het besluit)

- De begeleider maakt een groep aan: naam, startdatum van het programma, verwachte einddatum, context (werk, GLI, bewegen, rookvrij, eigen doel).
- De begeleider krijgt één groepslink of QR-code. Die deelt hij met de deelnemers, of hij voert e-mailadressen in en het systeem mailt de uitnodiging.
- De deelnemer opent de link, vult zijn e-mailadres in en geeft toestemming. Vanaf hier bestaat zijn reis. Hij krijgt een magische link per mail voor later; geen wachtwoord.

### Stap 2. Voormeting

- De Zelfkracht Scan, in de reis, in de huisstijl van de aanbieder. Dezelfde vragen als op scan.happly.nl.
- Direct erna: de persoonlijke uitslag (zien, sturen, doen; potentieel en valkuilen) en het filmpje van drie minuten: volhouden is geen karakter, dit zit in je programma, dit komt eraan.
- De uitslag gaat ook per mail, zoals nu.

### Stap 3. Volhoudkaart

- Vier vakken, dezelfde als op papier: mijn afhaakmoment en mijn zin; wat ik anders inricht; mijn als-dan-plan; mijn woorden. Plus het doel bovenaan, voorgevuld vanuit de context van de groep.
- Wordt ingevuld op de eigen telefoon, in de eerste bijeenkomst (tijdens het kwartier of de masterclass), of thuis als er geen bijeenkomst is. De stap staat open vanaf stap 2 en sluit niet.
- Vak 3 wordt direct de implementatie-intentie van Zetjes. Vak 1 en 4 worden de context waarmee Zetjes zijn zetjes op maat maakt. De Doelscan van Zetjes hoeft dan niet meer apart: doel, wanneer, waar het lastig wordt zitten al op de kaart.
- De deelnemer kan zijn kaart altijd inzien en aanpassen. Een papieren kaart blijft beschikbaar als print vanuit de reis, voor wie dat prettig vindt, maar is niet meer de weg.

### Stap 4. Interventie

- Niets van Happly. Op de tijdlijn staat de naam van het programma en de datum of periode, ingevuld door de begeleider.
- Loopt de interventie in sessies (fit20, GLI-bijeenkomsten), dan mag de begeleider aanwezigheid aanvinken. Dat is optioneel en geeft een signaal, zie stap 5.

### Stap 5. Zetjes, dag 1 tot en met 66

- Begint op de startdatum van de interventie. De deelnemer ziet de dagteller: dag 23 van 66.
- Zetjes zoals nu: op aanvraag van de deelnemer, met de kaart als vertrekpunt. Daarnaast, nieuw: één proactief zetje per week op het afhaakmoment uit vak 1, als de deelnemer dat bij stap 3 heeft aangezet.
- Dag 30: de korte tussenmeting van Zetjes (voortgang: ja, beetje, nee), zoals die er al is.
- Signalen naar de begeleider, met toestemming van de deelnemer en zonder inhoud: "geen activiteit in 10 dagen", "tussenmeting: nee". De begeleider ziet een stip, geen tekst.

### Stap 6. Hermeting

- Op dag 66, of op de einddatum van het programma als die later is: de Zelfkracht Scan opnieuw, per mail en in de reis.
- De deelnemer ziet zijn verschil: scan 1 naast scan 2, met de kaart ernaast.
- De aanbieder ziet het verschil per groep, geaggregeerd, met het aantal dat is doorgegaan en het aantal dat is gestopt.
- Daarna: de reis is af. De deelnemer houdt toegang tot zijn kaart en kan Zetjes voortzetten als personal (zelf betalen), of de aanbieder verlengt.

## 4. Het scherm van de begeleider

Eén pagina per groep.

| Onderdeel | Inhoud |
| --- | --- |
| Kop | Naam groep, context, startdatum, dag X van 66 |
| Tijdlijn | De zes stappen met per stap hoeveel deelnemers klaar zijn: scan 14 van 16, kaart 11 van 16 |
| Lijst | Per deelnemer: voornaam of e-mail (naar keuze van de aanbieder), per stap een vinkje of een lege cirkel, een stip bij een signaal |
| Signalen | De deelnemers met een signaal bovenaan, met alleen het soort signaal |
| Het kwartier | De tekst van het kwartier en de link naar het filmpje, om in de bijeenkomst te gebruiken |
| Uitnodigen | De groepslink, de QR-code, en een veld om e-mailadressen toe te voegen |

Wat de begeleider nooit ziet: scanantwoorden, scanscores per persoon, de kaart, de zetjes.

Wat de aanbieder op zijn niveau wel ziet: de gemiddelde score van een groep bij voormeting en hermeting (geaggregeerd, minimaal vijf deelnemers, dezelfde regel als bij Teamkracht).

## 5. White label

| Instelling per aanbieder | Waar zichtbaar |
| --- | --- |
| Naam en logo | Kop van elk scherm, afzender van elke mail |
| Hoofdkleur | Knoppen en accenten |
| Naam van het programma | Stap 4 op de tijdlijn |
| Eigen domein (later) | volhouden.aanbieder.nl in plaats van reis.happly.nl |
| Powered by Happly | Klein onderaan, altijd, niet uit te zetten |

Zetjes heeft dit al per tenant. De reis neemt dezelfde instellingen over.

## 6. Gegevens

Eén nieuw begrip, de reis, verbindt wat er is.

| Tabel | Nieuw of bestaand | Wat erin staat |
| --- | --- | --- |
| aanbieders | bestaand (tenants in Zetjes) | Naam, slug, huisstijl, licentie |
| groepen | nieuw | Aanbieder, naam, context, startdatum, einddatum, begeleider, groepslink |
| reizen | nieuw | Deelnemer (e-mailadres, versleuteld), groep, status per stap met datum, toestemmingen, sleutel naar de scanmeting(en), sleutel naar het Zetjes-profiel (de anonieme sleutel) |
| kaarten | nieuw | Reis, de vier vakken, doel, datum, aangepast op |
| index_scan_results | bestaand (scan) | Krijgt een kolom reis_id |
| profiles, sessions | bestaand (Zetjes) | Ongewijzigd; user_key wordt aangemaakt vanuit de reis |
| signalen | nieuw | Reis, soort, datum, gezien door begeleider op |

De scheiding tussen identiteit en inhoud blijft: de reis kent het e-mailadres en de anonieme sleutel; Zetjes kent alleen de anonieme sleutel; de kaart hangt aan de reis en gaat als tekst naar Zetjes zonder e-mailadres.

**Twee databases of één.** Scan en Zetjes draaien nu in twee Supabase-projecten. De reis moet in één van beide, of in een derde. Mijn voorkeur: in het Zetjes-project, omdat daar de tenants, contexten en profielen al staan, en de scan via een beveiligde route zijn meting en uitslag levert. Dat voorkomt dat gezondheidsgegevens uit de scan naar een tweede plek verhuizen.

## 7. Mails

Alle mails in naam van de aanbieder, verstuurd door Happly via Resend.

| Moment | Mail |
| --- | --- |
| Uitnodiging | "Je begint binnenkort met [programma]. Regel eerst volhouden: doe de scan (8 minuten)." |
| Na de scan | Uitslag, het filmpje, en: "Je kaart vul je in bij de eerste bijeenkomst. Of nu, als je wilt." |
| Startdag interventie | "Vandaag begint het. Je Zetjes staan klaar." Met de magische link |
| Dag 30 | Tussenmeting |
| Signaal (alleen deelnemer) | Na 10 dagen stilte: één zetje in de eigen woorden uit vak 4. Geen "we missen je" |
| Dag 66 | Hermeting |
| Na de hermeting | Het verschil, en wat de deelnemer kan kiezen |

## 8. Wat de deelnemer mag

- Zijn kaart inzien, aanpassen en printen.
- Zijn eigen scanuitslagen inzien.
- Per toestemming aan- of uitzetten: proactief zetje op het afhaakmoment; signaal zonder inhoud naar de begeleider.
- Zijn reis en alle gegevens verwijderen, in één klik. Zetjes heeft dat al; de reis volgt.

## 9. Wat dit kost om te bouwen

Realistisch, voor jouw manier van werken (bouwen via Claude in de bestaande repo's, deployen via Vercel, jij test en keurt).

| Fase | Wat | Omvang |
| --- | --- | --- |
| A. Verbinding | Reis, groepen, kaart als tabellen; groepslink; kaart als scherm; kaart als vertrekpunt van Zetjes in plaats van de Doelscan; scanuitslag gekoppeld aan de reis | 2 tot 3 weken |
| B. Begeleider | Groepsscherm met tijdlijn en stippen; signalen; het kwartier en het filmpje in het scherm | 1 tot 2 weken |
| C. Mails en hermeting | De zeven mails; dag 66 hermeting in de reis; het verschil-scherm | 1 week |
| D. White label | Huisstijl per aanbieder op reis en mails; eigen domein | 1 week |
| Buiten de bouw | Het filmpje van drie minuten (opnemen), de teksten, de DPIA bijwerken voor de reis | Jouw tijd |

Vijf tot zeven weken, in stappen die elk apart live kunnen. Fase A is genoeg voor de pilot met Monter en fit20: daarna zijn kaart en Zetjes al verbonden en de begeleider werkt nog met een eenvoudige lijst.

## 10. Wat ik zou laten liggen voor na de pilot

- Eigen domein per aanbieder.
- Aanwezigheid aanvinken bij stap 4.
- Koppeling met het systeem van de aanbieder (Monter, Zoho): eerst handmatig e-mailadressen, de koppeling pas als een partner het vraagt.
- Een app in de winkels: de reis is een webpagina op de telefoon, net als Zetjes nu.

## 11. Open vragen voor jou

1. **Eén database of twee.** Mijn voorkeur is de reis in het Zetjes-project. Akkoord, of wil je de scan leidend houden?
2. **Voornaam of e-mail in het begeleidersscherm.** Voornaam is menselijker, e-mail is minder gegevens. Mijn voorstel: de aanbieder kiest, standaard voornaam.
3. **Het proactieve zetje op het afhaakmoment.** Dit is nieuw ten opzichte van Zetjes nu (alleen op aanvraag). Het past bij wat je op 1 oktober vastlegde (proactief zodra risicomomenten bekend zijn), maar het is een keuze: aan, met toestemming, of nog niet.
4. **Zetjes personal na dag 66.** Standaard aanbieden, of alleen als de aanbieder dat wil?
5. **De naam.** Intern "de reis". Naar buiten: "Volhoudreis", "Mijn volhoudplan", of de naam van de aanbieder met "powered by Happly". Mijn voorkeur: naar buiten geen eigen naam; het is het programma van de aanbieder.

Na je antwoord op 1 en 3 werk ik fase A uit tot een bouwbriefing die direct te bouwen is.
