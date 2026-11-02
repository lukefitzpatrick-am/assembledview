-- 0112_clients_is_test_client: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0112_clients_is_test_client.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Adds public.clients.is_test_client boolean NOT NULL DEFAULT false and
--   writes the marker 0112_clients_is_test_client. Every existing client
--   reads false. Updates no rows. ava_readonly already reads clients (0003).
--
-- Two parts. Run PART A first, then PART B second, as separate runs.
--
-- PART A (run first): the migration.
--   A1. Run the BEFORE block. Check every expected value.
--   A2. Run the DO block. It refuses (nothing done) if the marker or the
--       column already exists, and rolls back if any AFTER check inside fails.
--   A3. Run the AFTER block. Check every expected value.
--   Apply PART A before deploying the code that carries the db/schema mirror (C-76).
--
-- PART B (run second, only after A3 passes): mark the three test clients.
--   B1. Preview. B2. The guarded UPDATE (returns the rows it changed).
--   B3. After check.

-- #########################################################################
-- PART A: RUN FIRST (the migration)
-- #########################################################################

-- ===================== A1. BEFORE (read only) =====================
SELECT count(*) AS column_rows FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'clients'
   AND column_name = 'is_test_client';                                        -- expect 0
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0112_clients_is_test_client';                                   -- expect 0
SELECT count(*) AS clients FROM public.clients;                               -- note the number

-- ===================== A2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_col     integer;
  n_true    bigint;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0112_clients_is_test_client') THEN
    RAISE EXCEPTION 'marker 0112_clients_is_test_client already exists - nothing done';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'clients'
                AND column_name = 'is_test_client') THEN
    RAISE EXCEPTION 'clients.is_test_client already exists - nothing done';
  END IF;

  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS is_test_client boolean NOT NULL DEFAULT false;

  COMMENT ON COLUMN public.clients.is_test_client IS
    'Test or internal client. Finance checks such as the true-up leave its plans out. Set on the client form (admin).';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0112_clients_is_test_client', 'clients.is_test_client boolean NOT NULL DEFAULT false. No rows updated.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clients'
     AND column_name = 'is_test_client' AND data_type = 'boolean'
     AND is_nullable = 'NO' AND column_default = 'false';
  IF n_col <> 1 THEN
    RAISE EXCEPTION 'expected clients.is_test_client boolean not null default false, found % matching columns', n_col;
  END IF;
  SELECT count(*) INTO n_true FROM public.clients WHERE is_test_client;
  IF n_true <> 0 THEN
    RAISE EXCEPTION 'expected no client marked test yet, found %', n_true;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0112_clients_is_test_client';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0112_clients_is_test_client applied: column added (every client false), marker written.';
END
$$;

-- ===================== A3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'clients'
   AND column_name = 'is_test_client';                 -- expect 1 row: boolean, NO, false
SELECT count(*) FILTER (WHERE is_test_client) AS test_clients,
       count(*) AS clients
  FROM public.clients;                                  -- expect test_clients 0, clients = BEFORE
SELECT key FROM public.migration_markers
 WHERE key = '0112_clients_is_test_client';             -- expect 1 row

-- #########################################################################
-- PART B: RUN SECOND (only after PART A's AFTER block passed)
-- Marks clients 53, 54 and 57 as test or internal. Nothing else.
-- #########################################################################
-- The CTE checks each id still has the MBA identifier its plans use
-- (krusty003, supabase001, assembled001 on 2 Nov 2026), compared lower-cased.
-- If any of the three does not match, the UPDATE changes nothing and returns
-- 0 rows.
--   53 Krusty Krab (demo, plan krusty003)
--   54 Supabase test client (plan supabase001)
--   57 Assembled Media, internal (plan assembled001 "LinkedIn Lead Gen")

-- ===================== B1. Preview (read only) =====================
-- Expect exactly 3 rows (53, 54, 57), all is_test_client false. The live
-- mbaidentifier for 57 is "Assembled" (capital A): that matches, because the
-- check lower-cases it to "assembled".
SELECT id, mp_client_name, mbaidentifier, is_test_client
  FROM public.clients
 WHERE id IN (53, 54, 57)
 ORDER BY id;

-- ===================== B2. Change (guarded UPDATE) =====================
-- Expect 3 rows returned (53, 54, 57). On a first run, 0 rows means a check
-- failed and nothing changed: read the preview and stop. Re-running B2 after
-- a successful first run returns 0 rows: that is expected (all three are
-- already true, and the guard only matches clients still false).
WITH expected(id, mbaidentifier) AS (
  VALUES (53::bigint, 'krusty'), (54::bigint, 'supabase'), (57::bigint, 'assembled')
),
checked AS (
  SELECT c.id
    FROM expected e
    JOIN public.clients c
      ON c.id = e.id
     AND lower(btrim(coalesce(c.mbaidentifier, ''))) = e.mbaidentifier
     AND c.is_test_client = false
),
guard AS (
  SELECT count(*) = 3 AS ok FROM checked
)
UPDATE public.clients c
   SET is_test_client = true
  FROM guard
 WHERE guard.ok
   AND c.id IN (SELECT id FROM checked)
RETURNING c.id, c.mp_client_name, c.mbaidentifier, c.is_test_client;

-- ===================== B3. After (read only) =====================
-- Expect exactly 3 rows, ids 53, 54, 57, all true.
SELECT id, mp_client_name, mbaidentifier, is_test_client
  FROM public.clients
 WHERE is_test_client
 ORDER BY id;
