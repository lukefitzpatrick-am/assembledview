-- Migration 0020: M1 M365 canonical client identity + SharePoint URL columns
-- Apply via Supabase SQL Editor / MCP after review — AUTHOR ONLY (Luke).
-- Do NOT drizzle-kit migrate from Cursor. Idempotent.
--
-- Why NOT unique(lower(mbaidentifier)) alone:
-- Live groups share one identifier across multiple clients rows
-- (penfold×2, golf×2, pgaaus×2, buxton×3). resolveClientGroup
-- (lib/clients/clientGroup.ts) is exact case-insensitive mbaidentifier
-- equality — never startsWith. M365 needs ONE site URL per group, so
-- uniqueness is on the anchor row only (m365_is_anchor).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sharepoint_site_url text NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS teams_group_id text NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS m365_is_anchor boolean NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slug text NULL;

-- ---------------------------------------------------------------------------
-- 2. Seed M365 anchors: lowest id per lower(trim(mbaidentifier))
-- ---------------------------------------------------------------------------
UPDATE clients c
SET m365_is_anchor = true
FROM (
  SELECT MIN(id) AS id
  FROM clients
  WHERE mbaidentifier IS NOT NULL AND btrim(mbaidentifier) <> ''
  GROUP BY lower(btrim(mbaidentifier))
) anchors
WHERE c.id = anchors.id
  AND c.m365_is_anchor IS DISTINCT FROM true;

-- ---------------------------------------------------------------------------
-- 3. Backfill dashboard slug (mirrors lib/clients/slug.ts except legalsuper)
-- ---------------------------------------------------------------------------
UPDATE clients
SET slug = trim(both '-' from regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(btrim(lower(coalesce(mp_client_name, ''))), '&', 'and', 'g'),
        '[_-]+', ' ', 'g'
      ),
      '[^a-z0-9 ]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ),
  '\s+', '-', 'g'
))
WHERE slug IS NULL OR btrim(slug) = '';

-- Load-bearing override (same as slugifyClientNameForUrl)
UPDATE clients
SET slug = 'legal_super'
WHERE lower(regexp_replace(coalesce(mp_client_name, ''), '[^a-zA-Z0-9]+', '', 'g'))
      IN ('legalsuper')
   OR lower(btrim(coalesce(slug, ''))) IN ('legalsuper', 'legal-super');

-- ---------------------------------------------------------------------------
-- 4. Unique indexes
-- ---------------------------------------------------------------------------
-- One M365 site owner per identifier group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_m365_anchor_mbaidentifier
  ON clients (lower(btrim(mbaidentifier)))
  WHERE m365_is_anchor
    AND mbaidentifier IS NOT NULL
    AND btrim(mbaidentifier) <> '';

-- Dashboard / Auth0 tenant slug uniqueness (persisted).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_slug_lower
  ON clients (lower(btrim(slug)))
  WHERE slug IS NOT NULL AND btrim(slug) <> '';
