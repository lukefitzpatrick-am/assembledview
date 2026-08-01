# Clients surface merge — current state, target, redirect map and risks

> **Status:** draft plan (no implementation). Evidence lines are from HEAD at authorship (`04a324dc` era; re-verify before coding).
>
> **For agentic workers:** Do **not** implement from this doc until Luke scopes. When implementing, use superpowers:subagent-driven-development or executing-plans and re-grep guards — tenant fencing is security-critical.

**Goal:** Merge the admin Client hub + “Client Dashboards” expander and the tenant `/dashboard/[slug]` home into **one** Clients surface under `/client/[slug]` with tabs, without breaking tenant isolation.

**Architecture (proposed):** Keep `/client` as the admin multi-client index. Collapse per-client admin hub (`/client/[slug]`) and tenant home (`/dashboard/[slug]`) into one page shell with role-gated tabs. Campaign MBA detail (`/dashboard/[slug]/[mba_number]`) and creative (`/dashboard/[slug]/creative`) stay out of scope unless Luke expands it.

**Tech stack:** Next.js App Router, Auth0 + `lib/rbac` / `middleware.ts`, shared `ClientDashboardPageContent`, slide-overs under `components/dashboard/modals/`.

---

## 1. What each surface renders today

### `/client` — admin Client hub (list)

| Layer | Evidence |
|-------|----------|
| Route | `app/client/page.tsx:6–8` — SSR `getClientHubSummariesForAdminHub()` → `ClientHubPageClient` |
| Guard | `app/client/layout.tsx:6–7` — entire tree wrapped in `AdminGuard` |
| UI | `app/client/ClientHubPageClient.tsx:67–92` — “Client hub” hero, search, list/grid toggle, add-client |
| Cards / rows | `app/client/ClientHubCard.tsx:17–18` and hub table links → `/client/{slug}` (`ClientHubPageClient.tsx:159`) |

Renders an **alphabetical client index** (spend + live campaign counts). Does **not** reuse `ClientDashboardPageContent`.

### `/client/[slug]` — admin per-client hub detail

| Layer | Evidence |
|-------|----------|
| Route | `app/client/[slug]/page.tsx:16–66` |
| Auth | Session required (`:28–32`); non-admin → `redirect('/dashboard')` (`:33–36`) — comment: match AdminGuard, never ship full client row to tenants |
| Data | `getClientDashboardData` + `fetchXanoClientRowByUrlSlug` + `fetchClientById` → **`clientRecord` embedded** (`:38–62`) |
| UI | Same `ClientDashboardPageContent` with `campaignLinkMode="adminHub"` and `headerDescription="Client hub — campaign dashboard"` (`:59–65`) |

### “Client Dashboards” expander (sidebar, admin only)

| Layer | Evidence |
|-------|----------|
| Placement | Under Deliver group after `/client` nav row — `components/AppSidebar.tsx:252–300` |
| Links | Each client → `/client/${slug}` (`:283`) |
| Active | `clientDashboardsSectionActive = /^\/client\/[^/]+/` (`:163`) |
| Data | Clients loaded via `/api/clients` for admin sidebar (`:114`) |

This is **not a separate route** — it is navigation into `/client/[slug]`.

### `/dashboard/[slug]` — tenant (and admin-browsable) client home

| Layer | Evidence |
|-------|----------|
| Route | `app/dashboard/[slug]/page.tsx:27–122` |
| Tenant fence | If `role === 'client'`: missing slug → `notFound()`; other slug → `notFound()` (`:51–68`) |
| Admin | No extra admin gate — admins may open any slug |
| Data | `getClientDashboardData` + logo only; comment: **never ship `clientRecord` into RSC props** (`:82–84`) |
| UI | `ClientDashboardPageContent` with `campaignLinkMode="tenant"` (default) (`:116–121`) |
| Errors | Explicit `ErrorState` / `EmptyState` (`:93–113`) vs hub’s `notFound()` |

