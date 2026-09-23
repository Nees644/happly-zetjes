// api/_lib/supabase.js
// Eén Supabase-client met de service-rol, alleen server-side.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = { supabase };
