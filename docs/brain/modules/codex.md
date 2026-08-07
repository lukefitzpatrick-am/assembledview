# Module: Codex (`/tasks`)

Postgres-native internal task ops for the Assembled Media team. Shadow phase: flag `CODEX_V2=on`, roles `CODEX_SHADOW_ROLES` (currently `admin` only). Naming: `lib/codex/**` is the Tasks domain, not AVA.

**Discipline:** live in Stage 0 for a fortnight; accumulate bugs in **Stage 0 observations** below; that list shapes the Stage 1 pack. Do not invent Stage 1 scope from speculation.

Related: `docs/brain/codex-client-id-fk.md` (DI-12), `docs/brain/fail-soft-consumers.md`, `docs/brain/codex-write-failure-static.md`, `docs/brain/codex-team-create-never-reached.md`.

---

## Stage 0 — what ships today

UI: `app/tasks/page.tsx` + `TasksPageClient.tsx` (list) and `app/tasks/[id]/page.tsx` + `TaskDetailClient.tsx` (detail). Flag off → server EmptyState "Codex is not enabled" (no client fetch). Flag on → three tabs on the list:

| Surface | Behaviour |
|---|---|
| **Tasks** | Flat **list** (TanStack) or **board** (dnd-kit columns for `backlog\|todo\|in_progress\|waiting\|done`). Shared filter state — switching view does not reset My Tasks / client / status / search / category. **Quick-add** bar (list + board): Enter creates `todo` assigned to me; inline `@assignee` `#client` `!high/!low` `due …` (Sydney) with chip preview — unmatched tokens stay in the title. **My week** saved view: assigned to me, due today..+7 Sydney, not done. Category filter. List **bulk select** → status / assignee / due. Row/card → `/tasks/[id]`. Modal create still available (optional **template** apply + **recurring_rule** seed). Soft delete via confirm. Deep link: `/tasks?task=<id>` → `/tasks/<id>`. Board drag → optimistic PATCH status (revert + toast). Cards show title, client, assignee, due (overdue critical), priority, checklist `done/total`. No swimlanes / WIP / extra statuses. Clients picker + quick-add fallback use `fetchClientsList` (empty + fail-soft → error, never "no clients"). |
| **Templates** | CRUD for `task_templates` + ordered `task_template_items` (checklist labels). Apply on task create copies labels into `task_checklist_items`. |
| **Team** | Roster table + `TeamMemberFormDialog` create/edit. |
| **Task detail** | `/tasks/[id]` — inline-editable title/description/status/priority/category/due/assignee/client/MBA; checklist (add/tick/reorder/delete + "N of M"); comments (newest last); activity from `codex_activity` (`entity_type=task`) with legible before→after diffs via `formatActivityDiff`. Failed inline saves restore previous value + destructive toast. |

**Default scope:** `mine=1` → `assignee_email = me OR created_by_email = me` (includes unassigned tasks I created). **All tasks** toggle clears that scope so null-assignee rows stay visible. Exact `assignee_email` filter still excludes unassigned by design (`resolveListAssigneeScope`).

**Filters:** client (`client_id`), status (multi), assignee (when not mine), text search on title (client-side `matchText`). Sort: `due_date` / API sorts `due_date_asc|desc`, `created_at_desc`. List responses include `checklist_done` / `checklist_total` (aggregated from `task_checklist_items`) for board cards.

**Pagination:** server-side `page` / `per_page` (UI uses `PER_PAGE = 100`). Soft-deleted rows excluded unless `include_deleted=1` (no Stage 0 trash UI).

**Clients for the picker:** `GET /api/clients`. Reads `x-warning: clients-unavailable` and surfaces ViewState error (not an empty select) — fail-soft invariant.

List shells use `ViewState` / `ViewStateBoundary` so fetch failure cannot render as "no tasks".

**Category:** `tasks.category` has no DB CHECK — app enforces `TASK_CATEGORIES` (`reporting | pacing | creative | finance | admin | meeting_followup | other`) on create/PATCH and in the detail UI.

---

## API surface and gate order

Routes under `app/api/codex/`:

| Method | Path | Repo |
|---|---|---|
| GET, POST | `/api/codex/tasks` | `listTasks`, `createTask` |
| GET, PATCH, DELETE | `/api/codex/tasks/[id]` | `getTask`, `updateTask`, `softDeleteTask` |
| GET, POST | `/api/codex/tasks/[id]/checklist` | `listChecklistItems`, `createChecklistItem` / `reorderChecklistItems` (`ordered_ids`) |
| PATCH, DELETE | `/api/codex/tasks/[id]/checklist/[itemId]` | `updateChecklistItem`, `deleteChecklistItem` |
| GET, POST | `/api/codex/tasks/[id]/comments` | `listComments`, `createComment` |
| DELETE | `/api/codex/tasks/[id]/comments/[commentId]` | `deleteComment` (no edit) |
| GET | `/api/codex/tasks/[id]/activity` | `listTaskActivity` (requires live task) |
| GET, POST | `/api/codex/team` | `listTeamMembers`, `createTeamMember` |
| PATCH | `/api/codex/team/[id]` | `updateTeamMember` |
| GET | `/api/codex/client_notes` | `listClientNotes` (read-only in Stage 0) |
| GET, POST | `/api/codex/templates` | `listTemplates`, `createTemplate` |
| GET, PATCH, DELETE | `/api/codex/templates/[id]` | `getTemplate`, `updateTemplate`, `deleteTemplate` |
| GET, POST | `/api/codex/templates/[id]/items` | `listTemplateItems`, `createTemplateItem` / `reorderTemplateItems` |
| PATCH, DELETE | `/api/codex/templates/[id]/items/[itemId]` | `updateTemplateItem`, `deleteTemplateItem` |
| GET, POST | `/api/cron/codex-recurring` | `runCodexRecurring` — `CRON_SECRET` gate (not Codex flag/auth matrix) |

Every handler: `codexFlagGuard()` then `requireCodexInternalAccess()` (`app/api/codex/_shared.ts`).

**Gate order (pinned by `lib/codex/__tests__/routes.flagAuth.test.ts`):**

1. Flag off (`CODEX_V2` ≠ `on`) → **404** `{ error: "not_found" }` — module invisible; not 403.
2. No session → **401** `{ error: "unauthorised" }`.
3. Session but role outside `CODEX_SHADOW_ROLES` → **403** `{ error: "forbidden" }`.
4. Admin (shadow allowlist) → handler runs.

Middleware only authenticates; tenant/role is per-route. Writes stamp email identity (lowercased/trimmed) and append `codex_activity` **in the same `db.transaction` as the mutation** (Stage 0 hardening). `client_id` on create/PATCH is app-checked via `codexClientExists` (no DB FK until T6 — DI-12).

---

## Twelve tables (`db/schema/codex.ts`, migration 0013)

| Table | Status | Notes |
|---|---|---|
| `tasks` | **Live** | Create / list / patch / soft-delete |
| `client_notes` | **Live** (read API) | GET list only; writes arrive with Fireflies/Stage 3 |
| `team_members` | **Live** | Roster CRUD |
| `codex_activity` | **Live** (writes + GET list) | Append-only from repo; `GET .../activity` reads task-scoped rows; UI formats diffs via `lib/codex/activityDiff.ts` |
| `client_domains` | Provisioned, unwired | Domain→client matching for Stage 3 |
| `task_templates` | **Live** (API + Templates tab) | Name + description; hard delete cascades items |
| `task_template_items` | **Live** (API + Templates tab) | Ordered checklist labels; hard delete |
| `task_checklist_items` | **Live** (API + detail UI) | Stage 1 detail — hard delete (no `deleted_at`) |
| `task_comments` | **Live** (API + detail UI) | Stage 1 detail — hard delete; no edit; `author_kind` user\|ava |
| `ava_task_proposals` | Provisioned, unwired | Stage 4 confirm queue |
| `assignment_rules` | Provisioned, unwired | Stage 5 learning |
| `fireflies_sync_state` | Provisioned, unwired | Stage 3 poll cursor |

**Q23:** provisioned-but-dead Codex tables were created early **on purpose** and are to be **integrated during rollout** (Stages 1–5). Do not drop them as unused schema; do not treat empty as abandoned. Templates + template items are now live (Stage 1 step 5); remaining unwired: `client_domains`, `ava_task_proposals`, `assignment_rules`, `fireflies_sync_state`.

No FKs from Codex `client_id` columns to `clients` until T6 (DI-12). New 0013 tables: RLS on, **no** `ava_readonly` grants (fail closed). Exception: `client_notes` was already on the AVA allowlist — see standing decision below.

---

## Standing decision — AVA × `client_notes` (Q22)

**AVA retains SELECT on `client_notes` via the `ava_readonly` allowlist** (`db/migrations/0003_ava_readonly.sql`). This is deliberate, not an omission. When Stage 3 populates meeting notes, they become AVA-chat-queryable through `AVA_DATABASE_URL`. Do **not** revoke the grant as a tidy-up when reviewing Codex RLS. New Codex tables remain deny-by-default for AVA until explicitly allowlisted.