Related (out of merge core, but same slug tree):

- `/dashboard/[slug]/creative` — tenant-checked creative picker (`app/dashboard/[slug]/creative/page.tsx:31–38`).
- `/dashboard/[slug]/[mba_number]` — campaign dashboard; client role also MBA-allowlist checked (`app/dashboard/[slug]/[mba_number]/page.tsx:342–378`).

### Shared vs duplicated vs divergent

**Shared (one component, two call sites):**

- `components/dashboard/ClientDashboardPageContent.tsx` — both `/client/[slug]` and `/dashboard/[slug]`.
- Downstream: `HeroBanner`, `HeroKPIBar`, `CampaignStatusPills`, `CampaignCardCompact`, `SpendingInsightsSection`, `UpcomingCampaignsSection`, delivered fetch to `/api/dashboard/[slug]/delivered`.

**Duplicated at the page layer (not the UI tree):**

- Parallel server pages both call `getClientDashboardData` + FY `searchParams` parsing (`app/client/[slug]/page.tsx:22–26` vs `app/dashboard/[slug]/page.tsx:29–33`).
- Parallel tenant/role checks vs admin-only checks (different semantics — see §2).

**Divergences driven by `campaignLinkMode` (`ClientDashboardPageContent.tsx:36–42, 116–122, 228`):**

| Behaviour | `adminHub` (`/client/[slug]`) | `tenant` (`/dashboard/[slug]`) |
|-----------|-------------------------------|--------------------------------|
| Edit media plans from cards | `canEdit` true (`:99`) | false |
| `clientRecord` / brain | Hub/admin hero rail → `ClientBrainSlideOver` / `ClientBrainPanel`; passed into hero | Not passed from page; brain omitted |
| Hero layout | `clientHubLayout` — hide benchmark/ROAS chrome (`HeroBanner.tsx:32–33, 69–70`); profile links when admin (`:70`) | Default tenant hero |
| KPI extras | `campaignsYtd` tiles (`ClientDashboardPageContent.tsx:337–338`) | omitted |
| Slide-overs (Details / Finance / KPIs) | Mounted when `isAdmin` from mode (`:447–484`) | **Not mounted** (`isAdmin === false` even if Auth0 user is admin) |
| Finance slide-over | `variant="clientHub"` + Excel/billing extras (`:461–468`) | N/A on this page |
| Card copy | “View campaign dashboard” (`:410–411`) | “View campaign” |
| Inline edit button | Hidden on hub (`showInlineEditButton={!isClientHub}` `:409`) | Shown when `canEdit` (false for tenants) |

**Campaign deep links always go to tenant campaign URLs** — `buildCampaignViewHref` → `/dashboard/{slug}/{mba}` (`:75–76`), regardless of hub vs tenant mode.

---

## 2. Tenant fencing map (do not get this wrong)

### Who reaches what

| Surface | Client role | Admin role |
|---------|-------------|------------|
| `/client` | **Blocked** — layout `AdminGuard` → `/dashboard` (`components/guards/AdminGuard.tsx:33–34`); middleware also redirects any non-`/dashboard*` path for clients (`middleware.ts:105–109`) | Allowed |
| `/client/[slug]` | **Blocked** — page `hasRole(admin)` else `redirect('/dashboard')` (`app/client/[slug]/page.tsx:33–36`) + layout `AdminGuard` + middleware | Allowed; full `clientRecord` |
| Sidebar “Client Dashboards” | Not rendered (admin sidebar only) | Links to `/client/{slug}` |
| `/dashboard/[slug]` | **Allowed only if** `userClientSlug === slug` (case-insensitive); else `notFound()` (`app/dashboard/[slug]/page.tsx:51–68`) | Allowed any slug; **without** shipping `clientRecord` |
| `/dashboard/[slug]/creative` | Same slug match (`creative/page.tsx:31–38`) | Any slug |
| `/dashboard/[slug]/[mba_number]` | Slug match + optional MBA allowlist (`[mba_number]/page.tsx:342–378`) | Any (subject to data) |
| Client nav home | `/dashboard/{userClient}` (`AppSidebar.tsx:148–151`) | N/A (admin uses hub) |

