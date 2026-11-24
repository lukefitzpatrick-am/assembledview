-- 0122_site_watch: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0122_site_watch.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates public.site_watch_sites, site_watch_runs, site_watch_pages and
--   site_watch_changes (all empty, RLS on, no policies, no ava_readonly grant)
--   and writes the marker 0122_site_watch. Touches no existing rows.
--   Until this runs, the switch site_watch reads off and can't be turned on.
--   Apply after 0116 to 0121 (it needs nothing from them, but keeps the order).
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or any table
--      already exists, and rolls back if any check inside fails.
--   3. Run the AFTER block. Check every expected value.

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.site_watch_sites') AS sites, to_regclass('public.site_watch_runs') AS runs,
       to_regclass('public.site_watch_pages') AS pages, to_regclass('public.site_watch_changes') AS changes;  -- expect 4 NULLs
SELECT count(*) AS marker_rows FROM public.migration_markers WHERE key = '0122_site_watch';         -- expect 0
SELECT count(*) AS clients_with_website FROM public.clients
 WHERE NOT is_test_client AND nullif(btrim(website), '') IS NOT NULL;                                -- note it (35 on 24 Nov 2026)

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_tables  integer;
  n_rls     integer;
  n_grant   integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0122_site_watch') THEN
    RAISE EXCEPTION 'marker 0122_site_watch already exists - nothing done';
  END IF;
  IF to_regclass('public.site_watch_sites') IS NOT NULL OR to_regclass('public.site_watch_runs') IS NOT NULL
     OR to_regclass('public.site_watch_pages') IS NOT NULL OR to_regclass('public.site_watch_changes') IS NOT NULL THEN
    RAISE EXCEPTION 'a site_watch table already exists - nothing done';
  END IF;

  CREATE TABLE public.site_watch_sites (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id         bigint NOT NULL,
    label             text NOT NULL,
    base_url          text NOT NULL,
    url_prefix        text,
    sitemap_url       text,
    robots_url        text,
    key_urls          text[] NOT NULL DEFAULT '{}',
    page_limit        integer NOT NULL DEFAULT 100,
    ignore_selectors  text[] NOT NULL DEFAULT '{}',
    watch_text        boolean NOT NULL DEFAULT true,
    watch_visual      boolean NOT NULL DEFAULT true,
    enabled           boolean NOT NULL DEFAULT true,
    robots_txt        text,
    sitemap_urls      text[],
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT site_watch_sites_client_fk FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE,
    CONSTRAINT site_watch_sites_page_limit_check CHECK (page_limit BETWEEN 1 AND 500),
    CONSTRAINT site_watch_sites_base_url_check CHECK (base_url ~* '^https?://')
  );
  CREATE UNIQUE INDEX site_watch_sites_base_url_uq
    ON public.site_watch_sites (lower(base_url));
  CREATE INDEX site_watch_sites_client_idx ON public.site_watch_sites (client_id);

  CREATE TABLE public.site_watch_runs (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id        bigint NOT NULL,
    scan_date      date NOT NULL,
    status         text NOT NULL DEFAULT 'queued',
    attempts       integer NOT NULL DEFAULT 0,
    page_urls      text[],
    next_page      integer NOT NULL DEFAULT 0,
    css_hashes     jsonb NOT NULL DEFAULT '{}'::jsonb,
    pages_checked  integer NOT NULL DEFAULT 0,
    pages_changed  integer NOT NULL DEFAULT 0,
    pages_failed   integer NOT NULL DEFAULT 0,
    flags          text[] NOT NULL DEFAULT '{}',
    error          text,
    emailed_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    started_at     timestamptz,
    finished_at    timestamptz,
    CONSTRAINT site_watch_runs_site_fk FOREIGN KEY (site_id)
      REFERENCES public.site_watch_sites(id) ON DELETE CASCADE,
    CONSTRAINT site_watch_runs_status_check CHECK (status IN ('queued', 'running', 'done', 'failed'))
  );
  CREATE UNIQUE INDEX site_watch_runs_site_date_uq
    ON public.site_watch_runs (site_id, scan_date);
  CREATE INDEX site_watch_runs_status_idx ON public.site_watch_runs (status, created_at);

  CREATE TABLE public.site_watch_pages (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id          bigint NOT NULL,
    url              text NOT NULL,
    fields           jsonb NOT NULL,
    page_text        text,
    layout           text,
    fail_error       text,
    last_run_id      bigint,
    last_checked_at  timestamptz NOT NULL DEFAULT now(),
    last_changed_at  timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT site_watch_pages_site_fk FOREIGN KEY (site_id)
      REFERENCES public.site_watch_sites(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX site_watch_pages_site_url_uq
    ON public.site_watch_pages (site_id, url);

  CREATE TABLE public.site_watch_changes (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id                bigint NOT NULL,
    run_id                 bigint NOT NULL,
    url                    text,
    category               text NOT NULL,
    field                  text NOT NULL,
    severity               text NOT NULL,
    before                 jsonb,
    after                  jsonb,
    diff                   jsonb,
    group_key              text,
    detected_at            timestamptz NOT NULL DEFAULT now(),
    acknowledged_by        text,
    acknowledged_by_name   text,
    acknowledged_at        timestamptz,
    note                   text,
    teams_reported_at      timestamptz,
    CONSTRAINT site_watch_changes_site_fk FOREIGN KEY (site_id)
      REFERENCES public.site_watch_sites(id) ON DELETE CASCADE,
    CONSTRAINT site_watch_changes_run_fk FOREIGN KEY (run_id)
      REFERENCES public.site_watch_runs(id) ON DELETE CASCADE,
    CONSTRAINT site_watch_changes_category_check
      CHECK (category IN ('technical', 'tracking', 'content', 'visual')),
    CONSTRAINT site_watch_changes_severity_check
      CHECK (severity IN ('critical', 'high', 'medium', 'low'))
  );
  CREATE INDEX site_watch_changes_site_detected_idx
    ON public.site_watch_changes (site_id, detected_at DESC);
  CREATE INDEX site_watch_changes_run_idx ON public.site_watch_changes (run_id);

  COMMENT ON TABLE public.site_watch_sites IS 'Site Watch: one row per monitored client website (0122).';
  COMMENT ON TABLE public.site_watch_runs IS 'Site Watch: one scan per site per Melbourne date; deleted after 90 days with its changes (0122).';
  COMMENT ON TABLE public.site_watch_pages IS 'Site Watch: latest snapshot per page (0122).';
  COMMENT ON TABLE public.site_watch_changes IS 'Site Watch: detected changes, 90-day log (0122).';

  ALTER TABLE public.site_watch_sites   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.site_watch_runs    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.site_watch_pages   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.site_watch_changes ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0122_site_watch', 'Site Watch phase 1: sites, runs, pages, changes. Empty, RLS on, no ava grant.');

  SELECT count(*) INTO n_tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'site\_watch\_%';
  IF n_tables <> 4 THEN RAISE EXCEPTION 'expected 4 site_watch tables, found %', n_tables; END IF;
  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'site\_watch\_%' AND c.relrowsecurity;
  IF n_rls <> 4 THEN RAISE EXCEPTION 'expected RLS on 4 tables, found %', n_rls; END IF;
  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE grantee = 'ava_readonly' AND table_name LIKE 'site\_watch\_%';
  IF n_grant <> 0 THEN RAISE EXCEPTION 'ava_readonly has % grants on site_watch tables', n_grant; END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0122_site_watch';
  IF n_marker <> 1 THEN RAISE EXCEPTION 'expected 1 marker row, found %', n_marker; END IF;

  RAISE NOTICE '0122_site_watch applied: 4 tables created (empty, RLS on, no ava grant), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('site_watch_sites', 'site_watch_runs', 'site_watch_pages', 'site_watch_changes')
 ORDER BY relname;                                                    -- expect 4 rows, all true
SELECT (SELECT count(*) FROM public.site_watch_sites) AS sites, (SELECT count(*) FROM public.site_watch_runs) AS runs,
       (SELECT count(*) FROM public.site_watch_pages) AS pages, (SELECT count(*) FROM public.site_watch_changes) AS changes;  -- expect 0, 0, 0, 0
SELECT key FROM public.migration_markers WHERE key = '0122_site_watch';  -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn site_watch off first. Drops every site, scan and change.
-- BEGIN;
--   DROP TABLE IF EXISTS public.site_watch_changes;
--   DROP TABLE IF EXISTS public.site_watch_pages;
--   DROP TABLE IF EXISTS public.site_watch_runs;
--   DROP TABLE IF EXISTS public.site_watch_sites;
--   DELETE FROM public.migration_markers WHERE key = '0122_site_watch';
-- COMMIT;
