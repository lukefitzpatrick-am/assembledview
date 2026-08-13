-- Migration 0039: Fireflies CLIENT-first attribution
-- Apply via Supabase SQL Editor — AUTHOR ONLY (Luke / Claude). Idempotent.
--
-- 1. clients.client_name_aliases — title-match tokens (Penfold's, BOSS, GA, …)
-- 2. team_members.email_aliases — short-form addresses (luke@ ↔ luke.fitzpatrick@)
-- Never seeds vendor domains into client_domains (veridooh.com stays unlearned).

-- ---------------------------------------------------------------------------
-- 1. Client name aliases
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_name_aliases jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clients.client_name_aliases IS
  'Fireflies title-match aliases. Group tokens attribute to the m365_is_anchor row.';

UPDATE public.clients
SET client_name_aliases = '["Penfolds","Penfold''s"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%penfold%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%penfold%'
  );

UPDATE public.clients
SET client_name_aliases = '["BOSS","Boss Engineering","Boss Automotive"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%boss%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%boss%'
  );

UPDATE public.clients
SET client_name_aliases = '["Golf","Golf Australia","GA"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%golf%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%golf%'
  );

UPDATE public.clients
SET client_name_aliases = '["PGA"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%pga%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%pga%'
  );

UPDATE public.clients
SET client_name_aliases = '["Hema"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%hema%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%hema%'
  );

UPDATE public.clients
SET client_name_aliases = '["Hartmann"]'::jsonb
WHERE coalesce(client_name_aliases, '[]'::jsonb) = '[]'::jsonb
  AND (
    lower(coalesce(mbaidentifier, '')) LIKE '%hartmann%'
    OR lower(coalesce(mp_client_name, '')) LIKE '%hartmann%'
  );

-- ---------------------------------------------------------------------------
-- 2. Team member email aliases (first.last canonical → first@ same domain)
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS email_aliases jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.team_members.email_aliases IS
  'Lowercased extra addresses for the same person. Used by Fireflies roster matching.';

UPDATE public.team_members
SET email_aliases = jsonb_build_array(
  split_part(email, '.', 1) || '@' || split_part(email, '@', 2)
)
WHERE coalesce(email_aliases, '[]'::jsonb) = '[]'::jsonb
  AND email ~ '^(luke|samantha|jenny|chelsea)\.[a-z]+@assembledmedia\.com\.au$';
