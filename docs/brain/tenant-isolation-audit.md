# Tenant isolation audit — `app/api`

Static re-verification of every `app/api/**/route.ts` handler against the middleware contract: **middleware authenticates; handlers authorise**. Prepared for Graph / server-to-server callers (an unscoped handler is a data-exposure path, not a UI bug).

**Scope:** current `localhost` tree (post Xano→Supabase cutover). July findings are **re-checked**, not assumed.  
**No route/middleware/test changes** in the pass that produced this page.

**Inventory:** 162 `route.ts` files · **229** HTTP handlers (`export async function` × 217 + `export const GET` channel duals × 12) · 1 empty (`test/route.ts`).

---

## Legend

| Class | Meaning |
|---|---|
| **tenant-scoped** | Reads/writes client-owned data. Must resolve the caller's scope **server-side** and filter/deny. Trusting a client-supplied `client_id` / `mba_number` / `media_plan_version_id` / `lineItemIds` / slug **as AuthZ** is a **defect**. |
| **admin-only** | Staff gate (`requireRole(["admin"])`, `requireAdmin`, `requireFinanceAdmin`, `requireCodexInternalAccess`, or equivalent inline `roles.includes("admin")`). Book-wide access is intentional. |
| **public** | No Auth0 user session: `assertCronSecret`, or signed-token (`verifyFrameToken`). Cron bypasses middleware session by design. |

**Also marked in the table (not a fourth class):**

| Tag | Meaning |
|---|---|
| **session-ref** | Middleware session only; reference or self data (publishers catalogue, `/api/me`, best-practice reads). Not tenant-owned plan/finance/pacing rows. |
| **OK** | Tenant-scoped with server-side scope (or admin-unscoped by design inside the helper). |
| **DEFECT** | Tenant-owned data; AuthZ is missing or is the client-supplied key. |

Helpers:

| Helper | Role |
|---|---|
| `checkClientMbaAccess` | Per-MBA gate; admin unscoped; client via `mba_numbers` or `mbaNumberMatchesClientIdentifier` |
| `resolveClientMbaScope` | Same rules, list-friendly `allows(mba)` |
| `mbaNumberMatchesClientIdentifier` | Identifier↔MBA matcher (also used inside allocate/auth helpers — **not** a route gate by itself) |
| `requirePacingAccess` | Admin unscoped / client slug→client-id set |
| `requireRole` / `requireAdmin` / `requireFinanceAdmin` | Role gates |
| `requireCodexInternalAccess` | Codex staff surface |
| `assertCronSecret` | Cron / S2S secret |
| `verifyFrameToken` | Creative frame signed URL |

---

## Counts (handler methods)

| Class | Count | Notes |
|------:|------:|---|
| **admin-only** | **151** | Finance-admin, codex-internal, inline admin, catch-all proxies, staff plan save/PDF/KPI writes, creative DELETE (client blocked → admin-only on two-role surface) |
| **tenant-scoped** | **56** | **34 OK** · **22 DEFECT** |
| **public** | **16** | 15 cron methods + 1 signed frame |
| **session-ref** | **6** | `me`; publishers GET ×3; best-practice GET; spend-parity (soft-spot — 404 in prod) |

Recount check: 151 + 56 + 16 + 6 = **229**.

| Tenant AuthZ pattern (tenant-scoped only) | Count |
|---|---:|
| Server-side scope (`checkClientMbaAccess` / `resolveClientMbaScope` / `requirePacingAccess` / slug membership / cookie proxy) | **34** |
| **DEFECT — client-supplied key is AuthZ** | **22** |

| Helper usage (files that call / import) | Count |
|---|---:|
| `checkClientMbaAccess` | 21 |
| `resolveClientMbaScope` | 1 (`mediaplans` list) |
| `mbaNumberMatchesClientIdentifier` as **route gate** | 0 (inside `checkClientMbaAccess` / allocate helper only) |
| `requirePacingAccess` | 6 |
| Rolled-own tenant check (`getUserClientSlugs` / `getUserClientIdentifier`) | dashboard `[slug]*`, `clients/[id]` GET, chat-v2 tool scope |

