-- Migration 0122: site_watch (Site Watch phase 1: daily client website scan)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-24_0122_site_watch_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: Site Watch brief (24 Nov 2026), gates D1 to D9. A daily scan of each
-- client website records what changed (before and after, category,
-- severity). Latest snapshot per page plus a 90-day change log (Luke, Q9).
--
-- What it adds (all empty, RLS on, no policies, no ava_readonly grant):
--   site_watch_sites    one row per monitored site; client_id -> clients(id)
--                       on delete cascade; unique lower(base_url); latest
--                       robots.txt and sitemap URL set
--   site_watch_runs     one row per site per Melbourne scan date; queue state
--                       (queued, running, done, failed), resume cursor
--                       next_page into page_urls, per-run stylesheet hashes
--   site_watch_pages    latest snapshot per (site, url): fields jsonb, page
--                       text, layout outline, fail_error while failing
--   site_watch_changes  one row per detected change; run_id -> runs on delete
--                       cascade, so deleting a run older than 90 days takes
--                       its changes; acknowledged_*, note, teams_reported_at
-- The GTM container table and the Teams reporter view come with their own
-- phases (2 and 4), not here.
--
-- Mirror: db/schema/siteWatch.ts, snapshot db/drizzle/0031. Read and written
-- only with the switch site_watch on, which can't be turned on until the
-- marker exists.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0122_site_watch') THEN
    RAISE NOTICE '0122 already applied - no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.site_watch_sites (
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
  CREATE UNIQUE INDEX IF NOT EXISTS site_watch_sites_base_url_uq
    ON public.site_watch_sites (lower(base_url));
  CREATE INDEX IF NOT EXISTS site_watch_sites_client_idx ON public.site_watch_sites (client_id);

  CREATE TABLE IF NOT EXISTS public.site_watch_runs (
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
  CREATE UNIQUE INDEX IF NOT EXISTS site_watch_runs_site_date_uq
    ON public.site_watch_runs (site_id, scan_date);
  CREATE INDEX IF NOT EXISTS site_watch_runs_status_idx ON public.site_watch_runs (status, created_at);

  CREATE TABLE IF NOT EXISTS public.site_watch_pages (
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
  CREATE UNIQUE INDEX IF NOT EXISTS site_watch_pages_site_url_uq
    ON public.site_watch_pages (site_id, url);

  CREATE TABLE IF NOT EXISTS public.site_watch_changes (
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
  CREATE INDEX IF NOT EXISTS site_watch_changes_site_detected_idx
    ON public.site_watch_changes (site_id, detected_at DESC);
  CREATE INDEX IF NOT EXISTS site_watch_changes_run_idx ON public.site_watch_changes (run_id);

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
END
$$;