Middleware summary for clients (`middleware.ts:87–110`):

1. No client slug claim → `/unauthorized`.
2. `/` or `/dashboard` → `/dashboard/{clientSlug}`.
3. Other `/dashboard/...` → only own slug prefix; else bounce to own base.
4. `/knowledge`, `/forbidden`, `/unauthorized` allowed.
5. **Everything else** (including `/client` and `/client/...`) → `/dashboard/{clientSlug}`.

### API fencing (shared data plane)

`GET /api/dashboard/[slug]` and `/delivered` (`app/api/dashboard/[slug]/route.ts:17–27`, delivered route same pattern):

- No session → 401.
- Admin → unscoped.
- Non-admin → must have `getUserClientSlugs` containing requested slug; else **403**.

Hub list data: `getClientHubSummariesForAdminHub` (`lib/api/dashboard/client.ts:971–974`) is only called from the AdminGuard-wrapped `/client` page — still treat as admin-only at the route boundary.

### Security implication for the merge

If the unified URL is `/client/[slug]` and **client users** are pointed there, you **must**:

1. Change middleware to allow `/client/{theirSlug}` (and only that slug).
2. Replace “admin-only or redirect” on the page with **role-aware** loading: never pass `clientRecord` / brain / edit forms to client roles (today’s tenant page law at `app/dashboard/[slug]/page.tsx:82–84`).
3. Keep API slug checks; do not weaken them.
4. Keep campaign MBA routes on their current fences unless separately redesigned.

Getting (1) without (2) would expose admin hub fields (brain, editable client row, finance Excel) across tenants or to the wrong role.

---

## 3. Proposed target tabs — components and existence

**Target:** one `/client/[slug]` with tabs: Overview / Campaigns / Finance / KPIs / Details.

| Tab | Intended content | Supplying component(s) today | Exists? |
|-----|------------------|------------------------------|---------|
| **Overview** | Hero, KPI bar, spending insights; brain via hub/admin slide-over | `HeroBanner`, `HeroKPIBar`, `SpendingInsightsSection`, `ClientBrainSlideOver` (hub/admin rail) — composed in `ClientDashboardPageContent` | **Yes** (composed; not a standalone Overview tab shell) |
| **Campaigns** | Status pills + campaign card grid + upcoming | Same file `:346–442` (`CampaignStatusPills`, `CampaignCardCompact`, `UpcomingCampaignsSection`) | **Yes** (section, not tab) |
| **Finance** | FY / quarter / billing | `ClientFinanceSlideOver` → `UpcomingBillingSection`, `ClientFinanceExcelExportDialog` (`components/dashboard/modals/ClientFinanceSlideOver.tsx`, `components/client-hub/*`) | **Yes** as **slide-over**, not a full-page tab; hub variant richer |
| **KPIs** | Client + publisher KPI editors | `ClientKpiSlideOver` → `ClientKpiSection` | **Yes** as **slide-over** |
| **Details** | Editable client profile | `ClientDetailsSlideOver` → `EditClientForm` | **Yes** as **slide-over** |

**Does not exist today:** a tabbed `/client/[slug]` chrome, URL-driven `?tab=` (or segment) routing, or role-gated tab visibility matrix.

**Greeting note:** `HeroBanner.tsx:146` always titles `Welcome back, ${clientName}` — used for both hub and tenant. Hub passes `headerDescription` but it only toggles a no-op ternary on `clientName` (`ClientDashboardPageContent.tsx:300`) — the string is **not** shown as subtitle.

---

## 4. Full redirect map (proposed)

Assume final per-client URL is `/client/[slug]` (tabs via `?tab=` or `/client/[slug]/[tab]` — **Luke to pick**; map below uses `?tab=`).