---

## Key files

- `lib/codex/{repo,types,flag,shadowRoles,queryHelpers,activityDiff,quickAddParse,recurringRule,runRecurring}.ts`
- `app/api/codex/**`, `app/api/cron/codex-recurring/route.ts`, `app/tasks/**`
- `components/tasks/{TaskBoard,TaskBulkBar,TaskDetailClient,TaskFormDialog,TaskQuickAdd,TeamMemberFormDialog,TemplateFormDialog}.tsx`
- `db/schema/codex.ts`, `db/migrations/0013_codex_v2.sql`
- Tests: `test:codex-flag-auth` (26 routes), `test:codex-stage0-guarantees`, `test:codex-stage1-detail`, `test:codex-stage1-templates` (recurringRule + repo idempotency)

## Recurring rule format (`tasks.recurring_rule`)

Boring text — **no cron-expression parser**. All date decisions use **Australia/Sydney** civil time (`lib/codex/recurringRule.ts`).

| Rule | Meaning | Period key |
|---|---|---|
| `monthly:<day>` | Day N of each Sydney month (1–31; clamp to last civil day) | `YYYY-MM-dN` |
| `weekly:<dow>` | `mon\|tue\|wed\|thu\|fri\|sat\|sun` | `YYYY-Www-dow` (ISO week of due date) |
| `monthly:lbd` | Last Mon–Fri of the Sydney month (no public-holiday calendar) | `YYYY-MM-lbd` |

**Series seeds:** live tasks with non-null `recurring_rule` + `template_id` + `client_id`. Cron `GET /api/cron/codex-recurring` (`CRON_SECRET`, Vercel `30 19 * * *`) generates children with `source=recurring`, `recurring_rule=null`, checklist copied from the template, `due_date` = period due YMD.

**Idempotency:** key `(template_id, client_id, period)`. Period is stamped as the first description line `[codex-period:<key>]`. Soft-deleted instances do not block regeneration. Running the job twice on the same Sydney day creates one task.

## Depends on

Auth0 session + `getUserRoles`; `GET /api/clients` for pickers; Postgres owner connection for writes (not `ava_readonly`). Cron uses `CRON_SECRET` only.

## Consumed by

Sidebar (`CODEX_SHADOW_ROLES` visibility); Creative admin landing can open `TaskFormDialog` when flag on. Nothing else should import Codex write paths without the same gates.

---

## Stage 0 observations

Append dated one-liners during the fortnight. Format:

```
- YYYY-MM-DD — <short fact or bug>; severity if known (blocks / annoy / observe)
```

- 2026-08-06 — Mutation + `appendActivity` now share one transaction (rollback if activity fails). App-level `client_id` exists-check on create/PATCH (DI-12; still no DB FK). Assignee lowercasing coverage + route raw-passthrough pin. Write-failure doc corrected: `.env.local` has `CODEX_V2=on`; stale dev server was the local flag-off cause.
- 2026-08-07 — `team_members` seq never drawn: settled as never-submitted (not a team-only code bug). Task create defaults assignee to session email when roster empty; Team tab is the only create surface and Stage 0 roster smoke was never closed. Round-trip + POST route pins added.
- 2026-08-07 — Stage 1 step 1 data layer: checklist + comments repo/routes (no UI). Child mutations refuse soft-deleted tasks; hard delete on children; C-39 `appendActivity.actorKind` parameterized.
- 2026-08-07 — Stage 1 step 2 detail panel: `/tasks/[id]` (not slide-over — Slack-pasteable URL + room for description/checklist/comments/activity). List row opens detail; `?task=` redirects. `codex_activity` first read path; category app-enforced (no DB CHECK).
- 2026-08-07 — Stage 1 step 3 board: `@dnd-kit` installed; list/board toggle shares filters; drag → PATCH status with revert+toast; listTasks enriches `checklist_done`/`checklist_total` for cards.
- 2026-08-07 — Stage 1 step 4 capture: quick-add parser (`lib/codex/quickAddParse.ts`) + chip preview; category filter; My week view; list bulk status/assignee/due; clients via `fetchClientsList` only.
- 2026-08-07 — Stage 1 step 5 templates + recurring: Templates tab; apply-on-create checklist; `recurring_rule` format in this page; idempotent `/api/cron/codex-recurring` keyed on `(template_id, client_id, period)` Sydney.
