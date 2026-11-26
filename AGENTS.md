# AGENTS.md

Project setup, run, and testing guidance for AI agents. See [README.md](README.md)
for the full product overview, environment variables, and route/API map.

## Cursor Cloud specific instructions

AssembledView is a single Next.js 15 (App Router) app — media planning, client
dashboards, campaign pacing, and finance. Backends are Auth0 (auth), Xano (HTTP
APIs), and Snowflake (analytics). There is one service: the Next.js dev server.

### Booting the dev server
- `lib/auth0.ts` fails fast at import if `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
  `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, or `APP_BASE_URL` are missing. `middleware.ts`
  imports it, so the whole app throws on boot without those vars. Create a `.env.local`
  (gitignored) with placeholder Auth0 values to let the server boot and serve the
  public landing/login page. A random 32-byte hex works for `AUTH0_SECRET`.
- Standard commands are in `package.json`/README: `npm run dev` (port 3000),
  `npm run build`, `npm run lint`, `npm run typecheck`.
- On boot, `instrumentation.ts` fires cache-warm tasks that log non-fatal
  `Missing required environment variable: XANO_...` warnings when Xano vars are
  absent. These are expected and do not crash boot — ignore them.

### What works without real credentials
- The public landing page `/` renders (HTTP 200) and shows the Auth0 login UI.
- Protected pages 307-redirect to `/auth/login`; `/api/*` (except `/api/auth`)
  returns `401 {"error":"unauthorised"}`. This is correct middleware behavior, not a bug.
- Logging in and reaching dashboards/mediaplans/pacing/finance data requires REAL
  Auth0 + Xano (and Snowflake for pacing) credentials. Placeholder Auth0 values are
  only enough to boot and view the login screen — clicking "Log in" hits the real
  Auth0 tenant and will fail with placeholders.

### Lint / typecheck / tests
- CI (`.github/workflows/ci.yml`) runs on Node 22: `npm ci` then `npx tsc --noEmit`,
  plus a non-blocking `knip` report. `npm run lint` passes with warnings only.
- The `test:*` scripts in `package.json` run pure business-logic tests via
  `tsx --test` / `node --test` (finance forecast, KPI resolve, pacing maths, expert
  grid, billing, AVA, learning). They need no external services and run fast.
- `npm run build:learning` regenerates `src/data/learning/terms.json` from
  `terms.raw.csv` deterministically (currently 609 terms); output is byte-stable.