| Old URL | New URL | Notes |
|---------|---------|-------|
| `/client` | `/client` | **Keep** as admin index (hub list). No change. |
| `/client/[slug]` | `/client/[slug]` (default tab Overview) | Same path; behaviour gains tabs + optional tenant access. |
| `/client/[slug]?fy=YYYY` | `/client/[slug]?fy=YYYY` | Preserve FY (`page.tsx` already reads `fy`). |
| `/dashboard/[slug]` | `/client/[slug]` | **Core merge redirect** (308/permanent once stable). |
| `/dashboard/[slug]?fy=YYYY` | `/client/[slug]?fy=YYYY` | |
| `/dashboard/[slug]?status=planned` | `/client/[slug]?tab=campaigns&status=planned` | Today `status` is **ignored** on `/dashboard/[slug]` (searchParams typed as `fy` only — `app/dashboard/[slug]/page.tsx:14`). Redirect should start **honouring** status on Campaigns tab. |
| `/dashboard/[slug]/creative` | **Keep** `/dashboard/[slug]/creative` **or** `/client/[slug]/creative` | Out of tab set; decide in sequencing. Default recommendation: **keep path**, update client nav later. |
| `/dashboard/[slug]/[mba_number]` (+ `?version` / date range) | **Keep** | Campaign detail is not the merged “Clients” surface. Card links already target this (`ClientDashboardPageContent.tsx:75–76`). |
| `/dashboard` | Still role-specific router (`app/dashboard/page.tsx`) | After merge, client branch that lands on `/dashboard/{slug}` should land on `/client/{slug}` instead. |
| Sidebar Client Dashboards → `/client/{slug}` | unchanged | Already target hub. |
| Hub cards/rows → `/client/{slug}` | unchanged | |
| Client-role sidebar home → `/dashboard/{slug}` | `/client/{slug}` | `AppSidebar.tsx:151` — must move with redirects. |
| Command palette client home | `/dashboard/{userClient}` (`lib/nav/routeManifest.ts` ~902 / `CommandPalette`) | Retarget with client nav. |
| Manifest paths `/dashboard/[slug]` vs `/client/[slug]` | Update labels/roles | `lib/nav/routeManifest.ts:400–432` |

### Cannot fully enumerate (flag)

| Source | Why |
|--------|-----|
| Browser bookmarks / Slack pastes | User-generated |
| Auth0 `returnTo` already issued | Login links may still point at `/dashboard/...` until sessions age out — redirects cover this if left in place |
| Email bodies / SendGrid templates outside repo | `lib/email` has **no** `/dashboard/` or `/client/` path hits in-repo; production templates not greppable here |
| Rows in Xano/Postgres storing absolute app URLs | No audited `href` column inventory in this pass — **run a DB search before cutting redirects** |
| External ops docs / Notion | Outside repo |
| AVA route parsers | `docs/brain/modules/ava.md` notes `deriveAvaIdentifiers` regex on `/dashboard/*` — changing reserved segments breaks AVA; keep `/dashboard/[slug]/[mba]` stable |

---

## 5. What breaks if merged carelessly

1. **“View all campaigns →” leaves the hub for the tenant surface**  
   `ClientDashboardPageContent.tsx:358–362` links to `/dashboard/{slug}` even when the user is already on `/client/{slug}`. After merge this must become in-page Campaigns tab (or same-URL hash), not a cross-surface hop.

2. **`?status=planned` is ignored**  
   `UpcomingCampaignsSection` `viewAllHref` (`:441`) appends `?status=planned`, but `/dashboard/[slug]` only accepts `fy` (`page.tsx:14`) and `ClientDashboardPageContent` does not read URL status — pills are local state (`:152–160`). Merging without wiring `status` → `activeStatus` preserves a known lie.

3. **“Welcome back, {clientName}” on an admin page**  
   `HeroBanner.tsx:146` — admins on hub see a client-portal greeting. Merge should introduce role-aware title (e.g. client name only / “Client overview”) for admin tabs.

