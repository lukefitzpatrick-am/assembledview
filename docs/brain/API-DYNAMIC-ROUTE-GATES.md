# Dynamic API route gate inventory (O6 / SEC-10)

Input for the **T6 RLS** design decision on the two-role surface (`admin` | `client`).
Static code review only — **live probe pending** (cookies rotated; Luke re-probes in the morning).

Generated on `localhost` (O6). Re-verify after any new `app/api/**/[param]/route.ts`.

## Legend

| Verdict | Meaning |
|---|---|
| OK | `[id]` gate matches (or is stricter than) the collection / peer |
| GATED (O6) | Was a clear GAP; gated this commit with the sibling's existing helper |
| AMBIGUOUS | Collection also ungated, or right scope unclear — **do not invent**; morning questions |
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
| `publishers/[publisherId]` | GET | `publishers` GET | NONE | NONE | AMBIGUOUS |
| `publishers/[publisherId]` | PUT | `publishers` POST | NONE | NONE | AMBIGUOUS |
| `media-container-best-practice/[id]` | PUT | collection POST | NONE (audit stamp only) | NONE (audit stamp only) | AMBIGUOUS |
| `media_plans/television/[id]` | PUT | `media_plans/television` POST | NONE | NONE | AMBIGUOUS |
| `media_plans/television/[id]` | DELETE | channel sibling | NONE | NONE | AMBIGUOUS |
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
| `creative-assets/[id]` | GET/PATCH/DELETE | `creative-assets` | session + MBA (clients) | session + MBA (clients) | OK |
| `creative-assets/[id]/download` | GET | collection | session + MBA (clients) | session + MBA (clients) | OK |
| `creative-assets/[id]/preview/[[...path]]` | GET | collection | session + MBA (clients) | session + MBA (clients) | OK |
| `creative-assets/[id]/frame` | GET | — | — | signed token | N/A |
| `finance/billing/[id]` | PATCH | `finance/billing` | `requireFinanceAdmin` | `requireFinanceAdmin` | OK |
| `finance/billing/line-items/[id]` | PATCH/DELETE | line-items collection | `requireFinanceAdmin` | `requireFinanceAdmin` | OK |
| `finance/forecast/snapshots/[id]/lines` | GET | snapshots list | session + admin (inline) | session + admin (inline) | OK |
| `planning/audiences/[id]` | GET/PATCH | `planning/audiences` | `requireRole(admin)` | `requireRole(admin)` | OK |
| `clients/[id]` | PUT/PATCH | `clients` POST | `requireRole(admin)` | `requireRole(admin)` | OK |
| `clients/[id]` | GET | `clients` GET | `requireRole(admin)` | session + client own-id | AMBIGUOUS |

**Counts:** 27 dynamic route files; **5** methods gated in O6; remainder OK / AMBIGUOUS / N/A.

## Morning questions (ungated-but-flagged — do not guess)

1. **`publishers/*`** — collection and `[id]` both ungated. Should writes become `requireRole(admin)` while list stays session-auth (reference data for create/edit), or gate both?
2. **`media-container-best-practice/*`** — same pattern; `getCurrentUser` is audit stamp only.
3. **`media_plans/television/[id]`** (and any other dedicated channel `[id]` mutate paths) — sibling channel POSTs also ungated, but catch-all `[...path]` is staff-gated. Intentional escape hatch or hole?
4. **`clients/[id]` GET** — client self-read by own Auth0 client id is intentional; applying collection `requireRole` would break it. Confirm split stays: admin via role, client own-id only.
5. **Creative soft-spot** — non-admin / non-client sessions with empty MBA assignment: tighten all roles through `checkClientMbaAccess`, or clients-only (current)?
6. **Forecast snapshots** — align inline admin check to `requireFinanceAdmin`?
7. **Codex** — keep `requireCodexInternalAccess` or migrate to `requireRole`/`requireAdmin`?

## T6 RLS implications (two-role surface)

- **Admin:** staff tools (SOW, MBA mint, finance, planning audiences, catch-alls) → role gate today; Postgres RLS later likely `admin` bypass or service role.
- **Client:** MBA-scoped reads (campaigns, mediaplans/mba, creative, pacing, dashboard slug) → `checkClientMbaAccess` / slug match today; RLS later must encode MBA membership (`mba_numbers` / identifier), not only `role=client`.
- **Reference data** (publishers, best-practice): decide whether clients may read ungated and only admins write — that decision drives both API gates and RLS policies.
- Live matrix (auth / client foreign / admin) still owed for the five O6 gates — extend the existing ps1 probe harness when cookies are re-provided.
