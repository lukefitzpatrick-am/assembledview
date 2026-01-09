# Auth0 RBAC setup

Use a Post Login Action to push roles into the ID token so both dev and prod receive the same claims.

## Custom claims
- Roles claim: `https://assembledview.com/roles` (array of role names)
- Client claim (optional): `https://assembledview.com/client`
- Auth0 role name for admins: `Assembled Admin` (normalized to `admin` in the app)

## Action snippet (Post Login)
Create/enable an Action with the following code and add it to the Post Login flow. Make sure it is enabled in production or roles will be missing.

```js
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles || [];
  const clientId =
    event.user.app_metadata?.client ||
    event.user.app_metadata?.clientId ||
    event.user.app_metadata?.client_id ||
    event.user.app_metadata?.client_slug ||
    event.user.app_metadata?.clientSlug;

  if (roles.length) {
    api.idToken.setCustomClaim("https://assembledview.com/roles", roles);
  }

  if (clientId) {
    api.idToken.setCustomClaim("https://assembledview.com/client", clientId);
  }
};
```

Notes:
- If you use the `.com.au` domain, the app already understands both namespaces.
- Test the Action in dev and prod; without it, users will appear role-less and lose admin UI.




















