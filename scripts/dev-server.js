// scripts/dev-server.js
// Lokale server die Vercel nabootst: public/ als statische site, /api/<naam> naar api/<naam>.js.
// Start: node scripts/dev-server.js  (leest sleutels uit lokaal.env)

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
process.chdir(root);
const envFile = path.join(root, 'lokaal.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2]) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.argv[3] || process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

function withHelpers(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => { res.end(body); return res; };
  return res;
}

http.createServer(async (req, res) => {
  withHelpers(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9/_-]/gi, '').replace(/\.\.+/g, '');
    const file = path.join(root, 'api', `${name}.js`);
    if (name.split('/').some((p) => p.startsWith('_')) || !fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = Object.fromEntries(url.searchParams);
    try {
      const mod = await import(require('url').pathToFileURL(file).href);
      await (mod.default?.default || mod.default)(req, res);
    } catch (err) {
      console.error(err);
      if (!res.writableEnded) res.status(500).json({ error: err.message });
    }
    return;
  }

  let file = path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, 'public', 'index.html');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Zetjes lokaal op http://localhost:${PORT}`));
