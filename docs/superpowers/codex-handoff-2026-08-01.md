# Codex — full handoff (1 Aug 2026, evening)

**Purpose:** clean orientation for any fresh session (Luke, Claude, or Cursor) picking up the Codex shadow project. Covers the vision, everything done to date, exactly where we stand tonight, and the full road to team launch. Companion to the migration programme's own handoff (`av-review/migration-fresh-handoff-2026-08-01.md`) — Codex is the **parallel shadow track** that must never interfere with it.

---

## 1. What Codex is (the vision)

Codex is the tasks + workload management module of Assembled View, rebuilt Postgres-native on the Supabase foundation and grown into a management intelligence layer. Three data layers combine:

1. **Tasks** — Asana-grade day-to-day: who does what, for which client, by when. Statuses backlog|todo|in_progress|waiting|done; categories reporting|pacing|creative|finance|admin|meeting_followup|other.
2. **Client brains** — the per-client marketing brain already live on `clients.client_brain` (35 clients populated), to be extended with a **ways-of-working** section (cadence, who's on the account, client expectations).
3. **Meeting intelligence** — every team meeting ingested from Fireflies as `client_notes`; AVA extracts action items, proposes tasks and assignees.

From these, Codex renders: per-client "what's on / ways of working / workload", per-person assignments and load, per-task full context (which meeting it came from, which client/MBA, history). A **continual learning cycle** captures every human correction to an AVA proposal and feeds it back, with per-(client, category) graduation from confirm-first to auto-create at ≥~90% acceptance-without-edit over a trailing 4 weeks (volume ≥~10).

**Deliberately out of scope until after launch:** sprints, story points, dependency graphs, gantt, forms, automation builder, client-visible tasks, integration into Client Hub/dashboards, AVA chat access to tasks.

### Shadow rules (standing, until team launch)

- Everything lives inside `/tasks` + `/api/codex` + `db/` + `scripts/migration` exclusions. No links from any other surface; nothing else imports Codex code. Sidebar label stays "Tasks"; the page itself is branded Codex.
- Routes 404 unless `CODEX_V2=on` (checked **before** auth — module invisible when off). Auth gate `CODEX_SHADOW_ROLES=["admin"]` — the team's managers/clients get 403 until launch.
- No AVA registry or `ava_readonly` grant changes without an explicit decision.
- Codex is **Postgres-native**: no Xano dependency, not behind the `DATA_BACKEND`/`WRITE_BACKEND` migration flags, no Xano write-back mirror. The Xano `codex` API group is retired (F-27 closed as superseded).

---

## 2. History — how we got here

- **12 Jul:** strategy locked (`claude/codex-in-assembled-view-strategy.md`): build native (Option C) over embedding Leantime or running headless Plane/OpenProject; "focused agency layer" depth; the codex = tasks + client_notes + client joins that AVA can cross-query.
- **12–13 Jul (WS-F P1):** Xano `codex` group + 7 tables built; `/tasks` list UI shipped to main 13 Jul — and was down on arrival (F-27: missing `XANO_CODEX_BASE_URL`, Xano auth ambiguity, and an identity mismatch — app amended to `assignee_email`, backend never was). P2 (Fireflies), P3 (kanban/comments/templates UI), P4 (client-visible) never built.
- **30 Jul–1 Aug:** the Supabase replatform ported the 7 codex tables 1:1 (empty) into Postgres and rescued `client_brain` (migration 0004). The two things that killed the module in July don't exist on the Postgres path.
- **30 Jul (this project's restart):** research + staged plan written (`av-review/codex-rebuild-research-and-staged-plan-2026-07-30.md`). Luke's decisions: **parallel shadow track** alongside Plan-C · Fireflies ingests **all team meetings from day one** · **new `team_members` roster table**.
- **1 Aug:** Stage 0 executed end-to-end (below).

## 3. What has been done (Stage 0 — all verified, not assumed)

### Database (live on `slpdibnxtpdlttbbczvg`, applied by Claude via MCP)

**Migration `0013_codex_v2`** — applied and catalog-verified; file committed at `db/migrations/0013_codex_v2.sql` (verbatim mirror of what ran):

- `tasks`: email identity (`assignee_email`/`assignee_name`/`created_by_email`), `source` (manual|ava|template|recurring), `source_note_id` FK→client_notes, `category`, `deleted_at` (soft delete), `title` NOT NULL, status/priority/source CHECKs, index `(assignee_email, due_date)`.
- `task_comments`: `author_email`/`author_name`/`author_kind` (user|ava).
- Codex-internal FKs (comments/checklist→tasks CASCADE, template_items→templates CASCADE, tasks.template_id SET NULL). **Deliberately NO FKs to `clients`** — would collide with the migration's ETL truncate-reload of clients; revisit at T6 when reloads end.
- `client_notes`: + `organizer_email`, `matched_by` (domain|keyword|manual) for Stage 3.
- New tables: `team_members` (roster), `ava_task_proposals` (confirm queue + learning corpus, incl. `decision_diff` jsonb), `assignment_rules` (client×category→assignee, manual|learned, partial-unique active scope), `codex_activity` (append-only log), `fireflies_sync_state` (poll cursor).
- RLS on all 5 new tables (on, no policies — app connects server-side as owner); `ava_readonly` has **no grants** on any codex table except `client_notes` (see Open decisions).

### Code (three commits on `localhost`, gate-reviewed and ACCEPTED — `av-review/codex-stage0-gate-review-2026-08-01.md`)

- **C0-1 `5927d71d`:** `db/schema/codex.ts` (seven tables moved out of `ported.ts` + five new, 0013 shapes); migration file committed; ETL truncate-reload and recon **permanently exclude the codex seven** (with warning comments; tasks sequence untouched); tsc clean. Cursor's drizzle gate ran as snapshot-refresh (TTY blocked interactive generate) — Claude closed the gap by diffing `codex.ts` against the **live catalog** directly: identity kinds, full index inventory, FK names all match.
- **C0-2 `6772069b` + `1661f171`:** `/api/codex/*` rewritten onto Drizzle repos (`lib/codex/repo.ts` — listTasks filters/sort/paging with deleted-row exclusion, create/update/softDelete, client_notes list, team CRUD, every write appends `codex_activity`, all emails trimmed+lowercased); new `/api/codex/team` (+`[id]`); `codexFlagGuard()` 404-before-auth on every route; admin-only shadow gate; `lib/api/codex.ts` (Xano) deleted, zero `XANO_CODEX` refs; F-27 closed in KNOWN-ISSUES; same paged response envelope (`created_by` kept as alias — no API shape drift).
- **C0-3 `9020f735`:** `/tasks` is the Codex UI — "Codex" header + shadow badge (sidebar unchanged); flag-off server-side "Codex is not enabled" (no fetch); Tasks | Team tabs; assignee Select fed from the roster; category select (`TASK_CATEGORIES` in `lib/codex/types.ts`, single source of truth); soft-delete confirm; source chip when not manual; Team table + Add/Edit dialog + active toggle; empty states per spec.

Tests: types/helpers 8 pass; 4 route-mock tests skipped (need Node 22 module mocks) — deliberately covered by live smoke + Claude's SQL verification instead. tsc clean throughout.

## 4. Where we are RIGHT NOW (tonight's exact position)

**Stage 0 is code-complete and gate-accepted but NOT yet exited.** The exit gate needs Luke's live smoke:

1. Add `CODEX_V2=on` to `.env.local` (it is **not** there yet — Cursor confirmed) and restart the dev server.
2. Smoke a–e: create a task (client + category + roster assignee + due date) → My-tasks shows it → inline status persists → edit round-trips → soft delete removes it; Team add/edit/active-toggle; client-role session → 403/gated state; flag removed → routes 404 + "not enabled" page.
3. Screenshots of both tabs (Cursor can't capture).
4. Say **"codex smoke done"** to Claude → Claude SQL-verifies: `created_by_email`/`assignee_email` stamped and lowercased, `deleted_at` set with row retained, `codex_activity` rows for create/update/delete. That completes the suite → live action → independent DB check triangle and **closes Stage 0**.

Then: **live in it daily.** Run your own week in Codex and let the bug list accumulate — that list shapes the Stage 1 pack. Seed the full team roster and (worth doing early) real tasks for the current week.

**Smoke-dependent items (<90% until smoke):** live roster↔assignee round-trip, client-role 403 UX, flag-off behaviour after env change.

## 5. What is left (Stages 1–6 to team launch)

| Stage | Scope | Exit gate |
|---|---|---|
| **1 — Task core** (next pack) | Kanban board (`@dnd-kit`), task detail panel (description, checklist, comments, activity), quick-add, templates + recurring generation (EOM reporting, pacing reviews, QBRs — cron), plus whatever the Stage-0 daily-use bug list demands | Luke runs his whole week in Codex; a fortnight of daily use, bugs burned down |
| **2 — Codex layer** | Per-client view inside /tasks: brain summary render, notes timeline, open tasks, workload weight; `client_domains` editor; manual note capture; ways-of-working section added to the brain template (via the existing AVA skill) | Any client's "what's on, who's on it, how do we work with them" from one screen |
| **3 — Fireflies in** | `/api/cron/codex-fireflies` poll (15 min, `CRON_SECRET`, Xero-sync pattern) across ALL team meetings; GraphQL pull; match domains→title-keywords→unmatched queue; idempotent upsert on `fireflies_meeting_id`; **no AVA yet** — prove matching first | ≥95% of client meetings auto-match; unmatched queue workable |
| **4 — AVA proposals** | Server-side Claude extraction per new note → `ava_task_proposals` (title/category/due/assignee from rules→roster→attendees→brain); Inbox tab, confirm-first triage; every decision logged with field diffs | 2–4 weeks of real acceptance data; metrics card live |
| **5 — Learning + workload** | Correction exemplars retrieved into the extraction prompt; weekly learning job proposing `assignment_rules`/brain updates (themselves confirm-first); per-person workload view; per-client what's-on rollup; graduation logic to auto-create | Acceptance up, edits down over consecutive weeks — the launch evidence |
| **6 — Hardening + launch** | Bug sweep, empty/error states, perf, Guide 09 rewritten as the Codex guide, widen `CODEX_SHADOW_ROLES`, onboarding session | Team launch. Post-launch roadmap: client-visible tasks, hub/dashboard integration, AVA chat access, capacity planning |

Stage packs are cut one at a time, after living in the previous stage — same discipline as the migration: one prompt = one commit = one gate review with confidence statement; review the diff, not the summary; the verification triangle for anything that matters.

## 6. Open decisions & verifications

1. **AVA can already read `client_notes`** — it was in the original `ava_readonly` 40-table allowlist (verified live). Meeting notes become AVA-chat-queryable the moment Stage 3 lands. Recommend keep; one-line revoke if Luke wants notes hidden during shadow. **Luke's call before Stage 3.**
2. **Fireflies tier / webhook availability** — API key valid, workspace admin, meetings flowing (verified). 2-min check of Developer Settings still owed; poll-first design works on any tier, so this only decides whether a webhook receiver gets added as an optimisation.
3. **`FIREFLIES_API_KEY` + cron slot** go on the T6 production env checklist (Codex reaches production only when `main` unfreezes at T6; Supabase Pro upgrade is already a T6 gate).
4. **Roster seeding + real-task backfill** — Luke, via the Team tab, at smoke time.
5. Route-mock tests remain skipped until the toolchain moves to Node 22 (accepted debt; live smoke covers).

## 7. Standing constraints (do not break)

- **Never run `db:etl` from a tree older than C0-1** (`5927d71d`) — pre-C0-1 ETL would fail on the changed `tasks` columns; post-C0-1 ETL excludes codex tables permanently. ETL reloads remain opt-in + mirror-log-gated per the migration rules; a reload can no longer touch Codex data.
- **DDL:** authored in packs, applied only by Luke (SQL editor) or Claude (MCP), never Cursor; every migration file committed as a verbatim mirror. Next migration number: **0014**.
- **Migration/Plan-C work always wins** shared-file conflicts; Codex rebases. Nothing Codex-related lands in a migration-critical window.
- Gate reviews read files via **device_bash on Luke's machine**, not previously-staged cloud copies (staleness caught 1 Aug: a re-staged file served pre-C0-2 content; the disk file was correct).

## 8. Document index

| What | Where |
|---|---|
| This handoff (start here) | `av-review/codex-handoff-2026-08-01.md` |
| Research + staged plan (the why and the full design) | `av-review/codex-rebuild-research-and-staged-plan-2026-07-30.md` |
| Stage 0 Cursor pack (incl. 0013 SQL as Appendix A) | `av-review/cursor-codex-stage0-pack-2026-08-01.md` · in-repo: `docs/superpowers/cursor-codex-stage0-pack-2026-08-01.md` |
| Stage 0 gate review | `av-review/codex-stage0-gate-review-2026-08-01.md` |
| Original strategy / WS-F state / Leantime assessment | `claude/codex-in-assembled-view-strategy.md` · `claude/WS-F-state.md` · `claude/leantime-codex-feasibility.md` |
| Client brain (skill + wiring) | `claude/ava-skill-client-marketing-brain.md` · `claude/cursor-client-profile-brain-brief.md` |
| Migration programme context | `av-review/migration-fresh-handoff-2026-08-01.md` |
| In-repo | `db/migrations/0013_codex_v2.sql` · `db/schema/codex.ts` · `lib/codex/{repo,types,flag}.ts` · `app/api/codex/*` · `app/tasks/*` · `docs/brain/KNOWN-ISSUES.md` (F-27 closed) |

**Commit ledger (localhost):** C0-1 `5927d71d` → C0-2 `6772069b` → `1661f171` (F-27) → C0-3 `9020f735`. Nothing pushed; `main` untouched; Codex joins a T6 cherry-pick set when that campaign assembles.

**Env:** `CODEX_V2` (NOT yet in `.env.local` — first smoke step) · future: `FIREFLIES_API_KEY`, cron slot at Stage 3/T6.

**Confidence statement:** §3 and §4 are backed by live evidence this session — Supabase catalog SQL, file reads on Luke's machine via the device bridge, and the accepted gate review. <90% flagged: the three smoke-dependent behaviours (§4), Fireflies tier/webhooks (§6.2), and the skipped route-mock tests (§6.5). Nothing in this handoff is remembered flag state — `CODEX_V2`'s absence from `.env.local` was verified by Cursor this session; re-read `.env.local` at session start regardless, per migration rule 5.
