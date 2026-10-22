// api/reis.js
// GET /api/reis?token=<reistoken>
// De reis van één deelnemer: stand per stap, dagteller, kaart (hoogste versie),
// de links naar scan en Zetjes, en de naam van programma en aanbieder.
// Alleen de eigen reis: de token is de sleutel. Nooit gegevens van anderen.

const { supabase } = require('./_lib/supabase');
const { cors } = require('./_lib/access');
const { laadReis, laadKaart, standVanStappen, werkStapBij, weergave, scanLink, zetjesLink, appUrl, tempoTekst } = require('./_lib/reis');

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'GET, OPTIONS' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const reis = await laadReis(req.query?.token);
    if (!reis) return res.status(404).json({ error: 'onbekend' });
    const inv = reis.invites;
    if (!inv?.active) return res.status(403).json({ error: 'inactief', contactEmail: inv?.tenants?.contact_email || null });

    const kaart = await laadKaart(reis.id);
    const stand = standVanStappen(reis, kaart);
    await werkStapBij(reis, kaart);
    await supabase.from('reizen').update({ laatste_activiteit: new Date().toISOString() }).eq('id', reis.id);

    const w = weergave(inv);
    return res.status(200).json({
      ok: true,
      voornaam: reis.voornaam,
      programma: w.programma,
      aanbieder: w.aanbieder,
      context: inv.context,
      signaalOk: reis.signaal_ok,
      proactiefOk: reis.proactief_ok,
      dag: stand.dag,
      dagen: stand.dagen,
      huidig: stand.huidig,
      stappen: stand.stappen,
      // De boodschap over het tempo: na de kaart, tot en met de eerste week.
      tempo: kaart && stand.huidig >= 4 && (stand.dag == null || stand.dag <= 7) ? tempoTekst(reis, kaart) : null,
      kaart: kaart ? {
        doel: kaart.doel, vak1_moment: kaart.vak1_moment, vak1_weekdag: kaart.vak1_weekdag,
        vak1_dagdeel: kaart.vak1_dagdeel, vak1_zin: kaart.vak1_zin, vak2_inrichting: kaart.vak2_inrichting,
        vak3_als: kaart.vak3_als, vak3_dan: kaart.vak3_dan, vak4_woorden: kaart.vak4_woorden,
        versie: kaart.versie, datum: kaart.created_at,
      } : null,
      links: {
        scanStart: scanLink(reis, 'start'),
        scanEind: scanLink(reis, 'eind'),
        zetjes: zetjesLink(reis),
        koop: `${appUrl()}/koop.html`,
      },
    });
  } catch (err) {
    console.error('reis', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
