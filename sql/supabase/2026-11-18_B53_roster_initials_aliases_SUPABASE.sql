-- B53 roster initials aliases: write script for Luke (S18 A).
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor,
-- after reviewing 2026-11-18_B53_roster_initials_SELECT.sql, and BEFORE
-- migration 0119 (which refuses while samantha@ is on two rows).
--
-- What it does (one DO block, all or nothing)
--   1. samantha@assembledmedia.com.au stays on Samantha Murphy's row only
--      (S18: she keeps samantha@). It is taken off every other row
--      (Samantha Keah's today). C-58 is Luke's decision here, not the app's.
--   2. Adds each person's initials alias (the SELECT's status "add"): the rule
--      in lib/codex/rosterRules.ts. A person whose alias someone holds, or
--      whose alias another person would also get, gets nothing (never one of
--      two); the Team tab lists them for a manual alias once roster_rules is on.
--   Updates email_aliases and updated_at only. No primary email, name or
--   active flag changes. Names that hold an email are renamed on the Team tab.
--
-- Samantha Murphy's primary email
--   Live (18 Nov 2026) her primary is samantha.murphy@, not samantha@. This
--   script does NOT change it: see the commented block at the end and B53
--   question 1. Step 1 gives her samantha@ as her only-held alias.
--
-- Order
--   1. Run the BEFORE block. Check the numbers.
--   2. Run the DO block. It refuses (nothing done) if Samantha Murphy's row is
--      missing, and rolls back if any check inside fails.
--   3. Run the AFTER block.
--   Then apply 0119 (its own run file), then turn on roster_rules.

-- ===================== 1. BEFORE (read only) =====================
SELECT count(*) AS rows_holding_samantha
  FROM public.team_members
 WHERE email_aliases ? 'samantha@assembledmedia.com.au';                       -- expect 2 (live 18 Nov)
SELECT count(*) AS murphy_rows
  FROM public.team_members
 WHERE email = 'samantha.murphy@assembledmedia.com.au';                        -- expect 1
SELECT count(*) AS team_members FROM public.team_members;                     -- note it (12 on 18 Nov)

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  murphy_id  bigint;
  n_removed  integer;
  n_added    integer;
  n_expected integer;
  n_shared   integer;
