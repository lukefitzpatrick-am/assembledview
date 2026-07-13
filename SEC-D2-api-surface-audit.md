# SEC-D2 — API Surface & Auth Coverage Audit

**Date:** 2026-07-09  
**Branch audited:** `localhost` (discovery pass; static code review, no commits)  
**Scope:** All route handlers under `app/api/` (85 `route.ts` files; no `route.tsx`)  
**Method:** Static code review — middleware, handler auth, Xano proxy patterns, webhook/cron routes, debug route search  

---

## Executive summary

Middleware enforces **session presence** on almost all `/api/*` routes but **does not enforce role or tenant isolation** on API routes (explicitly documented in middleware). Handler-level tenant checks exist on only **3 route families** via `checkClientMbaAccess`. Two **catch-all Xano proxies** (`/api/media_plans/[...path]`, `/api/media-details/[...path]`) forward arbitrary paths with no caller identity check before upstream calls. **`GET /api/mediaplans` fetches the full Xano tables** and returns all clients' plans with no per-caller filter. **`PUT`/`PATCH` on `/api/mediaplans/mba/[mba_number]`** mutate Xano without the MBA access check used on `GET`.

No dedicated debug/test/seed API route directories remain. One cron route exists; no Xero webhook routes found.

---

## Middleware coverage

**File:** `middleware.ts`

**Matcher config:**

```133:137:middleware.ts
export const config = {
  matcher: [
    '/((?!_next/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|static/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot)).*)',
  ],
};
```

**Assessment:** Matcher **includes** `/api/*` (does not exclude API). Auth coverage is **not ambiguous** — API routes are matched.

**Early-return bypasses (no session check in middleware):**

| Path prefix | Line(s) | Effect |
|-------------|---------|--------|
| `/_next`, `/auth`, `/api/auth` | 27–31 | Pass through |
| **`/api/cron`** | 30 | **Cron routes skip middleware session enforcement** |
| Static assets | 27, 31 | Pass through |

**API session gate (all other `/api/*`):**

```43:59:middleware.ts
  if (isApiRoute) {
    // NOTE: Middleware only enforces authentication for /api routes.
    // Tenant isolation must be enforced in API handlers (recommended),
    // or by introducing a scoped API route structure (e.g. /api/client/*).
    if (!session) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }
    ...
    return continueResponse;
  }
```

**Implicit baseline for most routes:** `SESSION-ONLY` via middleware — `auth0.getSession(request)` at line 40, 401 at lines 47–48. No role or tenant check in middleware for API routes.

**Auth0 login routes:** `app/auth/[auth0]/route.ts` (outside `app/api/`).

**S1b-1 allowlist:** No symbol `S1b` or `S1b-1` found under `app/api/`. Closest pattern: `ADMIN_EMAIL_ALLOWLIST` env + `requireAdmin(..., { allowEmails: ADMIN_ALLOWLIST })` on `POST /api/admin/clients/refresh-slug`.

---

## Route inventory & auth classification

**Legend**

| Class | Meaning |
|-------|---------|
| **STAFF-ONLY** | Session + staff/admin role enforced in handler (or client role explicitly blocked) |
| **CLIENT-SCOPED** | Session + tenant/MBA ownership enforced for client users |
| **SESSION-ONLY** | Session required (middleware); no role/tenant check in handler |
| **UNAUTHENTICATED** | Reachable without Auth0 session (may use other secret) |

**Middleware column:** `MW:session` = middleware session gate; `MW:bypass` = excluded from middleware session check.

