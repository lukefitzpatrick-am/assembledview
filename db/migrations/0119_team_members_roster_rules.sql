-- Migration 0119: team_members roster rules (S18 A, B53)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-18_0119_team_members_roster_rules_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: decision S18 A (Luke, 17 Nov 2026). An address, primary or alias,
-- belongs to one person across the whole roster, and a name never holds an
-- email address. The app checks both on every roster write behind the
-- `roster_rules` switch (lib/codex/rosterRules.ts); this makes Postgres
-- refuse a row that breaks them, whatever writes it.
--
-- What it adds:
--   check    team_members_name_no_email: name has no "@".
--   check    team_members_email_aliases_array: email_aliases is a jsonb array.
--   trigger  trg_team_members_address_unique (BEFORE INSERT, and UPDATE OF
--            email or email_aliases): the row's addresses (primary and
--            aliases, trimmed and lower case) are held by no other row,
--            active or not. A clash raises unique_violation (23505) naming
--            the address, constraint team_members_address_unique.
--            Postgres has no unique index across the elements of a jsonb
--            array, so the trigger stands in for one. It takes a
--            transaction advisory lock first, so two writes cannot add the
--            same address at once.
--
-- No rows are updated (no data fix, by rule). The DO block refuses, with
-- nothing done, while any row breaks a rule, and lists them. Fix them first:
-- rename on the Team tab, and run the B53 alias script
-- (sql/supabase/2026-11-18_B53_roster_initials_aliases_SUPABASE.sql).
--
-- No new column: db/schema/codex.ts is unchanged (the checks and the
-- trigger are not mirrored, like team_members_email_check). RLS and the
-- ava_readonly grants are unchanged. The app works before and after this
-- runs: a refused write is answered 409 or 400 with a plain message
-- (rosterWriteRefusal).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  bad text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0119_team_members_roster_rules') THEN
    RAISE NOTICE '0119 already applied - no-op';
    RETURN;
  END IF;

  -- BEFORE: refuse while any row breaks a rule.
  SELECT string_agg(problem, '; ' ORDER BY problem) INTO bad FROM (
    SELECT format('team_members %s: email_aliases is not a list', id) AS problem
      FROM public.team_members WHERE jsonb_typeof(email_aliases) <> 'array'
    UNION ALL
    SELECT format('team_members %s: the name holds an email address', id)
      FROM public.team_members WHERE position('@' in name) > 0
    UNION ALL
    SELECT format('%s is held by team_members %s', address, string_agg(DISTINCT id::text, ' and ' ORDER BY id::text))
      FROM (
        SELECT id, lower(btrim(email)) AS address FROM public.team_members
        UNION
        SELECT m.id, lower(btrim(a.value))
          FROM public.team_members m
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(m.email_aliases) = 'array' THEN m.email_aliases ELSE '[]'::jsonb END) AS a(value)
      ) addresses
     WHERE address <> ''
     GROUP BY address
    HAVING count(DISTINCT id) > 1
  ) problems;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0119 refused, nothing done. Fix these team_members rows first: %', bad;
  END IF;

  ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_name_no_email CHECK (position('@' in name) = 0);
  ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_email_aliases_array CHECK (jsonb_typeof(email_aliases) = 'array');

  CREATE OR REPLACE FUNCTION public.team_members_address_unique() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  DECLARE
    clash text;
  BEGIN
    -- shortcut: the lock holds two writes apart only at READ COMMITTED (each
    -- statement sees rows committed after the lock is taken). Under
    -- REPEATABLE READ or SERIALIZABLE both writes can commit. The app sets no
    -- isolation level. Upgrade to a side table with a real unique index
    -- (held question V30 B) if any roster writer runs above READ COMMITTED.
    PERFORM pg_advisory_xact_lock(hashtext('public.team_members addresses'));
    SELECT mine.address INTO clash
      FROM (
        SELECT lower(btrim(NEW.email)) AS address
        UNION
        SELECT lower(btrim(value)) FROM jsonb_array_elements_text(NEW.email_aliases)
      ) mine
     WHERE mine.address <> ''
       AND EXISTS (
         SELECT 1 FROM public.team_members o
          WHERE o.id <> NEW.id
            AND (lower(btrim(o.email)) = mine.address
                 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.email_aliases) oa
                             WHERE lower(btrim(oa.value)) = mine.address)))
     LIMIT 1;
    IF clash IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'unique_violation',
        CONSTRAINT = 'team_members_address_unique',
        MESSAGE = format('%s already belongs to another team member', clash);
    END IF;
    RETURN NEW;
  END
  $fn$;

  DROP TRIGGER IF EXISTS trg_team_members_address_unique ON public.team_members;
  CREATE TRIGGER trg_team_members_address_unique
    BEFORE INSERT OR UPDATE OF email, email_aliases ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.team_members_address_unique();

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0119_team_members_roster_rules', 'team_members: name without @, aliases a list, one person per address (trigger). No rows updated.');
END
$$;