4. **Payload asymmetry**  
   Hub injects `clientRecord`; tenant deliberately strips it. Unifying the route without a role branch reintroduces SEC-class leakage.

5. **Middleware fail-closed**  
   Clients cannot stay on `/client/*` today (`middleware.ts:107–109`). Pointing them at `/client/[slug]` without middleware + page dual-fence = bounce loop or over-exposure.

---

## 6. Risk list (ordered) — one-line mitigations

1. **Cross-tenant data exposure via unified `/client/[slug]`** — Keep slug equality checks for client role; never serialize `clientRecord`/brain/edit forms unless `hasRole(admin)`; mirror API `getUserClientSlugs` checks.  
2. **Middleware allows `/client` list for clients** — Allowlist only `/client/{exactSlug}` (and tab paths), never `/client` index.  
3. **Admin features visible to clients (Finance Excel, EditClientForm, KPI write UI)** — Tab visibility + server components that omit admin-only props; API routes already role-gated must stay.  
4. **Broken bookmarks to `/dashboard/[slug]`** — Permanent redirects + leave `/dashboard/[slug]` as thin redirect for one release.  
5. **Silent `?status=` still ignored** — Implement status→tab/pill sync in the same PR that redirects those URLs.  
6. **Campaign cards / pacing / mediaplans still deep-link `/dashboard/.../mba`** — Keep MBA routes; only redirect the **home** slug URL.  
7. **AVA / analytics path assumptions on `/dashboard/`** — Do not rename MBA or creative segments without updating `deriveAvaIdentifiers` and any path-based telemetry.  
8. **Double chrome (slide-overs + tabs) during migration** — Delete slide-over entry points once tabs ship; one navigation pattern.  
9. **FY + tab query param collisions** — Single searchParams contract (`fy`, `tab`, `status`); document in manifest.  
10. **Sidebar IA duplication (Clients link + expander + tenant home)** — Collapse expander into `/client` children or tabs after URL stability; one active state helper.

---

## 7. Sequencing recommendation

### Can ship independently

| Slice | Why safe alone |
|-------|----------------|
| **A. Copy / greeting fix** on hub (`Welcome back` → admin-appropriate title) | Visual only; no URL change |
| **B. Fix hub “View all campaigns” + `?status=`** to stay on `/client/[slug]` and honour status | Bugfix on current admin surface |
| **C. Extract tab panels as presentational splits** inside existing hub page (no tenant move) | Refactor behind AdminGuard |
| **D. Inventory DB/email absolute URLs** | Read-only discovery |

### Must ship together

| Bundle | Why atomic |
|--------|------------|
| **E. Tenant URL cutover** | Middleware allowlist for `/client/{slug}` + page role branch (record stripping) + client sidebar/palette hrefs + redirects from `/dashboard/[slug]` → `/client/[slug]` |
| **F. Redirects + status honouring** | Redirecting `?status=planned` without reading it recreates the lie on the new URL |
| **G. Manifest + brain** | `routeManifest` roles/labels and `docs/brain/modules/dashboards-charts-exports.md` in the same commit as URL behaviour |

### Suggested order

1. **B + A** (fix lies on current hub; cheap).  
2. **D** (unknown link inventory).  
3. **C** (tabs on admin hub only — still AdminGuard).  
4. **E + F + G** as one gated release (feature flag optional: `CLIENTS_UNIFIED_SURFACE`).  
5. Later optional: creative under `/client/[slug]/creative`; leave MBA on `/dashboard/...` unless product wants `/client/.../campaigns/[mba]`.

---

## Out of scope (this plan)

- Implementing redirects, tabs, or middleware changes.
- Merging `/dashboard/[slug]/[mba_number]` into Clients.
- Changing fee/pacing/`bursts_json` contracts.
- Renaming Auth0 claims or slug algorithms (`lib/clients/slug.ts`).
