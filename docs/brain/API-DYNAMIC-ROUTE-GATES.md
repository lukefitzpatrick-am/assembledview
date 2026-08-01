# Dynamic API route gate inventory (O6 / SEC-10)

Input for the **T6 RLS** design decision on the two-role surface (`admin` | `client`).
Static code review — **SEC-G morning answers applied**; **live probe still pending**.

Generated on `localhost` (O6). Re-verify after any new `app/api/**/[param]/route.ts`.

## Legend

| Verdict | Meaning |
|---|---|
| OK | `[id]` gate matches (or is stricter than) the collection / peer |
| GATED (O6) | Was a clear GAP; gated with the sibling's existing helper |
| GATED (SEC-G) | Was AMBIGUOUS; gated per Luke's recorded morning answers |
| INTENTIONAL | Split vs collection is deliberate — do not "align" by applying collection `requireRole` |
| N/A | Catch-all / signed URL / intentional no-session pattern |

Helpers in play: `requireRole` / `requireAdmin` / `requireFinanceAdmin` / `checkClientMbaAccess` / `resolveClientMbaScope`.

## Inventory

| route | method | collection / peer | collection gate | [id] gate | verdict |
|---|---|---|---|---|---|
| `scopes-of-work/[id]` | GET | `scopes-of-work` GET | `requireRole(admin)` | `requireRole(admin)` | **GATED (O6)** |
| `scopes-of-work/[id]` | PUT | `scopes-of-work` POST | `requireRole(admin)` | `requireRole(admin)` | **GATED (O6)** |
| `campaigns/[mba_number]` | GET | peer `mediaplans/mba/[mba_number]` | `checkClientMbaAccess` | `checkClientMbaAccess` | **GATED (O6)** |
| `campaigns/[mba_number]/billing-schedule` | GET | same peer | `checkClientMbaAccess` | `checkClientMbaAccess` | **GATED (O6)** |
| `mediaplans/[id]/mbanumber` | POST | `mediaplans` POST | `requireRole(admin)` | `requireRole(admin)` | **GATED (O6)** |
| `publishers/[publisherId]` | GET | `publishers` GET | session (middleware) | session (middleware) | OK |
| `publishers/[publisherId]` | PUT | `publishers` POST | `requireRole(admin)` | `requireRole(admin)` | **GATED (SEC-G)** |
| `media-container-best-practice/[id]` | PUT | collection POST | `requireRole(admin)` + audit stamp | `requireRole(admin)` + audit stamp | **GATED (SEC-G)** |
| `media_plans/television/[id]` | PUT | catch-all peer | `requireRole(admin)` | `requireRole(admin)` | **GATED (SEC-G)** |
| `media_plans/television/[id]` | DELETE | catch-all peer | `requireRole(admin)` | `requireRole(admin)` | **GATED (SEC-G)** |
| `media_plans/television` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual |
| `media_plans/social` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/newspaper` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/influencers` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/integration` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/search` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/cinema` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/production` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/prog-video` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/digi-bvod` | POST | catch-all peer | `requireRole(admin)` | — | **GATED (SEC-G)** residual (sibling inventory) |
| `media_plans/[...path]` | * | catch-all | — | `requireRole(admin)` | N/A |
| `media-details/[...path]` | * | catch-all | — | `requireRole(admin)` | N/A |
| `codex/tasks/[id]` | PATCH | `codex/tasks` | `requireCodexInternalAccess` | same | OK |
| `dashboard/[slug]` | GET | client dashboard | — | session + slug / admin | OK |
| `dashboard/[slug]/delivered` | GET | same | — | session + slug / admin | OK |
| `mediaplans/mba/[mba_number]` | GET/PUT/PATCH | `mediaplans` list | scope / `requireRole` | `checkClientMbaAccess` | OK |
| `mediaplans/mba/[mba_number]/expected-spend-to-date` | GET | MBA peer | `checkClientMbaAccess` | cookie-forwards to gated MBA | OK |
| `mediaplans/mba/[mba_number]/material-instructions` | GET/POST | MBA peer | `checkClientMbaAccess` | session + admin (inline) | OK |
| `mediaplans/[id]/download` | GET | generate-pdf | `requireRole(admin)` | `requireRole(admin)` | OK |
| `mediaplans/versions/[id]/billing-schedule` | PATCH | finance peers | `requireFinanceAdmin` | `requireFinanceAdmin` | OK |
| `mediaplans/versions/[id]/documents` | POST | download / pdf | `requireRole(admin)` | `requireRole(admin)` | OK |
| `creative-assets/[id]` | GET/PATCH/DELETE | `creative-assets` | session + `checkClientMbaAccess` (all roles) | same | OK (SEC-G soft-spot closed) |
| `creative-assets/[id]/download` | GET | collection | session + `checkClientMbaAccess` | same | OK |
| `creative-assets/[id]/preview/[[...path]]` | GET | collection | session + `checkClientMbaAccess` | same | OK |
| `creative-assets/[id]/frame` | GET | — | — | signed token | N/A |
| `finance/billing/[id]` | PATCH | `finance/billing` | `requireFinanceAdmin` | `requireFinanceAdmin` | OK |
| `finance/billing/line-items/[id]` | PATCH/DELETE | line-items collection | `requireFinanceAdmin` | `requireFinanceAdmin` | OK |
| `finance/forecast/snapshots/[id]/lines` | GET | snapshots list | session + admin (inline) | session + admin (inline) | OK |
| `planning/audiences/[id]` | GET/PATCH | `planning/audiences` | `requireRole(admin)` | `requireRole(admin)` | OK |
| `clients/[id]` | PUT/PATCH | `clients` POST | `requireRole(admin)` | `requireRole(admin)` | OK |
| `clients/[id]` | GET | `clients` GET | `requireRole(admin)` | session + client own-id (admin any-id) | **INTENTIONAL** |

