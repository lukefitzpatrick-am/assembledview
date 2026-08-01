# Cursor pack — Codex Stage 0: reset & foundations (shadow project)

**Date:** 2026-08-01 · **Branch:** `localhost` · **Design ref:** `av-review/codex-rebuild-research-and-staged-plan-2026-07-30.md`
**Operating rules (unchanged):** one prompt = one commit = one gate review with a confidence statement · DDL authored here, applied only by Luke/Claude (done — see below) · everything contained in `/tasks` + `/api/codex` + `db/` + `scripts/migration`; nothing else imports Codex code · no nav changes, no AVA registry changes, no client-facing surface.

---

## What Claude already did in Supabase (2026-08-01, catalog-verified live)

**Migration `0013_codex_v2` is APPLIED** to `slpdibnxtpdlttbbczvg` via MCP. Full SQL in Appendix A — Cursor commits it verbatim as `db/migrations/0013_codex_v2.sql` in prompt C0-1 (file mirrors what's live, same as 0003/0004/0006 practice).

What it did:

1. **`tasks` → email identity + Codex columns**: dropped `assignee_user_id`/`created_by` (bigint); added `assignee_email`, `assignee_name`, `created_by_email`, `source` (manual|ava|template|recurring), `source_note_id` FK→client_notes, `category`, `deleted_at` (soft delete — the parked decision, resolved as soft). `title` NOT NULL, `status` NOT NULL default 'todo' + CHECK on the 5 statuses, priority CHECK. Index `(assignee_email, due_date)` replaces the dead one.
2. **`task_comments`** → `author_email`/`author_name`/`author_kind` (user|ava), `user_id` dropped.
3. **Codex-internal FKs** (all empty, safe): comments/checklist→tasks CASCADE, template_items→templates CASCADE, tasks.template_id→templates SET NULL. **Deliberately NO FK to `clients`** — the ETL truncate-reload of clients would collide; revisit at T6 when reloads end.
4. **`client_notes`** + `organizer_email`, `matched_by` (domain|keyword|manual) — Stage 3 support, added now to avoid a second migration.
5. **New tables**: `team_members` (roster: email unique lowercase, name, role_title, active, capacity_notes, working_style, default_client_ids[]), `ava_task_proposals` (the confirm queue + learning corpus: proposed fields, ava_confidence/rationale, status proposed|accepted|accepted_edited|rejected|expired, decision_diff jsonb, created_task_id), `assignment_rules` (client×category→assignee, manual|learned, unique active scope), `codex_activity` (append-only log), `fireflies_sync_state` (poll cursor + run log).
6. **RLS enabled on all 5 new tables** (on, no policies — same as the other 45; app connects server-side as owner).

**Verified after apply:** all columns present · 7 constraints present · key indexes present · RLS on 5/5 · `ava_readonly` denied on tasks/team_members/proposals/rules/activity/sync_state (fail closed).

**One flag for Luke:** `client_notes` was already in AVA's 40-table allowlist (`ava_readonly` CAN select it — verified). So the moment Stage 3 populates it, meeting notes are queryable from AVA chat. Recommend **keep** (it serves the codex vision and the role is read-only + 5s-capped), but if you want notes invisible to AVA during shadow, say so and I'll revoke in one line.

## ⚠️ Two ordering warnings (read before running anything)

1. **Do not run `db:etl` until C0-1 lands.** The live `tasks` table no longer has `assignee_user_id` — a reload attempt against the old column list will fail (and the codex tables must be excluded from truncate-reload forever anyway, or a future reload wipes real Codex data). C0-1 makes ETL safe again.
2. **The drizzle empty-diff gate is currently red by design** — live DB is ahead of `db/schema/` (same situation as after 0003/0004). C0-1 restores the empty diff. Run C0-1 promptly; don't run `drizzle-kit generate` for other work in between.

---

## PROMPT C0-1 — migration file + Drizzle schema sync + ETL/recon exclusion

```text
PASTE INTO CURSOR — C0-1: Codex v2 schema into code (DB is already migrated; code catches up)

Branch: localhost, one commit. Migration 0013_codex_v2 is ALREADY APPLIED to live Supabase
by Claude (catalog-verified). This commit brings the repo to parity. Confirm-first; 90% rule;
report confidence at the end.

DO:
1. Commit db/migrations/0013_codex_v2.sql with EXACTLY the SQL from Appendix A of
   av-review/cursor-codex-stage0-pack-2026-08-01.md (also being provided alongside this
   prompt). Do not edit it — it mirrors what is live.
2. db/schema/: move the seven codex tables OUT of ported.ts into a new db/schema/codex.ts:
   tasks, taskChecklistItems, taskComments, taskTemplates, taskTemplateItems, clientNotes,
   clientDomains — updated to the 0013 shapes (email columns, source/category/deletedAt,
   organizer_email/matched_by on clientNotes, the CHECK-backed text columns typed as
   pgEnum-free text with TS union types). ADD the five new tables: teamMembers,
   avaTaskProposals, assignmentRules, codexActivity, firefliesSyncState. Export all from
   db/schema/index.ts. Keep naming/style conventions identical to ported.ts/planCore.ts.
3. GATE: drizzle-kit generate against the live DB must produce an EMPTY diff. If it is not
   empty, STOP and report the diff verbatim — do not "fix" the database; the SQL file and
   live catalog are the source of truth.
4. scripts/migration/etl-xano-to-supabase.ts: EXCLUDE the seven codex tables from
   truncate-and-reload, with a comment block:
   // Codex v2 (migration 0013): Postgres-native module, no Xano twin.
   // NEVER truncate-reload these — reloading would destroy live Codex data:
   // tasks, task_checklist_items, task_comments, task_templates, task_template_items,
   // client_notes, client_domains
5. scripts/migration/recon.ts (and any recon table list): drop the same seven tables from
   count comparison so future recons don't false-fail once Codex has rows.
6. Type check: npx tsc --noEmit fully clean (baseline is clean since O1 — keep it clean).

VERIFY: empty drizzle diff (paste the command output); tsc clean; grep confirms no
truncate/insert path can touch the seven tables; ETL dry parse still runs for the
remaining tables.
REPORT: gate outputs + confidence per the 90% rule. Do NOT run db:etl in this prompt.
```

## PROMPT C0-2 — Postgres repos + route swap (kill the Xano dependency)

```text
PASTE INTO CURSOR — C0-2: /api/codex on Drizzle/Postgres; delete the Xano proxy path

Branch: localhost, one commit. Depends on C0-1 (schema in code). The existing route
CONTRACTS are kept — lib/codex/types.ts already models the target (assignee_email etc.)
and TasksPageClient consumes it; we are swapping the data layer underneath, not the API
shape. Confirm-first; 90% rule.

CONTEXT (verified):
- app/api/codex/tasks/route.ts + [id]/route.ts + client_notes/route.ts currently proxy
  Xano via lib/api/codex.ts (getCodexBaseUrl / XANO_CODEX_BASE_URL) + codexApiClient in
  app/api/codex/_shared.ts.
- _shared.ts's requireCodexInternalAccess (Auth0 session, admin|manager, client→403) is
  CORRECT and stays — but tighten to ADMIN-ONLY for the shadow phase (one const
  CODEX_SHADOW_ROLES = ["admin"]; comment: managers join at team launch).
- Note: if the UX workstream's fail-closed RBAC changes removed the manager role from
  lib/rbac.ts, reconcile against current rbac exports rather than this description.

DO:
1. NEW lib/codex/repo.ts — Drizzle repos over db/ (import { db } from "@/db"):
   - listTasks(filters): client_id, assignee_email, status (single+CSV), mba_number,
     due_before/after, category, source, mine-resolved email, sort
     (due_date_asc default | due_date_desc | created_at_desc), page/per_page (cap 100),
     totals. ALWAYS excludes deleted_at IS NOT NULL unless include_deleted=1 (admin debug).
   - getTask / createTask / updateTask / softDeleteTask (sets deleted_at, never DELETE).
   - listClientNotes(filters): client_id, mba_number, meeting_before/after, page/per_page.
   - listTeamMembers / createTeamMember / updateTeamMember (email lowercased on write,
     active toggle; no hard delete).
   - Every write also appends a codex_activity row (entity_type, entity_id, actor_email,
     action, before/after minimal jsonb). Keep it one insert, not a framework.
2. REWRITE app/api/codex/tasks/route.ts + [id]/route.ts + client_notes/route.ts internals
   to call the repo. Keep: response shapes ({ items, itemsTotal, ... } paged envelope per
   lib/codex/types.ts CodexPagedResponse), the mine=1 server-side email resolution
   (never trust client-supplied assignee_email when mine set), created_by → stamp
   created_by_email from session, title/client_id validation on POST. Add [id] PATCH
   field allowlist (title, description, status, priority, assignee_email, assignee_name,
   due_date, mba_number, category, client_visible) and DELETE → softDeleteTask.
3. NEW app/api/codex/team/route.ts (+[id]) — GET list / POST create / PATCH update,
   same auth gate. This feeds the assignee picker and the Team tab (C0-3).
4. FLAG: all /api/codex/* routes return 404 unless process.env.CODEX_V2 === "on"
   (checked before auth so the module is invisible when off). Add CODEX_V2= to
   .env.example + env.local.example with a comment. Luke sets CODEX_V2=on in .env.local.
5. DELETE the Xano path: lib/api/codex.ts (whole file), codexApiClient/retry helpers in
   _shared.ts that exist only for Xano (keep the auth gate + error-shape helpers), every
   XANO_CODEX_BASE_URL reference in code and env examples (mark the Xano `codex` API
   group as retired in docs/brain/KNOWN-ISSUES.md F-27 row: superseded by Postgres-native
   Codex, close F-27 with this commit hash).
6. Tests (tsx --test, colocated like the O3 suite): repo-level tests against a mocked db
   OR — if the existing test harness has a real-DB pattern — filter/paging/soft-delete
   unit coverage; route-level: 404 when flag off, 401 no session, 403 client role,
   mine=1 ignores client-supplied assignee_email. Match existing test conventions.

VERIFY: tsc clean; test suite green; grep XANO_CODEX -> zero hits.
REPORT: gate outputs, the exact routes rewritten, any contract deviation (expected: none),
confidence per the 90% rule.
```

## PROMPT C0-3 — UI wiring: Codex header, team roster, soft delete, live smoke

```text
PASTE INTO CURSOR — C0-3: /tasks UI on the new API + Team tab + Codex identity

Branch: localhost, one commit. Depends on C0-2. UI stays entirely inside /tasks.
Sidebar label stays "Tasks" (shadow rule); the page itself becomes Codex.

DO:
1. app/tasks/page.tsx + TasksPageClient.tsx:
   - Page header/title → "Codex" with a small "shadow" badge (reuse an existing Badge
     variant; no new design primitives).
   - If CODEX_V2 flag is off, the server page renders the existing empty/error state
     pattern ("Codex is not enabled") instead of fetching — read the flag server-side.
   - Assignee: replace any free-text assignee input in TaskFormDialog with a Select fed
     from /api/codex/team (active members; label name, value email; store both
     assignee_email + assignee_name). "My tasks" switch unchanged (mine=1).
   - Add Category select (reporting | pacing | creative | finance | admin |
     meeting_followup | other) — new const in lib/codex/types.ts, single source of truth.
   - Row actions: soft Delete (confirm dialog → DELETE route). Deleted tasks vanish from
     all lists (no trash UI in Stage 0).
   - Show a source chip on rows where source !== 'manual' (future-proofs Stage 4; today
     everything is manual).
2. NEW Team tab: convert the page to a two-tab layout (Tasks | Team) using the existing
   ToggleGroup/Tabs pattern already imported in TasksPageClient. Team tab = TanStack
   table of team_members (name, email, role_title, active, capacity_notes truncated) +
   Add/Edit dialog (RHF+zod per TaskFormDialog conventions). No delete — active toggle.
3. lib/codex/types.ts: add TeamMember, TaskCategory, TaskSource types; extend CodexTask
   with category/source/deleted_at. Keep types.ts the single source of truth.
4. Empty states: Tasks tab "No tasks yet — create the first one"; Team tab "Add the
   team to enable assignment".

SMOKE (Luke, with CODEX_V2=on in .env.local, admin session):
a. /tasks renders "Codex", empty states on both tabs.
b. Team: add yourself + at least one teammate; edit a role_title; toggle active off/on.
c. Tasks: create a task (client + category + assignee from the roster + due date);
   My-tasks shows it; inline status change persists; edit dialog round-trips; soft
   delete removes it from the list.
d. Client-role login (or cookie) → /tasks API returns 403; page shows the gated state.
e. CODEX_V2 removed from env → routes 404, page shows "not enabled".
f. Send Claude the word "codex smoke done" — Claude then SQL-verifies: tasks row has
   created_by_email + assignee_email set and lowercased, codex_activity rows exist for
   create/update/delete, deleted task has deleted_at set (not removed).

REPORT: gate outputs + screenshots of both tabs + confidence per the 90% rule.
```

---

## Exit gate for Stage 0 (all three commits + smoke green)

- `/tasks` runs entirely on Supabase Postgres; `XANO_CODEX_BASE_URL` gone from the repo; F-27 closed in the register.
- Drizzle empty-diff gate green; ETL/recon permanently exclude the codex seven; tsc clean.
- Team roster populated (that's the Stage 1 assignment foundation).
- Claude's SQL verification (step f) passes — the same triangle as the migration: suite → live action → independent DB check.

**Then Stage 1** (kanban board, task detail panel with comments/checklists, templates + recurring cron, quick-add) gets its own pack once you've lived in Stage 0 for a few days and the bug list from daily use is in.

## Confidence notes (90% rule)

- >90%: everything in the "already did in Supabase" section (catalog-verified live this session); the route/UI file inventory (read from the connected repo this session); ETL collision risk if run before C0-1 (column list mismatch is mechanical).
- <90%, flagged: whether `manager` still exists as a role after the UX workstream's fail-closed RBAC change ("manager role removed" per the 1 Aug handoff) — C0-2 step 0 reconciles against current `lib/rbac.ts` rather than assuming; exact drizzle-kit command names in this repo (`db:generate` vs raw drizzle-kit — Cursor uses whatever package.json defines); whether the existing test harness has a real-DB pattern to reuse (C0-2 test step adapts either way).
- Not touched by design: AVA tool registry, `ava_readonly` grants, sidebar/nav, any client-facing route, the soak-week M-prompts. Codex rides alongside; if any soak/M-prompt work conflicts on a shared file, the M-work wins and Codex rebases.

---

## Appendix A — db/migrations/0013_codex_v2.sql (as applied live by Claude, 2026-08-01)

```sql
-- 0013_codex_v2 — Codex shadow project, Stage 0 schema
-- Preconditions verified live before apply: tasks, task_checklist_items, task_comments,
-- task_templates, task_template_items, client_notes, client_domains ALL 0 rows.
-- Design refs: av-review/codex-rebuild-research-and-staged-plan-2026-07-30.md §3.
-- Deliberate omission: NO foreign keys from codex tables to clients yet — the ETL
-- truncate-and-reload of clients would collide with them. Revisit at T6 when reloads end.

-- ============ 1) tasks — email identity (Auth0) + Codex v2 columns ============
ALTER TABLE public.tasks
  DROP COLUMN assignee_user_id,
  DROP COLUMN created_by;

ALTER TABLE public.tasks
  ADD COLUMN assignee_email text,
  ADD COLUMN assignee_name text,
  ADD COLUMN created_by_email text,
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN source_note_id bigint REFERENCES public.client_notes(id) ON DELETE SET NULL,
  ADD COLUMN category text,
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.tasks
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'todo',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN priority SET DEFAULT 'normal';

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_source_check CHECK (source IN ('manual','ava','template','recurring')),
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('backlog','todo','in_progress','waiting','done')),
  ADD CONSTRAINT tasks_priority_check CHECK (priority IS NULL OR priority IN ('low','normal','high'));

DROP INDEX IF EXISTS idx_tasks_assignee_user_id_due_date;
CREATE INDEX idx_tasks_assignee_email_due_date ON public.tasks (assignee_email, due_date);
CREATE INDEX idx_tasks_source_note_id ON public.tasks (source_note_id);

-- ============ 2) task_comments — email identity + author kind ============
ALTER TABLE public.task_comments
  DROP COLUMN user_id;

ALTER TABLE public.task_comments
  ADD COLUMN author_email text,
  ADD COLUMN author_name text,
  ADD COLUMN author_kind text NOT NULL DEFAULT 'user'
    CHECK (author_kind IN ('user','ava'));

-- ============ 3) codex-internal foreign keys (all tables empty — safe) ============
ALTER TABLE public.task_comments
  ADD CONSTRAINT fk_task_comments_task
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_checklist_items
  ADD CONSTRAINT fk_task_checklist_items_task
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_template_items
  ADD CONSTRAINT fk_task_template_items_template
  FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE;
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_template
  FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id ON public.task_checklist_items (task_id);

-- ============ 4) client_notes — Stage 3 ingestion support columns ============
ALTER TABLE public.client_notes
  ADD COLUMN organizer_email text,
  ADD COLUMN matched_by text CHECK (matched_by IS NULL OR matched_by IN ('domain','keyword','manual'));

-- ============ 5) team_members — the roster that feeds assignment + workload ============
CREATE TABLE public.team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  role_title text,
  active boolean NOT NULL DEFAULT true,
  capacity_notes text,
  working_style text,
  default_client_ids bigint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 6) ava_task_proposals — the confirm queue AND the learning corpus ============
CREATE TABLE public.ava_task_proposals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_note_id bigint REFERENCES public.client_notes(id) ON DELETE CASCADE,
  client_id bigint,
  proposed_title text NOT NULL,
  proposed_description text,
  proposed_category text,
  proposed_due_date timestamptz,
  proposed_assignee_email text,
  ava_confidence numeric(4,3),
  ava_rationale text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','accepted_edited','rejected','expired')),
  decided_by_email text,
  decided_at timestamptz,
  created_task_id bigint REFERENCES public.tasks(id) ON DELETE SET NULL,
  decision_diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ava_task_proposals_status_created ON public.ava_task_proposals (status, created_at);
CREATE INDEX idx_ava_task_proposals_client ON public.ava_task_proposals (client_id);

-- ============ 7) assignment_rules — manual ways-of-work skeleton + learned rules ============
CREATE TABLE public.assignment_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint,  -- NULL = global rule
  category text NOT NULL,
  assignee_email text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','learned')),
  confidence numeric(4,3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_assignment_rules_scope
  ON public.assignment_rules (COALESCE(client_id, 0), category) WHERE active;

-- ============ 8) codex_activity — append-only activity log ============
CREATE TABLE public.codex_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id bigint NOT NULL,
  actor_email text,  -- NULL = system
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','ava','system')),
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_codex_activity_entity ON public.codex_activity (entity_type, entity_id, created_at);

-- ============ 9) fireflies_sync_state — poll cursor + run log (Xero-sync pattern) ============
CREATE TABLE public.fireflies_sync_state (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_started_at timestamptz NOT NULL DEFAULT now(),
  run_finished_at timestamptz,
  cursor_from timestamptz,
  meetings_seen integer NOT NULL DEFAULT 0,
  notes_created integer NOT NULL DEFAULT 0,
  notes_skipped integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  error text
);

-- ============ 10) RLS on every new table (consistent with the other 45: on, no policies;
--                  app connects server-side as owner; ava_readonly gets NO grants — fail closed) ============
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ava_task_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codex_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fireflies_sync_state ENABLE ROW LEVEL SECURITY;
```
