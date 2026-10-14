// api/reis-start.js
// POST /api/reis-start { inviteToken, voornaam, email, toestemming, signaalOk, proactiefOk }
// Begin van een reis via de groepslink. Maakt het anonieme id en de
// toestemming aan (user_profiles), de reis zelf, en stuurt de magische link.
// Bestaat het adres al in deze groep: stuurt alleen de link opnieuw.
// GET /api/reis-start?invite=<token> geeft alleen de naam van programma en
// aanbieder, voor het startscherm. Niets anders.

const { supabase } = require('./_lib/supabase');
const { cors, loadInvite, newAnonId } = require('./_lib/access');
const { emailHash, geldigEmail, schoon, mailMagischeLink, laadReis, log, weergave } = require('./_lib/reis');

async function groepInfo(req, res) {
  const invite = await loadInvite(req.query?.invite);
  if (!invite || !invite.is_reis) return res.status(404).json({ error: 'onbekend' });
  const w = weergave(invite);
  const verlopen = invite.expires_at && Date.parse(invite.expires_at) <= Date.now();
  if (!invite.active || verlopen) {
    return res.status(403).json({ error: verlopen ? 'verlopen' : 'inactief', contactEmail: invite.tenants?.contact_email || null });
  }
  return res.status(200).json({ ok: true, programma: w.programma, aanbieder: w.aanbieder });
}

module.exports = async function handler(req, res) {
  cors(res, req, { methods: 'GET, POST, OPTIONS' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    try { return await groepInfo(req, res); } catch (err) { console.error('reis-start info', err.message); return res.status(500).json({ error: 'fout' }); }
  }
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const voornaam = schoon(body.voornaam, 60);
  if (!geldigEmail(email)) return res.status(400).json({ error: 'Vul een geldig e-mailadres in' });
  if (!body.toestemming) return res.status(400).json({ error: 'Zonder toestemming kunnen we je reis niet bewaren' });

  try {
    const invite = await loadInvite(body.inviteToken);
    if (!invite || !invite.is_reis) return res.status(404).json({ error: 'onbekend' });
    const contactEmail = invite.tenants?.contact_email || null;
    if (!invite.active) return res.status(403).json({ error: 'inactief', contactEmail });
    if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) {
      return res.status(403).json({ error: 'verlopen', contactEmail });
    }

    const hash = emailHash(email);
    const { data: bestaand } = await supabase
      .from('reizen').select('token').eq('invite_id', invite.id).eq('email_hash', hash).maybeSingle();
    if (bestaand) {
      const reis = await laadReis(bestaand.token);
      await mailMagischeLink(reis);
      await log('magische_link_opnieuw', reis);
      return res.status(200).json({ ok: true, bestaand: true });
    }

    if (invite.max_uses != null) {
      const { count } = await supabase
        .from('reizen').select('id', { count: 'exact', head: true }).eq('invite_id', invite.id);
      if ((count || 0) >= invite.max_uses) return res.status(403).json({ error: 'vol', contactEmail });
    }

    // Het anonieme id dat Zetjes kent, met toestemming: die is zojuist gegeven.
    const anonId = newAnonId();
    const nu = new Date().toISOString();
    const { error: pErr } = await supabase
      .from('user_profiles').insert({ anon_id: anonId, invite_id: invite.id, consent_at: nu });
    if (pErr) throw pErr;

    const { data: nieuw, error: rErr } = await supabase.from('reizen').insert({
      invite_id: invite.id,
      anon_id: anonId,
      voornaam,
      email,
      email_hash: hash,
      toestemming_at: nu,
      signaal_ok: !!body.signaalOk,
      proactief_ok: !!body.proactiefOk,
      stap: 2,
      laatste_activiteit: nu,
    }).select('token').single();
    if (rErr) throw rErr;

    const reis = await laadReis(nieuw.token);
    await log('reis_gestart', reis);
    try {
      await mailMagischeLink(reis);
      await log('magische_link_verstuurd', reis);
    } catch (err) {
      // De reis bestaat; de link kan opnieuw worden gevraagd met hetzelfde adres.
      console.error('reis-start mail', err.message);
      return res.status(200).json({ ok: true, mailFout: true });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reis-start', err.message);
    return res.status(500).json({ error: 'fout' });
  }
};