Confidence on class totals: **~90%** — method bodies verified for P0/P1 defects and July items; finance thin wrappers / catch-all shared `requireProxyStaff` classified admin without per-method live probe. Channel routes use `export const GET =` (easy to miss in naive greps).

---

## July findings — re-verified

| July concern | Current verdict |
|---|---|
| Global spend endpoints | **Fixed.** `GET /api/dashboard/global-monthly-{client,publisher}-spend` → `requireRole(["admin"])`. |
| `/api/delivery/meta-adset` | **Fixed for clients.** Session + `checkClientMbaAccess` when `client`; non-admin non-client → empty; admin may omit MBA (book-wide by design). |
| `/api/clients*` | **Mostly fixed.** Collection GET/POST + `[id]` PUT/PATCH → `requireRole(["admin"])`. `[id]` GET is **intentional split** (admin any-id; client own-id via slug→row). Soft spot: unknown future non-admin/non-client roles would read any id (today `UserRole = admin \| client` only). |
| Publisher writes | **Fixed.** `POST /api/publishers`, `PUT /api/publishers/[publisherId]` → `requireRole(["admin"])`. GETs remain session-ref (SEC-G). |

---

## Defect list (ranked by exposure)

### P0 — cross-tenant read of live plan / delivery data (any authenticated session)

| # | Handler | Issue |
|---:|---|---|
| 1 | **`GET /api/media_plans`** | No role/tenant gate. Returns **book-wide** latest-per-MBA versions (`getCachedMediaPlanVersions`). |
| 2 | **`GET /api/media_plans/{channel}` ×12** | Shared `createChannelLineItemsGetHandler` — trusts query `mba_number` only; no `checkClientMbaAccess`. Channels: television, digi-bvod, social, search, prog-display, prog-video, prog-ooh, cinema, newspaper, influencers, integration, production. |
| 3 | **`POST /api/pacing/search`** | Session presence only. Body `lineItemIds` → Snowflake search pacing. Peers (`bulk`, prog/social POSTs) use `checkClientMbaAccess` + id prefix (SEC-7). |

### P1 — cross-tenant finance / approval mutate or read

| # | Handler | Issue |
|---:|---|---|
| 4 | **`GET /api/billing-overrides`** | `getCurrentUser` only; trusts `media_plan_version_id`. |
| 5 | **`POST /api/billing-overrides/replace_line`** | Session only; trusts body `mba_number` + version id — **writes** overrides. |
| 6 | **`POST /api/billing-overrides/reset_line`** | Same. |
| 7 | **`POST /api/billing-overrides/{refetch,working-dedupe}-anomaly`** | Session only; anomaly tooling on arbitrary version/MBA. |
| 8 | **`GET` / `PATCH /api/mba-line-approvals`** | Session only; trusts `mba_number` (+ version). PATCH writes approvals. |

### P2 — MBA mint / allocation without scope

| # | Handler | Issue |
|---:|---|---|
| 9 | **`GET /api/mediaplans/mbanumber`** | No session/role check in handler (middleware session only). Trusts `mbaidentifier`; reads all masters to allocate. Comment mentions `mbaNumberMatchesClientIdentifier` for **generation scoping**, not AuthZ. |

### Soft spots (not scored as full DEFECT under current two-role surface)

| Handler | Note | Confidence |
|---|---|---|
| `GET /api/dashboard/spend-parity` | No role gate; **404 in production**; non-prod returns book-wide parity. | 85% intentional tooling |
| `GET /api/clients/[id]` | Client own-id OK; any non-client session = any id. Fine while only `admin\|client`. | 80% |
| `DELETE /api/creative-assets/[id]` | Blocks `client` role only — no `checkClientMbaAccess`. Equivalent to admin-only today; docs in `API-DYNAMIC-ROUTE-GATES.md` claim check on DELETE (drift). | 88% |
| `GET/POST …/material-instructions` | Inline admin only; no MBA tenant check (staff product). | 90% admin-only by design |

---

## Proposed `/api/admin/*` grouping

Goal: put **cross-tenant reporting and ops** behind one namespace so role is enforced in one place (middleware path prefix **and** `requireAdmin` / `requireFinanceAdmin` in handlers). Tenant MBA surfaces stay under existing paths with `checkClientMbaAccess`.

