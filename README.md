# assembledview

## Learning section data

- Source data lives at `src/data/learning/terms.raw.csv`. Add or edit rows there (headers: `Term,Category,Definition,Formula_or_Notes`). Keep formulas in the fourth column; commas inside formulas are allowed.
- Generate the normalized JSON with `npm run build:learning` (runs `scripts/build-learning-terms.ts`). This script normalizes categories, classifies type (definition/acronym/formula), deduplicates rows, and writes `src/data/learning/terms.json`.
- Known formulas are mapped to calculators via the table in `scripts/build-learning-terms.ts`. Add a mapping there if a formula should get calculator inputs; otherwise the expression will render as read-only.
- Tabs/routes: `/learning/definitions`, `/learning/acronyms`, `/learning/formulas` (top-level `/learning` redirects to definitions).

## Auth0 RBAC setup
- Add an Auth0 Post-Login Action that appends the user’s roles to the custom claim `https://assembledview.com/roles` and the client identifier/slug to `https://assembledview.com/client` so the ID token carries both.
- Set `AUTH0_ROLE_ADMIN_ID` and `AUTH0_ROLE_CLIENT_ID` to your Auth0 role IDs, and `AUTH0_ROLE_NAMESPACE` / `AUTH0_CLIENT_NAMESPACE` if you use different claim URIs.
- The admin user create/update API requires Auth0 Management API credentials plus `XANO_USERS_ENDPOINT` (and `XANO_API_KEY` if secured) to sync role/client to Xano.
- Quick verification: log in as an admin to view all dashboards and admin links; log in as a client to confirm only their dashboard link renders and that navigating to another client’s slug redirects back to their own. Admin-only routes (e.g., `/admin/users/new`, `/dashboard`) should redirect unauthenticated users to login and block non-admins.