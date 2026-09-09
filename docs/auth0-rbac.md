# Auth0 RBAC setup

Use a Post Login Action to push roles and tenant slugs into the ID token so both dev and prod receive the same claims.

## Custom claims
- Roles claim: `https://assembledview.com/roles` (array of role names)
- Client slug (primary / landing): `https://assembledview.com/client_slug`
- Client slugs (full tenant set, primary first): `https://assembledview.com/client_slugs`
- Optional MBA allow-list: `https://assembledview.com/mba_numbers`
- Optional primary MBA: `https://assembledview.com/primary_mba_number`
- Auth0 role name for admins: `Assembled Admin` (normalized to `admin` in the app)

## Action snippet (Post Login)
Create/enable an Action with the following code and add it to the Post Login flow. Make sure it is enabled in production or roles will be missing. The app also accepts the `.com.au` namespace.

```js
exports.onExecutePostLogin = async (event, api) => {
  const ns = "https://assembledview.com";
  const meta = event.user.app_metadata || {};
  const roles = event.authorization?.roles || [];
  const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const primary = norm(meta.client_slug);
  const slugs = Array.from(new Set(
    [primary, ...(Array.isArray(meta.client_slugs) ? meta.client_slugs.map(norm) : [])]
      .filter(Boolean)
  ));
  const mbas = Array.isArray(meta.mba_numbers) ? meta.mba_numbers.map(norm).filter(Boolean) : [];

  if (roles.length) api.idToken.setCustomClaim(`${ns}/roles`, roles);
  if (primary) api.idToken.setCustomClaim(`${ns}/client_slug`, primary);
  if (slugs.length) api.idToken.setCustomClaim(`${ns}/client_slugs`, slugs);
  if (mbas.length) api.idToken.setCustomClaim(`${ns}/mba_numbers`, mbas);
  if (meta.primary_mba_number) api.idToken.setCustomClaim(`${ns}/primary_mba_number`, norm(meta.primary_mba_number));
};
```

Notes:
- `client_slug` is the primary (landing) slug and must be element zero of `client_slugs`.
- The app reads the same keys from namespaced claims, then `app_metadata`, then `user_metadata` (`getUserClientSlugs`). Numeric-only values are rejected.
- `getUserMbaNumbers` still reads `app_metadata.mba_numbers` only. Keep `app_metadata` on the session (the campaign page logs it).
- Test the Action in dev and prod; without it, users will appear role-less and lose admin UI.

## Role IDs required for provisioning
- `AUTH0_ROLE_CLIENT_ID` and `AUTH0_ROLE_ADMIN_ID` must be the Auth0 Role IDs (they start with `rol_...`), not the role display names.