| Path | Methods | Description | Classification | Auth evidence |
|------|---------|-------------|----------------|---------------|
| `/api/admin/client-hub` | GET | Admin client hub summaries | **STAFF-ONLY** | `requireAdmin(request)` — `app/api/admin/client-hub/route.ts:8` |
| `/api/admin/clients/refresh-slug` | POST | Refresh client slug cache from Xano | **STAFF-ONLY** | `requireAdmin(request, { allowEmails: ADMIN_ALLOWLIST })` — `app/api/admin/clients/refresh-slug/route.ts:34` |
| `/api/admin/users` | POST, PUT | Create/update Auth0 (+ Xano sync) users | **STAFF-ONLY** | `requireAdmin(request)` — `app/api/admin/users/route.ts:60,190` |
| `/api/campaigns/[mba_number]` | GET | Campaign detail, line items, billing summary by MBA | **SESSION-ONLY** | NONE FOUND (handler) — MW:session |
| `/api/campaigns/[mba_number]/billing-schedule` | GET | Billing schedule for campaign MBA | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/chat-v2` | POST | AVA AI chat (Claude/OpenAI) | **STAFF-ONLY** | `if (!roles.includes("admin"))` — `app/api/chat-v2/route.ts:46-52` |
| `/api/clients` | GET, POST | List/create clients (Xano) | **SESSION-ONLY** | NONE FOUND — comments say "allow access for development" — `app/api/clients/route.ts:95-96,125-126` |
| `/api/clients/[id]` | GET, PUT, PATCH | Read/update client by ID | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/cron/xano-line-item-sync` | GET | Sync Xano line items → Snowflake | **UNAUTHENTICATED** | MW:bypass (`middleware.ts:30`); `assertCronSecret(request)` — `app/api/cron/xano-line-item-sync/route.ts:11` |
| `/api/dashboard/[slug]` | GET | Client dashboard data / CSV export by slug | **SESSION-ONLY** | NONE FOUND — no slug vs caller tenant check — MW:session |
| `/api/dashboard/global-monthly-client-spend` | GET | Global monthly client spend aggregates | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/dashboard/global-monthly-publisher-spend` | GET | Global monthly publisher spend aggregates | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/delivery/meta-adset` | GET | Meta ad-set delivery rows from Snowflake | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/accrual` | GET | Finance accrual report by months | **STAFF-ONLY** | `if (roles.includes("client"))` → 403 — `app/api/finance/accrual/route.ts:210-214` |
| `/api/finance/billing` | GET | Derived receivables for billing month | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/billing/[id]` | PATCH | Patch billing record metadata | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/billing/line-items` | POST | Create billing line item | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/billing/line-items/[id]` | PATCH, DELETE | Update/delete billing line item | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/billing/mark-billed` | POST | Mark invoice billed in Xano | **STAFF-ONLY** | `if (!roles.includes("admin"))` — `app/api/finance/billing/mark-billed/route.ts:26-27` |
| `/api/finance/data` | GET | Finance hub data for month | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/edits` | GET, POST | Finance audit edits (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/forecast` | GET | Finance forecast dataset | **STAFF-ONLY** | Blocks client role — `app/api/finance/forecast/route.ts:38-42`; non-admin tenant filter — `allowedClientSlugs` lines 69-71, 82 |
| `/api/finance/forecast/snapshots` | GET, POST | List/create forecast snapshots | **STAFF-ONLY** | `canCreateFinanceForecastSnapshot(roles)` → `roles.includes("admin")` — `app/api/finance/forecast/snapshots/route.ts:34-35,81,124` |
| `/api/finance/forecast/snapshots/[id]/lines` | GET | Snapshot line detail | **STAFF-ONLY** | `canAccessSnapshots(roles)` → admin — `app/api/finance/forecast/snapshots/[id]/lines/route.ts:20-21,31-32` |
| `/api/finance/forecast/snapshots/variance` | POST | Compare two snapshots | **STAFF-ONLY** | `canAccessSnapshots(roles)` → admin — `app/api/finance/forecast/snapshots/variance/route.ts:29-30,77-79` |
| `/api/finance/hub-schedule-ytd` | GET | Finance hub schedule FYTD totals | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/payables` | GET | Publisher payables for month | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/publishers` | GET | Legacy publisher-grouped billing (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/receivables/aa-media-plan` | GET | AA media plan receivable export | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/saved-views` | GET, POST | Finance saved views (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/finance/sow` | GET | Scope-of-work finance rows for month | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/kpis/campaign` | GET, POST, PATCH, DELETE | Campaign KPI CRUD | **CLIENT-SCOPED** (GET only) | GET: `checkClientMbaAccess` — `app/api/kpis/campaign/route.ts:31-32`; POST/PATCH/DELETE: NONE FOUND |
| `/api/kpis/campaign/sync` | POST | Bulk sync campaign KPIs | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/kpis/client` | GET, POST, PATCH, DELETE | Client KPI CRUD | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/kpis/publisher` | GET, POST, PATCH, DELETE | Publisher KPI CRUD | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mba/generate` | POST | Generate MBA PDF document | **SESSION-ONLY** | NONE FOUND — comment "allow access for development" — `app/api/mba/generate/route.ts:7-8` |
| `/api/me` | GET | Current user profile + roles | **SESSION-ONLY** | `auth0.getSession` — `app/api/me/route.ts:9` (identity only, no authz) |
| `/api/media-container-best-practice` | GET, POST | KPI best-practice templates (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media-container-best-practice/[id]` | PUT | Update best-practice template | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media-details/[...path]` | GET, POST, PUT, PATCH, DELETE | **Catch-all Xano proxy** (media details base) | **SESSION-ONLY** | NONE FOUND before proxy — MW:session |
| `/api/media_plans` | GET | List media plans (legacy) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/[...path]` | GET, POST, PUT, DELETE | **Catch-all Xano proxy** (media plans base + API key) | **SESSION-ONLY** | NONE FOUND before proxy — MW:session |
| `/api/media_plans/cinema` | GET, POST | Cinema line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/digi-bvod` | GET, POST | BVOD line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/influencers` | GET, POST | Influencer line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/integration` | GET, POST | Integration line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/newspaper` | GET, POST | Newspaper line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/prog-display` | GET | Programmatic display line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/prog-ooh` | GET | Programmatic OOH line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/prog-video` | GET, POST | Programmatic video line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/production` | GET, POST | Production line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/search` | GET, POST | Search line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/social` | GET, POST | Social line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/television` | GET, POST | Television line items | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/media_plans/television/[id]` | PUT, DELETE | Update/delete TV line item | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans` | GET, POST | List all media plans / create master | **SESSION-ONLY** | NONE FOUND — comments "allow access for development" — `app/api/mediaplans/route.ts:16-17,102-103` |
| `/api/mediaplans/[id]` | GET, PUT | Media plan version by ID | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/[id]/download` | GET | Download media plan file from Xano | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/[id]/mbanumber` | POST | Generate MBA number for plan ID | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/download` | POST | Generate Excel media plan export | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/generate-pdf` | POST | Generate media plan PDF | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/mba/[mba_number]` | GET, PUT, PATCH | MBA-scoped plan read/write | **CLIENT-SCOPED** (GET only) | GET: `checkClientMbaAccess` — line 726; PUT/PATCH: NONE FOUND |
| `/api/mediaplans/mba/[mba_number]/expected-spend-to-date` | GET | Expected spend-to-date for MBA | **CLIENT-SCOPED** (indirect) | No local auth; forwards session cookie to `GET /api/mediaplans/mba/{mba}` — `app/api/mediaplans/mba/[mba_number]/expected-spend-to-date/route.ts:292-296` (inherits `checkClientMbaAccess` on upstream GET) |
| `/api/mediaplans/mbanumber` | GET | MBA number lookup/validation | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/versions/[id]/billing-schedule` | PATCH | Update version billing schedule | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/mediaplans/versions/[id]/documents` | POST | Upload version documents to Xano | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/pacing/admin/orphans` | GET | List orphan pacing line items | **STAFF-ONLY** | `requireAdmin(request)` — `app/api/pacing/admin/orphans/route.ts:9` |
| `/api/pacing/admin/orphans/assign` | POST | Assign orphan to campaign | **STAFF-ONLY** | `requireAdmin(request)` — `app/api/pacing/admin/orphans/assign/route.ts:21` |
| `/api/pacing/admin/orphans/live-line-items` | GET | Live line items for orphan admin | **STAFF-ONLY** | `requireAdmin(request)` — `app/api/pacing/admin/orphans/live-line-items/route.ts:9` |
| `/api/pacing/bulk` | POST | Bulk pacing data (Snowflake) for MBA | **CLIENT-SCOPED** | `checkClientMbaAccess` — `app/api/pacing/bulk/route.ts:91-99` |
| `/api/pacing/campaigns` | GET | Live Search pacing campaigns (Xano compose) | **CLIENT-SCOPED** (non-admin with `client_slugs`) / **STAFF unscoped** | `requirePacingAccess(request)` — `app/api/pacing/campaigns/route.ts:20-21`; tenant filter via `allowedClientSlugs` lines 27-33 |
| `/api/pacing/programmatic/display` | POST | Programmatic display pacing (Snowflake) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/pacing/programmatic/video` | POST | Programmatic video pacing (Snowflake) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/pacing/search` | POST | Search pacing data (Snowflake) | **SESSION-ONLY** | `auth0.getSession` session check only — `app/api/pacing/search/route.ts:36-38` |
| `/api/pacing/social-campaigns` | GET | Live Social pacing campaigns | **CLIENT-SCOPED** (non-admin with `client_slugs`) / **STAFF unscoped** | `requirePacingAccess(request)` — `app/api/pacing/social-campaigns/route.ts:20-21` |
| `/api/pacing/social/meta` | POST | Meta social pacing (Snowflake) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/pacing/social/tiktok` | POST | TikTok social pacing (Snowflake) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/processPlan` | POST | Parse uploaded plan files (AI/parser) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/publishers` | GET, POST | List/create publishers (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/publishers/[publisherId]` | GET, PUT | Publisher detail/update | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/publishers/check-id` | GET | Check publisher ID availability | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/scopes-of-work` | GET, POST | List/create scopes of work (Xano) | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/scopes-of-work/[id]` | GET, PUT | Scope detail/update | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/scopes-of-work/generate-pdf` | POST | Generate scope PDF | **SESSION-ONLY** | NONE FOUND — MW:session |
| `/api/scopes-of-work/generate-scope-id` | POST | Generate scope ID | **SESSION-ONLY** | NONE FOUND — MW:session |

**Counts:** STAFF-ONLY 14 handler surfaces · CLIENT-SCOPED 5 route families (partial: KPI/mediaplans mutations still gap) · SESSION-ONLY 65 · UNAUTHENTICATED 1 (cron)

**`requirePacingAccess` note:** Admin users and staff without `client_slugs` claims receive `allowedClientIds: null` (unscoped). Non-admin users with slug claims are scoped to resolved Xano client IDs — `lib/pacing/pacingAuth.ts:25-40`.

---

## 3. Xano proxy exposure

Routes that call Xano with server-side base URL and/or `XANO_API_KEY`, **without** verifying caller identity/tenant before the upstream call:

| Route | Upstream | Tenant/identity check before Xano? |
|-------|----------|-------------------------------------|
| **`/api/media_plans/[...path]`** | Any path under media-plans Xano base; forwards `Authorization: Bearer ${XANO_API_KEY}` | **NO** — proxies immediately — `app/api/media_plans/[...path]/route.ts:10-31` |
| **`/api/media-details/[...path]`** | Any path under `XANO_MEDIA_DETAILS_BASE_URL` | **NO** — `app/api/media-details/[...path]/route.ts:6-33` |
| **`GET /api/mediaplans`** | Full `media_plan_versions` + `media_plan_master` tables | **NO** — `app/api/mediaplans/route.ts:108-114` |
| **`POST /api/mediaplans`** | Creates `media_plan_master` | **NO** — `app/api/mediaplans/route.ts:60-63` |
| **`GET/POST /api/clients`** | Clients collection URL | **NO** |
| **`GET/PUT/PATCH /api/clients/[id]`** | Client by ID | **NO** |
| **`GET/POST /api/publishers`** (+ `[publisherId]`) | Publishers Xano | **NO** |
| **`GET/POST /api/scopes-of-work`** (+ `[id]`) | Scope of work Xano | **NO** |
| **`/api/media_plans/*`** (per-channel routes) | Channel tables; filter by query `mba_number` only if client supplies it | **NO caller validation** — any session can query any MBA if param known |
| **`GET/PUT /api/mediaplans/[id]`** | Version + line items by ID/MBA | **NO** |
| **`PUT/PATCH /api/mediaplans/mba/[mba_number]`** | Mutate master/versions | **NO** (unlike GET which uses `checkClientMbaAccess`) |
| **`/api/finance/*`** (billing, data, sow, payables, publishers, saved-views, edits, accrual) | Multiple Xano finance endpoints | **NO tenant check** (accrual blocks client role only) |
| **`/api/finance/billing/mark-billed`** | Xano PATCH | Admin check **before** call ✓ |
| **`/api/finance/forecast/snapshots*`** | Xano snapshot storage | Admin check **before** call ✓ |
| **`/api/admin/*`** | Xano/admin operations | `requireAdmin` **before** call ✓ |
| **`/api/mediaplans/mba/[mba_number]` GET** | Xano media plan | `checkClientMbaAccess` **before** call ✓ |
| **`/api/kpis/campaign` GET** | KPI store | `checkClientMbaAccess` on GET only ✓ |

**Note:** Many routes use plain `axios` without `XANO_API_KEY`; upstream may rely on network ACL or public Xano endpoints. Proxies and pagination helper (`lib/api/xanoPagination.ts`) attach the key when set.

---

## 4. Fetch-all scoping — `GET /api/mediaplans`

**Branch `localhost` state:**

1. **Still fetches full tables:** Yes. Parallel GET of entire `media_plan_versions` and `media_plan_master` collections (not paginated, not trimmed):

```108:114:app/api/mediaplans/route.ts
      const [versionsResponse, masterResponse] = await Promise.all([
        axios.get(xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), {
          timeout: XANO_LONG_TIMEOUT_MS,
        }),
        axios.get(xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), {
          timeout: XANO_TIMEOUT_MS,
        }),
```

2. **Response filtered per caller:** **No.** Server-side logic only deduplicates to latest version per MBA; returns `mergedData` for **all** MBAs. No `auth0.getSession`, no `getUserRoles`, no `checkClientMbaAccess`, no client slug filter.

3. **Handler auth:** Comments acknowledge missing validation — `"For now, allow access for development"` (lines 102–103). Middleware still requires a session, so any authenticated user (including **client** role) receives the full list.

4. **Fallback path:** On error, POST to `get_mediaplan_topline` with max version — still unscoped (lines 196–231).

**Contrast:** On branch `main`, the same route uses `media_plan_versions_trimmed` (lighter payload, same scoping gap).

---

## 5. Webhook / callback routes

| Route | Intended caller | Verification |
|-------|-----------------|--------------|
| **`GET /api/cron/xano-line-item-sync`** | Vercel Cron / ops | `assertCronSecret(request)` — header `x-cron-secret` or `Authorization: Bearer` must match `CRON_SECRET` env; returns 401 if secret unset/wrong — `lib/auth/assertCronSecret.ts:5-11`, `app/api/cron/xano-line-item-sync/route.ts:11-15` |
| **Vercel schedule** | — | `vercel.json`: `0 19 * * *` (daily 19:00 UTC) on path `/api/cron/xano-line-item-sync` |
| **Middleware** | — | `/api/cron` **excluded** from Auth0 session middleware — `middleware.ts:30` |

**Not found:** Xano webhook handlers, Xero OAuth/callback routes, or other external callback endpoints under `app/api/`.

**Cron risk:** If `CRON_SECRET` is unset, `assertCronSecret` returns `false` → route returns 401 (fail-closed). If secret leaks, route is callable without Auth0 session.

---

## 6. Debug / leftover routes

**Search:** No files under `app/api/**/debug/**`, `test/**`, or `seed/**`. Grep for route paths containing `debug`, `test`, or `seed` under `app/api/` — no dedicated debug API routes.

**Env-gated debug behaviour (not separate routes):**

- Pacing routes append `_debug` fields when `PACING_DEBUG` / `NEXT_PUBLIC_DEBUG_PACING` — e.g. `app/api/pacing/programmatic/display/route.ts`
- `GET /api/finance/forecast?debug=1` includes row debug in response (staff-only route)
- `POST /api/finance/forecast/snapshots` accepts `debug` flag (admin-only)

Prior cleanup appears effective for standalone debug/test/seed API routes.

---

## Findings (ranked)

### CRITICAL

**C1 — Catch-all Xano proxy allows arbitrary upstream access for any authenticated session**  
**Confidence: 95%**  
**File:** `app/api/media_plans/[...path]/route.ts`

Any logged-in user can invoke GET/POST/PUT/DELETE against **any** path segment under the media-plans Xano base, with server `XANO_API_KEY` attached:

```17:31:app/api/media_plans/[...path]/route.ts
  const targetBase = xanoUrl(path, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  ...
      ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  ...
  const upstream = await fetch(url.toString(), init)
```

No `auth0.getSession`, `requireAdmin`, or `checkClientMbaAccess` before fetch.

---

**C2 — Catch-all media-details proxy (same pattern)**  
**Confidence: 95%**  
**File:** `app/api/media-details/[...path]/route.ts`

```14:33:app/api/media-details/[...path]/route.ts
    const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
    ...
    const upstream = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json"
      },
```

No caller identity or tenant check; supports all HTTP methods.

---

**C3 — `GET /api/mediaplans` returns all clients' media plans to any authenticated user**  
**Confidence: 98%**  
**File:** `app/api/mediaplans/route.ts`

Fetches full Xano tables (see §4); no per-caller filter. Client-role users with a valid session can enumerate cross-tenant plans.

---

### HIGH

**H1 — MBA mutation routes skip `checkClientMbaAccess` (GET-only enforcement)**  
**Confidence: 97%**  
**File:** `app/api/mediaplans/mba/[mba_number]/route.ts`

GET enforces access:

```726:727:app/api/mediaplans/mba/[mba_number]/route.ts
    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response
```

`PUT` (line 1266) and `PATCH` (line 1516) proceed directly to Xano without equivalent check — client (or any session) could mutate another tenant's plan if MBA is known.

---

**H2 — `GET /api/dashboard/[slug]` has no tenant match for client users**  
**Confidence: 90%**  
**File:** `app/api/dashboard/[slug]/route.ts`

Returns dashboard for arbitrary `slug` parameter; no comparison to `getUserClientIdentifier(session.user)`.

---

**H3 — Finance and client admin APIs exposed to all authenticated sessions**  
**Confidence: 92%**  
**Files:** e.g. `app/api/finance/billing/route.ts`, `app/api/finance/data/route.ts`, `app/api/clients/route.ts`, `app/api/finance/edits/route.ts`

These aggregate or mutate sensitive billing/client data via Xano with middleware session only. No client-role block (unlike `finance/accrual` and `finance/forecast`).

---

**H4 — KPI campaign mutations without MBA access check**  
**Confidence: 93%**  
**File:** `app/api/kpis/campaign/route.ts`

GET uses `checkClientMbaAccess`; POST/PATCH/DELETE (lines 42–101) have no access helper — any session can create/update/delete KPI rows.

---

**H5 — Client user POST can create clients and media plans**  
**Confidence: 88%**  
**Files:** `app/api/clients/route.ts:123`, `app/api/mediaplans/route.ts:14`

Write operations to Xano with no staff-role gate; only middleware session required.

---

### MEDIUM

**M1 — Middleware documents but does not enforce API tenant isolation**  
**Confidence: 100%**  
**File:** `middleware.ts:44-46`

Explicit comment that tenant isolation must be handler-enforced; most handlers do not comply.

---

**M2 — `/api/cron/*` bypasses Auth0 middleware; relies solely on shared secret**  
**Confidence: 95%**  
**Files:** `middleware.ts:30`, `lib/auth/assertCronSecret.ts`

Acceptable if `CRON_SECRET` is strong and rotated; no defense-in-depth with session.

---

**M3 — `media-details` proxy omits `XANO_API_KEY` header**  
**Confidence: 85%**  
**File:** `app/api/media-details/[...path]/route.ts`

May depend on public Xano endpoints or network rules; inconsistent with `media_plans/[...path]` which sends the key.

---

**M4 — Pacing/Snowflake routes accept arbitrary line-item IDs without MBA scoping**  
**Confidence: 80%**  
**Files:** `app/api/pacing/search/route.ts`, `app/api/pacing/programmatic/*/route.ts`, `app/api/pacing/social/*/route.ts`

Session-only auth; client could query pacing for line items outside their MBA unless Snowflake data is inherently scoped (not verified in route layer). Contrast: `pacing/bulk` enforces MBA access.

---

**M5 — S1b-1 allowlist helper not found; only `ADMIN_EMAIL_ALLOWLIST` on one route**  
**Confidence: 90%**  
**File:** `app/api/admin/clients/refresh-slug/route.ts:16,34`

No global S1b-1 pattern; allowlist is route-specific via `requireAdmin(..., { allowEmails })`.

---

### LOW

**L1 — Development auth comments left in production paths**  
**Confidence: 85%**  
**Files:** `app/api/mediaplans/route.ts:16-17,102-103`, `app/api/clients/route.ts:95-96`, `app/api/mba/generate/route.ts:7-8`

Comments indicate session validation was deferred; middleware partially compensates but not for authorization.

---

**L2 — Env-gated `_debug` fields in pacing API responses**  
**Confidence: 95%**  
**Files:** `app/api/pacing/programmatic/display/route.ts`, etc.

Information disclosure when debug env vars enabled in production; not a separate route.

---

**L3 — `GET /api/kpis/publisher` without publisher param returns all publisher KPIs**  
**Confidence: 88%**  
**File:** `app/api/kpis/publisher/route.ts:24-25`

`fetchAllPublisherKpis()` when `publisher` query omitted; session-only.

---

**L4 — Auth routes live outside `app/api/`**  
**Confidence: 100%**  
**File:** `app/auth/[auth0]/route.ts`

Not in scope table; handled by Auth0 SDK + middleware `/auth` bypass.

---

## Appendix — Auth helper reference

| Helper | Location | Behaviour |
|--------|----------|-----------|
| `auth0.getSession(request)` | `@/lib/auth0` | Returns Auth0 session |
| `requireAdmin` / `requireRole` | `@/lib/requireRole` | Session + role (optional email allowlist) |
| `checkClientMbaAccess` | `@/lib/auth/checkClientMbaAccess` | Client users: MBA list or slug→mbaidentifier prefix; staff pass through |
| `requirePacingAccess` | `@/lib/pacing/pacingAuth` | Session + tenant client-ID scope from `client_slugs` (admin / no slugs → unscoped) |
| `assertCronSecret` | `@/lib/auth/assertCronSecret` | Cron shared secret |
| `getUserRoles`, `getUserClientIdentifier` | `@/lib/rbac` | Role and tenant slug from session |

---

## Recommendations (informational — no changes made)

1. Remove or heavily restrict catch-all proxies; replace with explicit allowlisted endpoints.
2. Add `checkClientMbaAccess` (or equivalent) to all MBA-scoped reads **and writes**; add tenant slug checks to `/api/dashboard/[slug]`.
3. Scope `GET /api/mediaplans` by caller role/tenant; avoid full-table fetch for client users.
4. Apply staff-only gates to finance mutation routes and client/plan creation.
5. Align KPI campaign POST/PATCH/DELETE with GET access checks.
6. Document/rotate `CRON_SECRET`; consider IP allowlist for cron invocations.

---

*Discovery only — no application code modified. Report generated 2026-07-09 on branch `localhost`.*
