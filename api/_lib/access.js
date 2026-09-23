// api/_lib/access.js
// Toegang: invite (token uit de link) + anoniem gebruikers-id (anonId).
//
// Twee soorten links:
// - Oude persoonlijke links: het anonId staat op de invite zelf (invites.anon_id)
//   en max_uses is leeg. Iedereen met die link is dezelfde gebruiker, zoals altijd.
// - Nieuwe links (groep of personal): elk toestel krijgt bij het eerste bezoek een
//   eigen anonId, bewaard in de browser en in user_profiles. max_uses telt die.

const crypto = require('crypto');
const { supabase } = require('./supabase');
const { getContext, phaseFor } = require('./contexts');

const ANON_RE = /^anon_[a-f0-9]{16,32}$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function newAnonId() {
  return 'anon_' + crypto.randomBytes(12).toString('hex');
}

// Vandaag in Nederland, als YYYY-MM-DD
function todayNL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

function weekSinceStart(startDate) {
  if (!startDate) return null;
  const days = Math.floor((Date.parse(todayNL()) - Date.parse(startDate)) / 86400000);
  return Math.max(0, Math.floor(days / 7));
}

class AccessError extends Error {
  constructor(status, reason, extra = {}) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.extra = extra;
  }
}

async function loadInvite(token) {
  if (!token || typeof token !== 'string') return null;
  const { data } = await supabase
    .from('invites')
    .select('id, tenant_id, product_id, anon_id, active, context, label, start_date, expires_at, max_uses, tenants(name, type, contact_email), products(slug, name)')
    .eq('token', token)
    .maybeSingle();
  return data || null;
}

// register=true alleen vanuit /api/validate: mag een nieuw toestel aanmelden.
async function resolveAccess({ token, anonId, register = false }) {
  const invite = await loadInvite(token);
  if (!invite) throw new AccessError(404, 'onbekend');

  const contactEmail = invite.tenants?.contact_email || null;
  const organisatie = invite.tenants?.name || null;
  if (!invite.active) throw new AccessError(403, 'inactief', { contactEmail, organisatie });
  if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) {
    throw new AccessError(403, 'verlopen', { contactEmail, organisatie });
  }

  const legacy = !!invite.anon_id && invite.max_uses == null;
  let profile = null;
  let id = null;

  if (legacy) {
    id = invite.anon_id;
    const { data } = await supabase.from('user_profiles').select('*').eq('anon_id', id).maybeSingle();
    profile = data;
    if (!profile) {
      if (!register) throw new AccessError(401, 'onbekende_gebruiker');
      const { data: created, error } = await supabase
        .from('user_profiles').upsert({ anon_id: id, invite_id: invite.id }, { onConflict: 'anon_id' })
        .select('*').single();
      if (error) throw error;
      profile = created;
    }
  } else {
    if (anonId && ANON_RE.test(anonId)) {
      const { data } = await supabase
        .from('user_profiles').select('*')
        .eq('anon_id', anonId).eq('invite_id', invite.id).maybeSingle();
      if (data) { profile = data; id = anonId; }
    }
    if (!profile) {
      if (!register) throw new AccessError(401, 'onbekende_gebruiker');
      if (invite.max_uses != null) {
        const { count } = await supabase
          .from('user_profiles').select('anon_id', { count: 'exact', head: true })
          .eq('invite_id', invite.id);
        if ((count || 0) >= invite.max_uses) throw new AccessError(403, 'vol', { contactEmail, organisatie });
      }
      id = newAnonId();
      const { data: created, error } = await supabase
        .from('user_profiles').insert({ anon_id: id, invite_id: invite.id })
        .select('*').single();
      if (error) throw error;
      profile = created;
    }
  }

  const ctx = getContext(invite.context);
  const week = ctx.faseweter ? weekSinceStart(invite.start_date) : null;

  return {
    invite,
    anonId: id,
    profile,
    ctx,
    legacy,
    weekSinceStart: week,
    phase: ctx.faseweter ? phaseFor(week) : null,
  };
}

// Stuurt de juiste foutrespons; geeft true terug als het een toegangsfout was.
function sendAccessError(res, err) {
  if (!(err instanceof AccessError)) return false;
  res.status(err.status).json({ valid: false, reason: err.reason, ...err.extra });
  return true;
}

module.exports = { cors, resolveAccess, sendAccessError, AccessError, weekSinceStart, todayNL };
