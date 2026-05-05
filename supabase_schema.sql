-- ============================================================
-- HAPPLY — DATABASE SCHEMA (multi-product)
-- Plak dit in Supabase > SQL Editor > New Query > Run
-- ============================================================

-- 1. PRODUCTS: de happly producten
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,  -- 'zetjes' | 'complimenten' | 'aanmoedigingen'
  name        TEXT NOT NULL,         -- 'Zetjes' | 'Complimenten'
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Standaard producten
INSERT INTO products (slug, name) VALUES
  ('zetjes',         'Zetjes'),
  ('complimenten',   'Complimenten'),
  ('aanmoedigingen', 'Aanmoedigingen');

-- 2. TENANTS: bedrijven met een abonnement
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. TENANT_PRODUCTS: welke producten heeft een tenant afgenomen
CREATE TABLE tenant_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, product_id)
);

-- 4. INVITES: uitnodigingslinks, gekoppeld aan product
CREATE TABLE invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  token       TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  used_at     TIMESTAMPTZ,
  anon_id     TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 5. SESSIONS: elke sessie — nooit naam/email opslaan
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  product_id      UUID REFERENCES products(id),
  anon_id         TEXT NOT NULL,
  -- Zetjes-specifieke velden (andere producten krijgen eigen velden later)
  situation       TEXT,
  clarify_q       TEXT,
  clarify_a       TEXT,
  zetje_badge     TEXT,
  zetje_title     TEXT,
  zetje_intro     TEXT,
  zetje_steps     JSONB,
  blocker_type    TEXT,
  feedback        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 6. Row Level Security
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service only" ON products        FOR ALL USING (false);
CREATE POLICY "service only" ON tenants         FOR ALL USING (false);
CREATE POLICY "service only" ON tenant_products FOR ALL USING (false);
CREATE POLICY "service only" ON invites         FOR ALL USING (false);
CREATE POLICY "service only" ON sessions        FOR ALL USING (false);

-- 7. Indexen
CREATE INDEX ON sessions(tenant_id);
CREATE INDEX ON sessions(product_id);
CREATE INDEX ON sessions(anon_id);
CREATE INDEX ON sessions(created_at);
CREATE INDEX ON invites(token);
CREATE INDEX ON invites(tenant_id);
CREATE INDEX ON invites(product_id);

-- ============================================================
-- EERSTE TENANT AANMAKEN (pas aan)
-- Voer dit apart uit nadat schema klaar is:
-- ============================================================
-- INSERT INTO tenants (name, slug) VALUES ('Demo Bedrijf BV', 'demo-bedrijf');
--
-- Dan Zetjes activeren voor die tenant:
-- INSERT INTO tenant_products (tenant_id, product_id)
--   SELECT t.id, p.id FROM tenants t, products p
--   WHERE t.slug = 'demo-bedrijf' AND p.slug = 'zetjes';