BEGIN
  SELECT id INTO murphy_id FROM public.team_members
   WHERE email = 'samantha.murphy@assembledmedia.com.au';
  IF murphy_id IS NULL THEN
    RAISE EXCEPTION 'Samantha Murphy''s row (samantha.murphy@) is missing - nothing done';
  END IF;

  -- 1. samantha@ on Samantha Murphy only.
  UPDATE public.team_members
     SET email_aliases = (SELECT coalesce(jsonb_agg(a.value), '[]'::jsonb)
                            FROM jsonb_array_elements_text(email_aliases) AS a(value)
                           WHERE lower(btrim(a.value)) <> 'samantha@assembledmedia.com.au'),
         updated_at = now()
   WHERE id <> murphy_id
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(email_aliases) AS a(value)
                  WHERE lower(btrim(a.value)) = 'samantha@assembledmedia.com.au');
  GET DIAGNOSTICS n_removed = ROW_COUNT;
  UPDATE public.team_members
     SET email_aliases = email_aliases || '["samantha@assembledmedia.com.au"]'::jsonb, updated_at = now()
   WHERE id = murphy_id AND NOT (email_aliases ? 'samantha@assembledmedia.com.au');

  -- 2. Initials aliases (same rule as the SELECT).
  CREATE TEMP TABLE b53_wanted ON COMMIT DROP AS
  WITH person AS (
    SELECT m.id,
           CASE
             WHEN btrim(m.name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
               THEN array_to_string(regexp_split_to_array(split_part(lower(btrim(m.name)), '@', 1), '[._+-]+'), ' ')
             WHEN btrim(m.name) = ''
               THEN array_to_string(regexp_split_to_array(split_part(lower(m.email), '@', 1), '[._+-]+'), ' ')
             ELSE btrim(m.name)
           END AS shown,
           split_part(lower(btrim(m.email)), '@', 2) AS domain
      FROM public.team_members m
  ), initials AS (
    SELECT p.id, p.domain,
           coalesce((SELECT string_agg(upper(left(part, 1)), '' ORDER BY n)
                       FROM regexp_split_to_table(btrim(p.shown), '\s+') WITH ORDINALITY AS t(part, n)
                      WHERE upper(left(part, 1)) ~ '^[A-Z]$'), '') AS initials
      FROM person p
  )
  SELECT id,
         CASE
           WHEN initials = '' OR domain = '' OR domain IN (
             'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','ymail.com',
             'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me') -- FREE_MAIL_DOMAINS
             THEN NULL
           ELSE lower(initials) || '@' || domain
         END AS alias
    FROM initials;

  CREATE TEMP TABLE b53_held ON COMMIT DROP AS
  SELECT id, lower(btrim(email)) AS address FROM public.team_members
  UNION
  SELECT m.id, lower(btrim(a.value)) FROM public.team_members m
   CROSS JOIN LATERAL jsonb_array_elements_text(m.email_aliases) AS a(value);

  SELECT count(*) INTO n_shared FROM b53_wanted w
   WHERE w.alias IS NOT NULL
     AND EXISTS (SELECT 1 FROM b53_wanted o WHERE o.id <> w.id AND o.alias = w.alias);
  SELECT count(*) INTO n_expected FROM b53_wanted w
   WHERE w.alias IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM b53_held h WHERE h.address = w.alias)
     AND NOT EXISTS (SELECT 1 FROM b53_wanted o WHERE o.id <> w.id AND o.alias = w.alias);

  UPDATE public.team_members m
     SET email_aliases = m.email_aliases || jsonb_build_array(w.alias), updated_at = now()
    FROM b53_wanted w
   WHERE w.id = m.id
     AND w.alias IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM b53_held h WHERE h.address = w.alias)
     AND NOT EXISTS (SELECT 1 FROM b53_wanted o WHERE o.id <> w.id AND o.alias = w.alias);
  GET DIAGNOSTICS n_added = ROW_COUNT;

  -- Checks inside the block. Any failure rolls the whole block back.
  IF n_added <> n_expected THEN
    RAISE EXCEPTION 'expected % initials aliases added, added %', n_expected, n_added;
  END IF;
  IF (SELECT count(*) FROM public.team_members WHERE email_aliases ? 'samantha@assembledmedia.com.au') <> 1 THEN
    RAISE EXCEPTION 'samantha@ is not on exactly one row';
  END IF;

  RAISE NOTICE 'B53: samantha@ taken off % other row(s); % initials alias(es) added; % person(s) share initials (none given, add by hand).',
    n_removed, n_added, n_shared;
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT email AS primary_email, email_aliases
  FROM public.team_members
 WHERE email_aliases ? 'samantha@assembledmedia.com.au';                       -- expect 1 row: samantha.murphy@
-- Re-run the B53 SELECT: expect every row "has it" or "no alias" (the
-- inactive free-mail row), and no address held by two rows.

-- ===================== Samantha Murphy's primary (NOT run) =====================
-- S18 says Samantha Murphy keeps samantha@ "as her primary address". Live,
-- her primary is samantha.murphy@. Making samantha@ her primary would leave
-- 60 tasks (assignee and creator), 11 time entries, 43 time entry proposals
-- and 60 activity rows addressed to samantha.murphy@ (18 Nov 2026), which
-- match her only through an alias with codex_roster_aliases on (off today).
-- Her Auth0 login email would also have to change, or the Auth0 sync and
-- login would no longer find her row. B53 question 1 recommends keeping
-- samantha.murphy@ as primary. Only if Luke decides otherwise, after step 2:
-- BEGIN;
--   UPDATE public.team_members
--      SET email = 'samantha@assembledmedia.com.au',
--          email_aliases = (SELECT coalesce(jsonb_agg(a.value), '[]'::jsonb)
--                             FROM jsonb_array_elements_text(email_aliases) AS a(value)
--                            WHERE a.value <> 'samantha@assembledmedia.com.au')
--                          || '["samantha.murphy@assembledmedia.com.au"]'::jsonb,
--          updated_at = now()
--    WHERE email = 'samantha.murphy@assembledmedia.com.au';               -- expect 1 row
-- COMMIT;
