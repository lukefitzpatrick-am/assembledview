-- Migration 0045: Auth0 roster identity on team_members (CX2-10)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Login upsert + Management API sync stamp auth0_user_id / last_login_at.
-- roster_source records how the row was created; never overwrite a human-edited
-- name or email_aliases. Sync never deactivates or deletes.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS auth0_user_id text UNIQUE;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS roster_source text
    CHECK (roster_source IN ('manual', 'auth0_login', 'auth0_sync'))
    DEFAULT 'manual';

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN public.team_members.auth0_user_id IS
  'Auth0 user.sub / user_id. Set on login or Management API sync; never overwritten once set.';

COMMENT ON COLUMN public.team_members.roster_source IS
  'How the row was created: manual (Team Add), auth0_login, or auth0_sync. Updates do not change this.';

COMMENT ON COLUMN public.team_members.last_login_at IS
  'Last Auth0 login (or last_login from Management API). Report-only companion to never-logged-in.';