**Counts:** 27 dynamic route files; O6 gated 5 methods; SEC-G gated publishers/best-practice/television writes + creative soft-spot + 10 dedicated channel collection POSTs (residual close); `clients/[id]` GET stays intentional split. `prog-ooh` / `prog-display` dedicated routes are GET-only (no POST to gate).

## Morning answers (SEC-G — applied)

1. **`publishers/*`** — writes (`POST` / `PUT`) → `requireRole(admin)`; GETs stay session-auth (reference data for create/edit).
2. **`media-container-best-practice/*`** — writes (`POST` / `PUT`) → `requireRole(admin)`; keep `_name` audit stamp after the gate; reads stay session-auth.
3. **`media_plans/television/[id]`** PUT+DELETE → `requireRole(admin)` to match catch-all. Only dedicated channel `[id]` mutate path in inventory. Verified: no client-role call site writes channel line items (`replaceChannelLineItems` → catch-all; `createTelevisionLineItem` / update / delete are dead exports). **Residual closed:** dedicated collection `POST` on `television` + nine sibling channel collection POSTs (`social`, `newspaper`, `influencers`, `integration`, `search`, `cinema`, `production`, `prog-video`, `digi-bvod`) now `requireRole(admin)` identically.
4. **`clients/[id]` GET** — **intentional split**: collection is admin-only; `[id]` GET allows admin any-id + client own-id only. Do not apply collection `requireRole` (breaks client self-read).
5. **Creative soft-spot** — all creative MBA-scoped handlers call `checkClientMbaAccess`; helper itself now scopes **only admin** as unscoped (empty `mba_numbers` on non-admin → 403). Closes empty-MBA non-admin sessions across every consumer of the helper.
6. **Forecast snapshots** — deferred (not in SEC-G apply list).
7. **Codex** — deferred (keep `requireCodexInternalAccess`).

## T6 RLS implications (two-role surface)

- **Admin:** staff tools (SOW, MBA mint, finance, planning audiences, catch-alls, publisher/best-practice writes) → role gate today; Postgres RLS later likely `admin` bypass or service role.
- **Client:** MBA-scoped reads (campaigns, mediaplans/mba, creative, pacing, dashboard slug) → `checkClientMbaAccess` / slug match today; RLS later must encode MBA membership (`mba_numbers` / identifier), not only `role=client`.
- **Reference data** (publishers, best-practice): clients may read (session-auth); only admins write — drives both API gates and RLS policies.
- Live matrix (auth / client foreign / admin) still owed for O6 + SEC-G gates — extend the existing ps1 probe harness when cookies are re-provided.
