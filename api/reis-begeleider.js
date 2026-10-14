// api/reis-begeleider.js
// GET /api/reis-begeleider?token=<begeleider_token>
// De lijst van de begeleider: per deelnemer de stap, de dag en hoe lang
// geleden de laatste activiteit was. Voortgang, nooit inhoud.
//
// Harde regel (CLAUDE.md): deze route selecteert niets uit kaarten, sessions,
// session_messages of de scanvelden (scan_start, scan_eind). Een test leest
// dit bestand na en valt om zodra zo'n kolom of tabel hier verschijnt.
// Zonder signaal_ok ziet de begeleider alleen de stap: geen voornaam, geen kleur.

const { supabase } = require('./_lib/supabase');
const { cors, todayNL } = require('./_lib/access');
const { dagInReis, DAGEN, weergave, appUrl } = require('./_lib/reis');

const BEGELEIDER_TOKEN_RE = /^[0-9a-f]{32}$/;

// Kleur op basis van dagen sinds de laatste activiteit: groen tot 7, grijs tot 10, oranje erna.
function kleur(laatste) {
  if (!laatste) return 'grijs';
  const dagen = (Date.parse(todayNL()) - Date.parse(laatste.slice(0, 10))) / 86400000;
  if (dagen <= 7) return 'groen';
  if (dagen <= 10) return 'grijs';
  return 'oranje';
}

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'GET, OPTIONS' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const token = String(req.query?.token || '');
  if (!BEGELEIDER_TOKEN_RE.test(token)) return res.status(404).json({ error: 'onbekend' });

  try {
    const { data: inv } = await supabase
      .from('invites')
      .select('id, token, active, context, label, programma_naam, start_date, interventie_start, expires_at, is_reis, max_uses, tenants(name)')
      .eq('begeleider_token', token).maybeSingle();
    if (!inv || !inv.is_reis) return res.status(404).json({ error: 'onbekend' });

    const { data: reizen } = await supabase
      .from('reizen')
      .select('id, voornaam, signaal_ok, stap, laatste_activiteit, created_at')
      .eq('invite_id', inv.id)
      .order('created_at', { ascending: true });

    const dag = dagInReis(inv);
    const w = weergave(inv);
    const lijst = (reizen || []).map((r, i) => ({
      nummer: i + 1,
      voornaam: r.signaal_ok ? (r.voornaam || 'deelnemer') : 'deelnemer',
      stap: r.stap,
      kleur: r.signaal_ok ? kleur(r.laatste_activiteit) : null,
      signaal: !!r.signaal_ok,
    }));

    const telling = {
      deelnemers: lijst.length,
      scan: lijst.filter((r) => r.stap >= 3).length,
      kaart: lijst.filter((r) => r.stap >= 4).length,
      zetjes: lijst.filter((r) => r.stap >= 5).length,
      hermeting: lijst.filter((r) => r.stap >= 7).length,
      stil: lijst.filter((r) => r.kleur === 'oranje').length,
    };

    return res.status(200).json({
      ok: true,
      programma: w.programma,
      aanbieder: w.aanbieder,
      actief: !!inv.active && !(inv.expires_at && Date.parse(inv.expires_at) <= Date.now()),
      start: inv.interventie_start || inv.start_date,
      dag, dagen: DAGEN,
      maxDeelnemers: inv.max_uses,
      groepslink: `${appUrl()}/start/${inv.token}`,
      telling,
      deelnemers: lijst,
    });
  } catch (err) {
    console.error('reis-begeleider', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