| Move / keep | Target | Gate |
|---|---|---|
| `dashboard/global-monthly-*-spend` | `/api/admin/dashboard/global-monthly-*-spend` | `requireAdmin` (already admin) |
| `dashboard/spend-parity` | `/api/admin/dashboard/spend-parity` | `requireAdmin` + keep non-prod 404 or delete |
| `pacing/admin/orphans/*` | keep under `/api/pacing/admin/*` **or** `/api/admin/pacing/orphans/*` | already `requireAdmin` |
| Existing `/api/admin/*` (users, client-hub, migration-diffs, fee-snapshots, finance-periods, xano-mirror) | keep | already role-gated |
| Finance book-wide reads (`finance/data`, forecast, payables, …) | optional `/api/admin/finance/*` alias; keep current paths during migrate | `requireFinanceAdmin` |
| **Do not** move: `/api/mediaplans/mba/*`, creative MBA routes, pacing campaign tabs, dashboard `[slug]` — these are tenant-scoped |

**Also fix in place (not necessarily rename):**

1. Channel GETs + `GET /api/media_plans` → `checkClientMbaAccess` / `resolveClientMbaScope` (or admin-only if no client consumer).
2. `POST /api/pacing/search` → same gate as `/api/pacing/bulk`.
3. Billing-overrides + mba-line-approvals → `requireFinanceAdmin` **or** `checkClientMbaAccess` on MBA/version ownership.
4. `GET /api/mediaplans/mbanumber` → `requireRole(["admin"])` (create flow is staff) **or** `checkClientMbaAccess`-equivalent on identifier.

**S2S note:** Graph provisioning must not reuse cookie-session `/api/*` without a dedicated principal. Prefer `/api/admin/*` or `/api/cron`-style secret/m2m with explicit scopes — middleware today is Auth0 session for all non-cron `/api`.

---

## Full handler table

Path is under `/api/`. Gate column is the **effective** AuthZ (shared helpers counted). Scope column only for tenant-scoped.

### Admin namespace & users

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `admin/client-hub` | GET | admin-only | `requireAdmin` | — |
| `admin/clients/refresh-slug` | POST | admin-only | `requireAdmin` (+ email allowlist) | — |
| `admin/fee-snapshots/resnapshot` | POST | admin-only | `requireFinanceAdmin` | — |
| `admin/finance-periods/lock` | POST | admin-only | `requireRole(admin)` | — |
| `admin/finance-periods/run` | POST | admin-only | `requireRole(admin)` | — |
| `admin/migration-diffs` | GET | admin-only | `requireAdmin` | — |
| `admin/users` | GET, POST, PUT | admin-only | `requireAdmin` | — |
| `admin/xano-mirror/retry` | POST | admin-only | `requireAdmin` | — |

### Clients & publishers

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `clients` | GET, POST | admin-only | `requireRole(admin)` | — |
| `clients/[id]` | PUT, PATCH | admin-only | `requireRole(admin)` | — |
| `clients/[id]` | GET | tenant-scoped | rolled-own (`getUserClientIdentifier` + slug→id) | **OK** (client); admin any-id |
| `publishers` | GET | session-ref | middleware only | — |
| `publishers` | POST | admin-only | `requireRole(admin)` | — |
| `publishers/[publisherId]` | GET | session-ref | middleware only | — |
| `publishers/[publisherId]` | PUT | admin-only | `requireRole(admin)` | — |
| `publishers/check-id` | GET | session-ref | middleware only | — |

### Media plans (underscore = channel tables)

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `media_plans` | GET | tenant-scoped | **NONE** | **DEFECT** — book-wide |
| `media_plans/{channel}` ×12 | GET | tenant-scoped | **NONE** (`mba_number` query) | **DEFECT** |
| `media_plans/[...path]` | GET | admin-only / channel dual | `requireRole` on proxy; channel dual same as above when dedicated handler used inside catch-all | see catch-all |
| `media_plans/[...path]` | POST, PUT, DELETE | admin-only | `requireRole(admin)` + allowlist | — |

