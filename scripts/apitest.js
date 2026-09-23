// scripts/apitest.js
// Roept de API-handlers direct aan (zonder server), tegen de echte database en Claude.
// Start: node scripts/apitest.js <token> [situatie]

const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', 'lokaal.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] = m[2];
}

function call(name, body) {
  const handler = require(`../api/${name}.js`);
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, ...o }); return this; },
      end() { resolve({ status: this.statusCode }); return this; },
    };
    handler({ method: 'POST', body }, res);
  });
}

module.exports = { call };

if (require.main === module) {
  (async () => {
    const [token, situatie = 'Ik stel een lastig gesprek met mijn leidinggevende steeds uit.', antwoord] = process.argv.slice(2);
    let v = await call('validate', { token });
    console.log('validate', JSON.stringify({ ...v, ui: undefined }));
    if (!v.valid) return;
    const anonId = v.anonId;
    if (!v.consent) console.log('consent', JSON.stringify(await call('consent', { token, anonId })));
    const c = await call('claude', { token, anonId, phase: 'clarify', userMsg: situatie });
    console.log('clarify', JSON.stringify(c));
    if (c.off_topic) return;
    const z = await call('claude', { token, anonId, phase: 'zetje', sessionId: c.sessionId, clarifyAnswer: antwoord || c.opties?.[0] });
    console.log('zetje', JSON.stringify(z));
    console.log('feedback', JSON.stringify(await call('session', { token, anonId, sessionId: z.sessionId, phase: 'feedback', data: { feedback: 'ja' } })));
  })().catch((e) => { console.error(e); process.exit(1); });
}
