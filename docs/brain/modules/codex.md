# Module: Codex (`/tasks`)

Postgres-native internal task ops for the Assembled Media team. Shadow phase: flag `CODEX_V2=on`, roles `CODEX_SHADOW_ROLES` (currently `admin` only). Naming: `lib/codex/**` is the Tasks domain, not AVA.

**Discipline:** live in Stage 0 for a fortnight; accumulate bugs in **Stage 0 observations** below; that list shapes the Stage 1 pack. Do not invent Stage 1 scope from speculation.

Related: `docs/brain/codex-client-id-fk.md` (DI-12), `docs/brain/fail-soft-consumers.md`, `docs/brain/codex-write-failure-static.md`, `docs/brain/codex-team-create-never-reached.md`.

---

## Stage 0 — what ships today

UI: `app/tasks/page.tsx` + `TasksPageClient.tsx`. Flag off → server EmptyState "Codex is not enabled" (no client fetch). Flag on → two tabs:

| Surface | Behaviour |
|---|---|
| **Tasks** | Flat list (TanStack `useReactTable`), not kanban. Modal create/edit (`TaskFormDialog`). Soft delete via confirm → `DELETE /api/codex/tasks/[id]` (sets `deleted_at`; no trash UI). |
| **Team** | Roster table + `TeamMemberFormDialog` create/edit. |

**Default scope:** `mine=1` → `assignee_email = me OR created_by_email = me` (includes unassigned tasks I created). **All tasks** toggle clears that scope so null-assignee rows stay visible. Exact `assignee_email` filter still excludes unassigned by design (`resolveListAssigneeScope`).

**Filters:** client (`client_id`), status (multi), assignee (when not mine), text search on title (client-side `matchText`). Sort: `due_date` / API sorts `due_date_asc|desc`, `created_at_desc`.

**Pagination:** server-side `page` / `per_page` (UI uses `PER_PAGE = 100`). Soft-deleted rows excluded unless `include_deleted=1` (no Stage 0 trash UI).

**Clients for the picker:** `GET /api/clients`. Reads `x-warning: clients-unavailable` and surfaces ViewState error (not an empty select) — fail-soft invariant.

List shells use `ViewState` / `ViewStateBoundary` so fetch failure cannot render as "no tasks".

---

## API surface and gate order

Routes under `app/api/codex/`:

| Method | Path | Repo |
|---|---|---|
| GET, POST | `/api/codex/tasks` | `listTasks`, `createTask` |
| PATCH, DELETE | `/api/codex/tasks/[id]` | `updateTask`, `softDeleteTask` |
| GET, POST | `/api/codex/team` | `listTeamMembers`, `createTeamMember` |
| PATCH | `/api/codex/team/[id]` | `updateTeamMember` |
| GET | `/api/codex/client_notes` | `listClientNotes` (read-only in Stage 0) |

Every handler: `codexFlagGuard()` then `requireCodexInternalAccess()` (`app/api/codex/_shared.ts`).

**Gate order (pinned by `lib/codex/__tests__/routes.flagAuth.test.ts`):**

1. Flag off (`CODEX_V2` ≠ `on`) → **404** `{ error: "not_found" }` — module invisible; not 403.
2. No session → **401** `{ error: "unauthorised" }`.
3. Session but role outside `CODEX_SHADOW_ROLES` → **403** `{ error: "forbidden" }`.
4. Admin (shadow allowlist) → handler runs.

Middleware only authenticates; tenant/role is per-route. Writes stamp email identity (lowercased/trimmed) and append `codex_activity` (see KNOWN-ISSUES for actor_kind / orphan activity).

---

## Twelve tables (`db/schema/codex.ts`, migration 0013)

| Table | Status | Notes |
|---|---|---|
| `tasks` | **Live** | Create / list / patch / soft-delete |
| `client_notes` | **Live** (read API) | GET list only; writes arrive with Fireflies/Stage 3 |
| `team_members` | **Live** | Roster CRUD |
| `codex_activity` | **Live** (via writes) | Append-only from repo; no dedicated HTTP list in Stage 0 |
| `client_domains` | Provisioned, unwired | Domain→client matching for Stage 3 |
| `task_templates` | Provisioned, unwired | Stage 1 templates |
| `task_template_items` | Provisioned, unwired | |
| `task_checklist_items` | Provisioned, unwired | Stage 1 detail panel |
| `task_comments` | Provisioned, unwired | Stage 1 detail panel |
| `ava_task_proposals` | Provisioned, unwired | Stage 4 confirm queue |
| `assignment_rules` | Provisioned, unwired | Stage 5 learning |
| `fireflies_sync_state` | Provisioned, unwired | Stage 3 poll cursor |

**Q23:** the eight provisioned-but-dead tables were created early **on purpose** and are to be **integrated during rollout** (Stages 1–5). Do not drop them as unused schema; do not treat empty as abandoned.

No FKs from Codex `client_id` columns to `clients` until T6 (DI-12). New 0013 tables: RLS on, **no** `ava_readonly` grants (fail closed). Exception: `client_notes` was already on the AVA allowlist — see standing decision below.

---

## Standing decision — AVA × `client_notes` (Q22)

**AVA retains SELECT on `client_notes` via the `ava_readonly` allowlist** (`db/migrations/0003_ava_readonly.sql`). This is deliberate, not an omission. When Stage 3 populates meeting notes, they become AVA-chat-queryable through `AVA_DATABASE_URL`. Do **not** revoke the grant as a tidy-up when reviewing Codex RLS. New Codex tables remain deny-by-default for AVA until explicitly allowlisted.

---

## Key files

- `lib/codex/{repo,types,flag,shadowRoles,queryHelpers}.ts`
- `app/api/codex/**`, `app/tasks/**`
- `components/tasks/{TaskFormDialog,TeamMemberFormDialog}.tsx`
- `db/schema/codex.ts`, `db/migrations/0013_codex_v2.sql`
- Tests: `test:codex-flag-auth`, `test:codex-stage0-guarantees`

## Depends on

Auth0 session + `getUserRoles`; `GET /api/clients` for pickers; Postgres owner connection for writes (not `ava_readonly`).

## Consumed by

Sidebar (`CODEX_SHADOW_ROLES` visibility); Creative admin landing can open `TaskFormDialog` when flag on. Nothing else should import Codex write paths without the same gates.

---

## Stage 0 observations

Append dated one-liners during the fortnight. Format:

```
- YYYY-MM-DD — <short fact or bug>; severity if known (blocks / annoy / observe)
```

(empty — fill as bugs accumulate)
