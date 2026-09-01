-- Migration 0054: seed xero_contact_links from unique name matches
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
--
-- Same rule as lib/xero/normalizeContact.ts normalizeContactKey:
--   lower + btrim, then replace-all of ' pty ltd', ' limited', ' ltd', ' australia'
--   (order matches the TS SUFFIXES loop). No punctuation strip. No extra suffixes.
--
-- Inserts one link per xero_contacts row whose normalised name matches EXACTLY
-- ONE clients.mp_client_name. xero_contact_key = xero_contacts.xero_contact_id
-- (GUID). Never inserts zero-match or ambiguous contacts.
--
-- Pre-flight RAISE NOTICE of the unique insert count, then RAISE EXCEPTION if
-- any contact would map to two or more clients.
--
-- Does not change matchMba.ts or matcher/threeTier.ts.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  amb_n int;
  uniq_n int;
BEGIN
  WITH contact_norm AS (
    SELECT
      xc.xero_contact_id,
      btrim(
        replace(
          replace(
            replace(
              replace(lower(btrim(coalesce(xc.name, ''))), ' pty ltd', ''),
              ' limited',
              ''
            ),
            ' ltd',
            ''
          ),
          ' australia',
          ''
        )
      ) AS k
    FROM public.xero_contacts xc
  ),
  client_norm AS (
    SELECT
      c.id,
      btrim(
        replace(
          replace(
            replace(
              replace(lower(btrim(coalesce(c.mp_client_name, ''))), ' pty ltd', ''),
              ' limited',
              ''
            ),
            ' ltd',
            ''
          ),
          ' australia',
          ''
        )
      ) AS k
    FROM public.clients c
  ),
  hits AS (
    SELECT
      n.xero_contact_id,
      count(DISTINCT cn.id)::int AS n_clients
    FROM contact_norm n
    INNER JOIN client_norm cn ON cn.k = n.k AND n.k <> ''
    GROUP BY n.xero_contact_id
  )
  SELECT
    coalesce(sum(CASE WHEN n_clients >= 2 THEN 1 ELSE 0 END), 0)::int,
    coalesce(sum(CASE WHEN n_clients = 1 THEN 1 ELSE 0 END), 0)::int
  INTO amb_n, uniq_n
  FROM hits;

  RAISE NOTICE '0054 pre-flight unique name matches to insert: %', uniq_n;
  RAISE NOTICE '0054 pre-flight ambiguous contacts: %', amb_n;

  IF amb_n > 0 THEN
    RAISE EXCEPTION
      '0054 abort: % xero_contacts would map to two or more clients — refuse to guess',
      amb_n;
  END IF;
END
$$;

DO $$
DECLARE
  inserted int := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0054_seed_xero_contact_links'
  ) THEN
    RAISE NOTICE '0054 already applied (migration_markers) — skip seed';
    RETURN;
  END IF;

  WITH contact_norm AS (
    SELECT
      xc.xero_contact_id,
      btrim(
        replace(
          replace(
            replace(
              replace(lower(btrim(coalesce(xc.name, ''))), ' pty ltd', ''),
              ' limited',
              ''
            ),
            ' ltd',
            ''
          ),
          ' australia',
          ''
        )
      ) AS k
    FROM public.xero_contacts xc
  ),
  client_norm AS (
    SELECT
      c.id,
      btrim(
        replace(
          replace(
            replace(
              replace(lower(btrim(coalesce(c.mp_client_name, ''))), ' pty ltd', ''),
              ' limited',
              ''
            ),
            ' ltd',
            ''
          ),
          ' australia',
          ''
        )
      ) AS k
    FROM public.clients c
  ),
  unique_hits AS (
    SELECT
      n.xero_contact_id,
      (array_agg(cn.id ORDER BY cn.id))[1] AS client_id
    FROM contact_norm n
    INNER JOIN client_norm cn ON cn.k = n.k AND n.k <> ''
    GROUP BY n.xero_contact_id
    HAVING count(DISTINCT cn.id) = 1
  )
  INSERT INTO public.xero_contact_links (
    xero_contact_key, client_id, learned_from, updated_at
  )
  SELECT
    u.xero_contact_id,
    u.client_id,
    'seed:0054_name_unique',
    now()
  FROM unique_hits u
  ON CONFLICT (xero_contact_key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RAISE NOTICE '0054 inserted xero_contact_links rows: %', inserted;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0054_seed_xero_contact_links',
    'seed unique normalizeContactKey matches; xero_contact_key = xero_contact_id'
  );
END
$$;
