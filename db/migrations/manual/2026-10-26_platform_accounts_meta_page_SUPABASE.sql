-- =============================================================================
-- 2026-10-26  client_platform_accounts: add platform meta_page (Meta page id)
--             and copy real clients.idmeta values into it
-- Target: Supabase (project slpdibnxtpdlttbbczvg)
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand in the SQL Editor.
--
-- Why: Luke's decision (26 Oct 2026). The Meta page id moves from the legacy
-- clients.idmeta column into Platform accounts as platform 'meta_page'
-- (one row per client, account_ref = the page id, digits only). Creative
-- avatars / mockups and Ava's get_client_details now read meta_page first and
-- fall back to clients.idmeta until this data is moved.
--
-- Schema change: the platform check constraint gains 'meta_page'. No new
-- columns. The active-ref unique index (platform, lower(account_ref)) WHERE
-- active applies, so one Meta page can be linked to one client at a time.
-- Until this runs, adding a Meta page in the app returns
-- "This platform needs a database update first".
--
-- Copy rule: only an idmeta that is all digits (after trim) is a real page id.
-- Anything else is a placeholder and is NOT copied.
--
-- Before (read-only queries, 26 Oct 2026):
--   client_platform_accounts: 5 rows (ga4 3, gsc 2), 0 meta_page.
--   clients with a non-blank idmeta: 2, both placeholders
--     #18 Curatif                    idmeta "Curatif"
--     #56 Treasury Wine Collective   idmeta "TBC" (all 15 id* columns are "TBC")
--   Real page ids to copy: 0.
--
-- Expected result: constraint now allows meta_page; 0 rows inserted.
-- Guards: aborts (and rolls back the constraint change) unless the live
-- placeholder count is exactly 2 and the copy candidate count is exactly 0.
-- If the data has changed, re-measure with the BEFORE queries and update
-- the expected numbers before running.
--
-- Idempotent: safe to re-run (constraint re-created, copy skips clients that
-- already have an active meta_page row).
--
-- The clients.id* columns are NOT dropped here. See the note at the end.
-- =============================================================================

-- ---------------------------------------------------------------- BEFORE
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.client_platform_accounts'::regclass
  AND conname = 'client_platform_accounts_platform_chk';

SELECT id, mp_client_name, idmeta,
       (btrim(idmeta) ~ '^[0-9]+$') AS is_real_page_id
FROM public.clients
WHERE nullif(btrim(idmeta), '') IS NOT NULL
ORDER BY id;
-- Expect 2 rows: #18 "Curatif" false, #56 "TBC" false.

SELECT platform, active, count(*) AS n
FROM public.client_platform_accounts
GROUP BY platform, active
ORDER BY platform, active;
-- Expect ga4 3, gsc 2, no meta_page.

-- ---------------------------------------------------------------- CHANGE
DO $$
DECLARE
  v_placeholders int;
  v_candidates   int;
  v_inserted     int;
BEGIN
  ALTER TABLE public.client_platform_accounts
    DROP CONSTRAINT IF EXISTS client_platform_accounts_platform_chk;

  ALTER TABLE public.client_platform_accounts
    ADD CONSTRAINT client_platform_accounts_platform_chk CHECK (
      platform IN (
        'meta_ads',
        'meta_page',
        'google_ads',
        'cm360',
        'dv360',
        'tiktok',
        'reddit',
        'taboola',
        'vistar',
        'channel_factory',
        'linkedin',
        'pinterest',
        'snapchat',
        'ga4',
        'gsc'
      )
    );

  COMMENT ON TABLE public.client_platform_accounts IS
    'Platform accounts for a client. Numeric refs are digits only. CM360 and DV360 store the advertiser name. meta_page is the client''s Meta page id (replaces clients.idmeta, which stays as a read fallback).';

  SELECT count(*) INTO v_placeholders
  FROM public.clients
  WHERE nullif(btrim(idmeta), '') IS NOT NULL
    AND btrim(idmeta) !~ '^[0-9]+$';

  IF v_placeholders <> 2 THEN
    RAISE EXCEPTION 'Expected 2 placeholder idmeta values (Curatif, TBC), found %. Re-measure before running.', v_placeholders;
  END IF;

  SELECT count(*) INTO v_candidates
  FROM public.clients c
  WHERE btrim(c.idmeta) ~ '^[0-9]+$'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_platform_accounts a
      WHERE a.client_id = c.id AND a.platform = 'meta_page' AND a.active
    );

  IF v_candidates <> 0 THEN
    RAISE EXCEPTION 'Expected 0 real idmeta page ids to copy, found %. Re-measure and update this guard before running.', v_candidates;
  END IF;

  INSERT INTO public.client_platform_accounts (client_id, platform, account_ref, label, created_by)
  SELECT c.id, 'meta_page', btrim(c.idmeta), NULL, 'sql 2026-10-26 idmeta copy'
  FROM public.clients c
  WHERE btrim(c.idmeta) ~ '^[0-9]+$'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_platform_accounts a
      WHERE a.client_id = c.id AND a.platform = 'meta_page' AND a.active
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.client_platform_accounts a
      WHERE a.platform = 'meta_page' AND a.active AND lower(a.account_ref) = lower(btrim(c.idmeta))
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted <> v_candidates THEN
    RAISE EXCEPTION 'Inserted % meta_page rows, expected %. Rolled back.', v_inserted, v_candidates;
  END IF;

  RAISE NOTICE 'meta_page allowed; % placeholder idmeta values left alone; % rows copied.', v_placeholders, v_inserted;
END $$;

-- ---------------------------------------------------------------- AFTER
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.client_platform_accounts'::regclass
  AND conname = 'client_platform_accounts_platform_chk';
-- Expect the list to include 'meta_page'.

SELECT platform, active, count(*) AS n
FROM public.client_platform_accounts
GROUP BY platform, active
ORDER BY platform, active;
-- Expect unchanged: ga4 3, gsc 2, meta_page 0.

-- ---------------------------------------------------------------- NOTE
-- Dropping clients.id* later: not yet. Still referenced by
--   * the idmeta read fallback (lib/clients/platformAccounts.ts pickMetaPageId,
--     used by creative and Ava),
--   * lib/data/writeClients.ts (writable column map) and db/schema/ported.ts,
--   * lib/api.ts types.
-- Once real Meta page ids are entered as meta_page accounts, remove the
-- fallback and those references, check nothing outside the app (Xano export,
-- Fivetran / Snowflake replication of clients) reads them, then drop all 15.
-- Today no column holds real data (only Curatif / TBC placeholders).