### Mediaplans (no underscore = masters / MBA)

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `mediaplans` | GET | tenant-scoped | `resolveClientMbaScope` (+ admin via `requireRole` path) | **OK** |
| `mediaplans` | POST | admin-only | `requireRole(admin)` | — |
| `mediaplans/mbanumber` | GET | tenant-scoped | **NONE** (`mbaidentifier`) | **DEFECT** |
| `mediaplans/[id]/mbanumber` | POST | admin-only | `requireRole(admin)` (410 retired) | — |
| `mediaplans/[id]/download` | GET | admin-only | `requireRole(admin)` | — |
| `mediaplans/generate-pdf` | POST | admin-only | `requireRole(admin)` | — |
| `mediaplans/mba/[mba_number]` | GET, PUT, PATCH | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `mediaplans/mba/[mba_number]/expected-spend-to-date` | GET | tenant-scoped | cookie-forward → gated MBA GET | **OK** (proxy) |
| `mediaplans/mba/[mba_number]/material-instructions` | GET, POST | admin-only | inline admin | — |
| `mediaplans/versions/[id]/billing-schedule` | PATCH | admin-only | `requireFinanceAdmin` | — |
| `mediaplans/versions/[id]/documents` | POST | admin-only | `requireRole(admin)` | — |
| `campaigns/[mba_number]` (+ billing-schedule) | GET | tenant-scoped | `checkClientMbaAccess` then 410 | **OK** (stub) |
| `campaigns/export-report` | POST | admin-only | `requireRole` + `checkClientMbaAccess` | — |
| `plans/drafts` | GET, PUT, DELETE | admin-only | `requireRole(admin)` | — |
| `plans/save` | POST | admin-only + MBA | `requireRole` + `checkClientMbaAccess` | MBA checked |
| `mba/generate` | POST | admin-only | `requireRole(admin)` | — |
| `processPlan` | POST | admin-only | inline admin | — |

### Billing overrides & line approvals

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `billing-overrides` | GET | tenant-scoped | `checkClientMbaAccess` (MBA from version id) | **OK** (SEC-13) |
| `billing-overrides/replace_line` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** (SEC-13) |
| `billing-overrides/reset_line` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** (SEC-13) |
| `billing-overrides/refetch-anomaly` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** (SEC-13) |
| `billing-overrides/working-dedupe-anomaly` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** (SEC-13) |
| `mba-line-approvals` | GET, PATCH | tenant-scoped | `checkClientMbaAccess` | **OK** (SEC-13) |

### Pacing & delivery

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `pacing/bulk` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `pacing/search` | POST | tenant-scoped | session only | **DEFECT** |
| `pacing/programmatic/{display,video}` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `pacing/social/{meta,tiktok}` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `pacing/{campaigns,social-campaigns,programmatic-campaigns,direct-campaigns,ad-serving-campaigns,overview}` | GET | tenant-scoped | `requirePacingAccess` | **OK** |
| `pacing/admin/orphans` | GET | admin-only | `requireAdmin` | — |
| `pacing/admin/orphans/live-line-items` | GET | admin-only | `requireAdmin` | — |
| `pacing/admin/orphans/assign` | POST | admin-only | `requireAdmin` | — |
| `delivery/meta-adset` | GET | tenant-scoped | `checkClientMbaAccess` (+ admin unscoped) | **OK** |

### Dashboard & exports

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `dashboard/[slug]` | GET | tenant-scoped | `getUserClientSlugs` / admin | **OK** |
| `dashboard/[slug]/delivered` | GET | tenant-scoped | same | **OK** |
| `dashboard/global-monthly-client-spend` | GET | admin-only | `requireRole(admin)` | — |
| `dashboard/global-monthly-publisher-spend` | GET | admin-only | `requireRole(admin)` | — |
| `dashboard/spend-parity` | GET | session-ref / soft | NONE (404 in prod) | soft-spot |
| `reports/download` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `mi/exports/download` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `naming/exports/download` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `naming/generate` | POST | admin-only | `requireRole(admin)` | — |
| `naming/summarise-tokens` | POST | admin-only | `requireRole(admin)` | — |

