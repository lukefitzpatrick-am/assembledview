-- B53 roster initials: review SELECT for Luke (read only).
-- Supabase project slpdibnxtpdlttbbczvg. Run in the SQL Editor before the
-- B53 alias script (2026-11-18_B53_roster_initials_aliases_SUPABASE.sql).
--
-- The rule (lib/codex/rosterRules.ts initialsAliasOf, S18 A):
--   shown name  the name, or a name built from the email when the name is an
--               email address or blank (rosterDisplayName)
--   initials    the first letter of each part of the shown name, upper case;
--               a part that does not start with A to Z adds nothing
--   alias       lower-case initials @ the primary email's domain; none for a
--               free-mail domain (gmail and the like: a stranger's mailbox)
--
-- status
--   has it         the person already holds their initials alias
--   add            the script adds it
--   held by        someone else holds that address: add an alias by hand
--   shared         two or more people would get the same alias: neither gets
--                  it (C-58, never one of two); add aliases by hand
--   no alias       no alias can be made: add one by hand
-- name_holds_email: rename on the Team tab before migration 0119.

WITH person AS (
  SELECT m.id, m.active, m.email, m.name, m.email_aliases,
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
  SELECT p.id,
         coalesce((SELECT string_agg(upper(left(part, 1)), '' ORDER BY n)
                     FROM regexp_split_to_table(btrim(p.shown), '\s+') WITH ORDINALITY AS t(part, n)
                    WHERE upper(left(part, 1)) ~ '^[A-Z]$'), '') AS initials
    FROM person p
), wanted AS (
  SELECT p.*, i.initials,
         CASE
           WHEN i.initials = '' OR p.domain = '' OR p.domain IN (
             'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','ymail.com',
             'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me') -- FREE_MAIL_DOMAINS
             THEN NULL
           ELSE lower(i.initials) || '@' || p.domain
         END AS alias
    FROM person p JOIN initials i USING (id)
), held AS (
  SELECT id, lower(btrim(email)) AS address FROM public.team_members
  UNION
  SELECT m.id, lower(btrim(a.value)) FROM public.team_members m
   CROSS JOIN LATERAL jsonb_array_elements_text(m.email_aliases) AS a(value)
)
SELECT w.id, w.active, w.shown AS shown_name, w.initials, w.alias,
       CASE
         WHEN w.alias IS NULL THEN 'no alias'
         WHEN EXISTS (SELECT 1 FROM held h WHERE h.id = w.id AND h.address = w.alias) THEN 'has it'
         WHEN EXISTS (SELECT 1 FROM held h WHERE h.id <> w.id AND h.address = w.alias)
           THEN 'held by ' || (SELECT string_agg(DISTINCT h.id::text, ', ') FROM held h WHERE h.id <> w.id AND h.address = w.alias)
         WHEN EXISTS (SELECT 1 FROM wanted o WHERE o.id <> w.id AND o.alias = w.alias)
           THEN 'shared with ' || (SELECT string_agg(o.id::text, ', ' ORDER BY o.id) FROM wanted o WHERE o.id <> w.id AND o.alias = w.alias)
         ELSE 'add'
       END AS status,
       position('@' in w.name) > 0 AS name_holds_email
  FROM wanted w
 ORDER BY w.id;

-- Addresses held by more than one row (0119 refuses while any exist).
WITH held AS (
  SELECT id, lower(btrim(email)) AS address FROM public.team_members
  UNION
  SELECT m.id, lower(btrim(a.value)) FROM public.team_members m
   CROSS JOIN LATERAL jsonb_array_elements_text(m.email_aliases) AS a(value)
)
SELECT address, string_agg(id::text, ', ' ORDER BY id) AS team_member_ids
  FROM held GROUP BY address HAVING count(DISTINCT id) > 1;              -- expect samantha@ on two rows today

-- Samantha Murphy's row (S18: she keeps samantha@).
SELECT id, email AS primary_email, email_aliases
  FROM public.team_members
 WHERE email IN ('samantha.murphy@assembledmedia.com.au', 'samantha@assembledmedia.com.au');
