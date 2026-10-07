-- AUTHOR ONLY. Do not apply from this repo.
--
-- public.enforce_published_pointer_stamped() is a SECURITY DEFINER trigger
-- function (0069, RETURNS trigger). Supabase exposes it to anon and
-- authenticated through /rest/v1/rpc. Revoke EXECUTE from the API roles.
-- A trigger does not need EXECUTE for the calling role: the trigger still
-- fires after this revoke.

REVOKE EXECUTE ON FUNCTION public.enforce_published_pointer_stamped()
  FROM public, anon, authenticated;