### Creative

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `creative-assets` | GET, POST | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `creative-assets/upload` | POST | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `creative-assets/[id]` | GET, PATCH | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `creative-assets/[id]` | DELETE | admin-only* | blocks client only | soft-spot |
| `creative-assets/[id]/download` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `creative-assets/[id]/preview/[[...path]]` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `creative-assets/[id]/frame` | GET | public | `verifyFrameToken` | — |
| `creative-assets/{ad-copy,live-mockup,search-copy}` | POST | admin-only | `requireRole(admin)` | — |

### Finance (staff book)

All finance handlers below are **admin-only** (`requireFinanceAdmin`, `requireRole(admin)`, or inline admin), including thin wrappers (`finance/sections/[...path]`, forecast snapshots/targets/variance, `xero-queue`, mark-billed, approve, unapprove, mark-exported, unmark-exported, notes). Middleware also fail-closes `/api/finance/sections*` to admin.

| Path group | Methods (summary) | Gate |
|---|---|---|
| `finance/accrual`, `periods`, `periods/sheet`, `xero-match*` | GET/POST as defined | `requireRole(admin)` |
| `finance/billing*`, `data`, `edits`, `hub-schedule-ytd`, `payables`, `publishers`, `receivables/*`, `saved-views`, `sow`, `sections*` | various | `requireFinanceAdmin` (or inline admin equivalent) |
| `finance/forecast*` | various | `requireRole` / inline admin |

### Planning, SOW, KPI, Codex, chat, misc

| Path | Methods | Class | Gate | Scope |
|---|---|---|---|---|
| `planning/audiences`, `audiences/[id]`, `audience`, `meta`, `insight`, `export-deck` | * | admin-only | `requireRole(admin)` | — |
| `planning/audiences/by-mba` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `scopes-of-work*` | * | admin-only | `requireRole(admin)` | — |
| `kpis/campaign` | GET | tenant-scoped | `checkClientMbaAccess` | **OK** |
| `kpis/campaign` | POST, PATCH, DELETE | admin-only | `requireRole(admin)` | — |
| `kpis/campaign/sync`, `kpis/client`, `kpis/publisher` | * | admin-only | `requireRole(admin)` | — |
| `codex/**` | * | admin-only | `requireCodexInternalAccess` | — |
| `chat-v2` | POST | admin-only | inline admin (+ session slugs for tools) | — |
| `me` | GET | session-ref | session (self) | — |
| `media-container-best-practice` | GET | session-ref | middleware | — |
| `media-container-best-practice` | POST | admin-only | `requireRole(admin)` | — |
| `media-container-best-practice/[id]` | PUT | admin-only | `requireRole(admin)` | — |
| `media-details/[...path]` | * | admin-only | `requireRole(admin)` + allowlist | — |

### Cron (public / S2S)

| Path | Methods | Class | Gate |
|---|---|---|---|
| `cron/codex-recurring` | GET, POST | public | `assertCronSecret` |
| `cron/creative-upload-digest` | GET | public | `assertCronSecret` |
| `cron/finance-lock` | GET, POST | public | `assertCronSecret` |
| `cron/finance-pre-run` | GET, POST | public | `assertCronSecret` |
| `cron/finance-run` | GET, POST | public | `assertCronSecret` |
| `cron/ops-health` | GET | public | `assertCronSecret` |
| `cron/pacing-digest` | GET | public | `assertCronSecret` |
| `cron/snapshot-checksum` | GET | public | `assertCronSecret` |
| `cron/xano-line-item-sync` | GET | public | `assertCronSecret` |
| `cron/xero-sync` | GET, POST | public | `assertCronSecret` |

### Empty

| Path | Notes |
|---|---|
| `test` | No handlers |

---

## Related brain pages

- Middleware contract: `middleware.ts` (API auth only; finance sections admin fail-closed).
- Prior dynamic-route inventory: [API-DYNAMIC-ROUTE-GATES.md](./API-DYNAMIC-ROUTE-GATES.md) (O6 / SEC-10; does not cover channel collection GETs or billing-overrides).
- Security register: [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) SEC-* (July items largely FIXED; this audit adds residual defects above).

**Suggested KNOWN-ISSUES follow-ups (not applied in this pass):** SEC-11 channel GETs + `media_plans` list; SEC-12 `pacing/search`; SEC-13 billing-overrides + mba-line-approvals; SEC-14 `mediaplans/mbanumber` AuthZ.
