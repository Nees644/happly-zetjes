-- ============================================================
-- ZETJES — proeflinks voor de LinkedIn-post (oktober 2026)
-- Maakt een tenant "Proef LinkedIn" en twee gedeelde proeflinks:
-- GLI en rookvrij. Elke link werkt voor maximaal 50 toestellen en
-- is 60 dagen geldig. Idempotent: vaker draaien maakt niets dubbel.
-- ============================================================

begin;

insert into tenants (name, slug, type, contact_email)
select 'Proef LinkedIn', 'proef-linkedin', 'overig', 'maarten@happly.nl'
where not exists (select 1 from tenants where slug = 'proef-linkedin');

insert into invites (tenant_id, product_id, context, theme, label, start_date, expires_at, max_uses)
select t.id, p.id, 'gli', 'gli', 'Proeflink GLI', current_date, now() + interval '60 days', 50
from tenants t left join products p on p.slug = 'zetjes'
where t.slug = 'proef-linkedin'
  and not exists (select 1 from invites i where i.tenant_id = t.id and i.label = 'Proeflink GLI');

insert into invites (tenant_id, product_id, context, theme, label, start_date, expires_at, max_uses)
select t.id, p.id, 'rookvrij', 'rookvrij', 'Proeflink rookvrij', current_date, now() + interval '60 days', 50
from tenants t left join products p on p.slug = 'zetjes'
where t.slug = 'proef-linkedin'
  and not exists (select 1 from invites i where i.tenant_id = t.id and i.label = 'Proeflink rookvrij');

commit;

-- Uitkomst: de twee links om te delen.
select i.label,
       'https://happly-zetjes.vercel.app/?token=' || i.token as proeflink,
       i.expires_at::date as geldig_tot
from invites i join tenants t on t.id = i.tenant_id
where t.slug = 'proef-linkedin'
order by i.label;
