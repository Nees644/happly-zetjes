// scripts/nep-supabase.js
// Een Supabase in het geheugen voor tests zonder database. Kent alleen wat de
// routes gebruiken: from, select (met één niveau relatie "tabel(kolommen)"),
// eq, is, not, gte, lte, order, limit, maybeSingle, single, insert, update,
// delete en de telling met head: true. Geen SQL, geen RLS.
//
// Gebruik: const { installeer } = require('./nep-supabase');
//          const db = installeer();  // vervangt api/_lib/supabase voor alle requires erna
//          db.tabel('tenants').push({...});

const path = require('path');
const crypto = require('crypto');

function installeer(data = {}) {
  const tabellen = {};
  const tabel = (naam) => (tabellen[naam] = tabellen[naam] || (data[naam] ? [...data[naam]] : []));

  // Relaties zoals de routes ze gebruiken: kindtabel -> (kolom, oudertabel)
  const RELATIES = {
    invites: { tenants: ['tenant_id', 'tenants'], products: ['product_id', 'products'] },
    reizen: { invites: ['invite_id', 'invites'] },
  };

  // Haalt "rel(kolommen)" uit een select, met geneste haakjes.
  function relaties(select) {
    const uit = [];
    const re = /([a-z_]+)\(/g;
    let m;
    while ((m = re.exec(select || ''))) {
      let diepte = 1, i = re.lastIndex;
      while (i < select.length && diepte > 0) { if (select[i] === '(') diepte++; else if (select[i] === ')') diepte--; i++; }
      uit.push([m[1], select.slice(re.lastIndex, i - 1)]);
      re.lastIndex = i;
    }
    return uit;
  }

  // Alleen de gevraagde kolommen, net als PostgREST: een kolom die niet in
  // de select staat, bestaat niet in het antwoord.
  function projecteer(rij, select) {
    if (!select || select.trim() === '*') return { ...rij };
    const zonderRelaties = select.replace(/[a-z_]+\([^]*?\)(?=\s*,|\s*$)/g, '');
    const kolommen = zonderRelaties.split(',').map((k) => k.trim()).filter(Boolean);
    if (kolommen.includes('*')) return { ...rij };
    const uit = {};
    for (const k of kolommen) uit[k] = rij[k];
    return uit;
  }

  function verrijk(naam, rij, select) {
    if (!rij) return rij;
    const uit = projecteer(rij, select);
    for (const [rel, kolommen] of relaties(select)) {
      const def = (RELATIES[naam] || {})[rel];
      if (!def) continue;
      const ouder = tabel(def[1]).find((r) => r.id === rij[def[0]]) || null;
      uit[rel] = ouder ? verrijk(def[1], ouder, kolommen) : null;
    }
    return uit;
  }

  function bouwer(naam) {
    const q = { filters: [], select: '*', orde: null, limiet: null, soort: 'select', payload: null, head: false, count: false };
    const b = {
      select(s, opts) { if (q.soort === 'select') q.select = s || '*'; q.head = !!opts?.head; q.count = !!opts?.count; return b; },
      insert(p) { q.soort = 'insert'; q.payload = p; return b; },
      update(p) { q.soort = 'update'; q.payload = p; return b; },
      upsert(p) { q.soort = 'upsert'; q.payload = p; return b; },
      delete() { q.soort = 'delete'; return b; },
      eq(k, v) { q.filters.push((r) => r[k] === v); return b; },
      is(k, v) { q.filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
      not(k, op, v) { q.filters.push((r) => !(v === null ? r[k] == null : r[k] === v)); return b; },
      gte(k, v) { q.filters.push((r) => r[k] >= v); return b; },
      lte(k, v) { q.filters.push((r) => r[k] <= v); return b; },
      gt(k, v) { q.filters.push((r) => r[k] > v); return b; },
      lt(k, v) { q.filters.push((r) => r[k] < v); return b; },
      in(k, vs) { q.filters.push((r) => vs.includes(r[k])); return b; },
      order(k, o) { q.orde = [k, o?.ascending !== false]; return b; },
      limit(n) { q.limiet = n; return b; },
      maybeSingle() { return klaar().then((r) => ({ ...r, data: r.data?.[0] ?? null })); },
      single() {
        return klaar().then((r) => (r.data?.length === 1 ? { ...r, data: r.data[0] } : { data: null, error: { message: `single: ${r.data?.length ?? 0} rijen` } }));
      },
      then(res, rej) { return klaar().then(res, rej); },
    };
    function klaar() {
      return new Promise((res) => {
        try { res(uitvoer()); } catch (e) { res({ data: null, error: { message: e.message } }); }
      });
    }
    function rijen() {
      let rs = tabel(naam).filter((r) => q.filters.every((f) => f(r)));
      if (q.orde) { const [k, asc] = q.orde; rs = [...rs].sort((a, c) => (a[k] > c[k] ? 1 : a[k] < c[k] ? -1 : 0) * (asc ? 1 : -1)); }
      if (q.limiet != null) rs = rs.slice(0, q.limiet);
      return rs;
    }
    function uitvoer() {
      if (q.soort === 'insert' || q.soort === 'upsert') {
        const lijst = Array.isArray(q.payload) ? q.payload : [q.payload];
        const nieuw = lijst.map((p) => {
          const rij = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p };
          if (naam === 'reizen' && !rij.token) rij.token = crypto.randomBytes(16).toString('hex');
          if (naam === 'invites' && !rij.token) rij.token = crypto.randomUUID();
          if (naam === 'invites' && rij.active === undefined) rij.active = true;   // databasestandaard
          if (naam === 'invites' && !rij.begeleider_token) rij.begeleider_token = crypto.randomBytes(16).toString('hex');
          if (naam === 'reizen') {
            const dubbel = tabel(naam).find((r) => r.invite_id === rij.invite_id && r.email_hash === rij.email_hash);
            if (dubbel) throw new Error('duplicate key value violates unique constraint "reizen_invite_id_email_hash_key"');
          }
          tabel(naam).push(rij);
          return rij;
        });
        return { data: nieuw.map((r) => verrijk(naam, r, q.select)), error: null };
      }
      if (q.soort === 'update') {
        const rs = rijen();
        rs.forEach((r) => Object.assign(r, q.payload));
        return { data: rs.map((r) => verrijk(naam, r, q.select)), error: null };
      }
      if (q.soort === 'delete') {
        const rs = rijen();
        tabellen[naam] = tabel(naam).filter((r) => !rs.includes(r));
        return { data: rs, error: null };
      }
      const rs = rijen();
      if (q.head) return { data: null, count: rs.length, error: null };
      return { data: rs.map((r) => verrijk(naam, r, q.select)), count: q.count ? rs.length : null, error: null };
    }
    return b;
  }

  const supabase = { from: bouwer };
  const modulePad = path.join(__dirname, '..', 'api', '_lib', 'supabase.js');
  require.cache[require.resolve(modulePad)] = { id: modulePad, filename: modulePad, loaded: true, exports: { supabase } };
  return { supabase, tabel, tabellen };
}

module.exports = { installeer };
