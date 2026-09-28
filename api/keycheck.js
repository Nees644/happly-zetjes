// TIJDELIJK: controleert of MOLLIE_API_KEY en RESEND_API_KEY aanwezig zijn.
const crypto = require('crypto');
module.exports = function handler(req, res) {
  const fp = (s) => (s ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 6) : null);
  const m = process.env.MOLLIE_API_KEY || '';
  const r = process.env.RESEND_API_KEY || '';
  res.status(200).json({
    omgeving: process.env.VERCEL_ENV || 'onbekend',
    mollie: { lengte: m.length, begint_met: m.slice(0, 5), vingerafdruk: fp(m) },
    resend: { lengte: r.length, begint_met: r.slice(0, 3), vingerafdruk: fp(r) },
    appUrl: process.env.APP_URL || null,
  });
};
