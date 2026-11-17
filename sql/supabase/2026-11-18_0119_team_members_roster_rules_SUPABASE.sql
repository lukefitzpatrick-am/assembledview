-- 0119_team_members_roster_rules: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0119_team_members_roster_rules.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Adds two checks on public.team_members (a name has no "@", email_aliases
--   is a jsonb array) and trigger trg_team_members_address_unique: an
--   address, primary or alias, belongs to one row (unique_violation 23505,
--   constraint team_members_address_unique). Writes marker
--   0119_team_members_roster_rules. Updates no rows.
--
-- Order
--   Before this: deploy the B53 code, rename on the Team tab every person
--   whose name is an email (2 live on 18 Nov), and run the B53 alias script
--   (it takes samantha@ off the second row).
--   1. Run the BEFORE block. Every count must be 0.
--   2. Run the DO block. It refuses (nothing done) if the marker exists or any
--      row breaks a rule, and lists those rows. It rolls back if any AFTER
--      check inside fails.
--   3. Run the AFTER block.
--   Then turn on roster_rules on /admin/features.

-- ===================== 1. BEFORE (read only) =====================
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0119_team_members_roster_rules';                                -- expect 0
SELECT id FROM public.team_members WHERE position('@' in name) > 0;            -- expect no rows (rename on the Team tab)
SELECT id FROM public.team_members WHERE jsonb_typeof(email_aliases) <> 'array'; -- expect no rows
WITH held AS (
  SELECT id, lower(btrim(email)) AS address FROM public.team_members
  UNION
  SELECT m.id, lower(btrim(a.value)) FROM public.team_members m
   CROSS JOIN LATERAL jsonb_array_elements_text(m.email_aliases) AS a(value)
)
SELECT address, string_agg(id::text, ', ' ORDER BY id) AS team_member_ids
  FROM held GROUP BY address HAVING count(DISTINCT id) > 1;                   -- expect no rows (run the B53 alias script)

-- ===================== 2. CHANGE (one DO block) =====================
CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  bad       text;
  n_checks  integer;
  n_trigger integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0119_team_members_roster_rules') THEN
    RAISE EXCEPTION 'marker 0119_team_members_roster_rules already exists - nothing done';
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

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_checks FROM pg_constraint
   WHERE conrelid = 'public.team_members'::regclass
     AND conname IN ('team_members_name_no_email', 'team_members_email_aliases_array');
  IF n_checks <> 2 THEN
    RAISE EXCEPTION 'expected 2 new check constraints, found %', n_checks;
  END IF;
  SELECT count(*) INTO n_trigger FROM pg_trigger
   WHERE tgrelid = 'public.team_members'::regclass AND tgname = 'trg_team_members_address_unique';
  IF n_trigger <> 1 THEN
    RAISE EXCEPTION 'expected the address trigger, found %', n_trigger;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0119_team_members_roster_rules';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0119_team_members_roster_rules applied: name and aliases checks, address trigger, marker written. No rows updated.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.team_members'::regclass
   AND conname IN ('team_members_name_no_email', 'team_members_email_aliases_array'); -- expect 2 rows
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.team_members'::regclass
   AND tgname = 'trg_team_members_address_unique';                            -- expect 1 row
SELECT key FROM public.migration_markers
 WHERE key = '0119_team_members_roster_rules';                                -- expect 1 row
SELECT count(*) AS team_members FROM public.team_members;                     -- expect the same as before

-- ===================== Rollback (only if you must undo) =====================
-- Safe at any time: the app answers a refused write either way.
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_team_members_address_unique ON public.team_members;
--   DROP FUNCTION IF EXISTS public.team_members_address_unique();
--   ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_name_no_email;
--   ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_email_aliases_array;
--   DELETE FROM public.migration_markers WHERE key = '0119_team_members_roster_rules';
-- COMMIT;
