# Module: Codex (`/tasks`)

Postgres-native internal task ops for the Assembled Media team. Shadow phase: roles `CODEX_SHADOW_ROLES` (`admin` only; all staff are admin today). Naming: `lib/codex/**` is the Tasks domain, not AVA.

**Switches** (`lib/features/registry.ts`, set on `/admin/features`, Platform). Every one is off by default and every one except `codex_v2` needs `codex_v2` on.

| Switch | On does | Before turning it on |
|---|---|---|
| `codex_v2` | The `/tasks` module, its API and the recurring task run. Off: `/tasks` shows "Codex is not enabled" and every `/api/codex/*` route is 404 | The F14 Ava patches live (B36, B36fix). It still has an env fallback: see **Switch `codex_v2` and `CODEX_V2`** below |
| `codex_roster_aliases` | People resolve by email alias as well as main email (F16, C-193; see **People resolution** and **Assignee writes**) | Roster fixed on the Team tab: who keeps `samantha@`, Josh Plumridge's own address, Alex James's name |
| `codex_search` | Search button and `GET /api/codex/search` (F8; see **Search**) | Nothing. Migration 0116 only makes meeting search fast |
| `codex_saved_views` | Views menu and `/api/codex/saved-views` (F8; see **Saved views**) | Migration 0117 applied (until then the menu stays hidden) |
| `codex_projects` | A Projects tab on `/tasks`, a board per project at `/tasks/projects/[id]` (B39), the projects and sections API `/api/codex/projects/**` (B38), and status changes on project tasks through the section rule in PATCH, bulk and the Tasks board (see **Projects and sections** and **Project board**) | Migration 0118 applied (until then every projects route is 503 `migration_not_applied`). Before real use of private projects: C-211 (their tasks still show in the Tasks list, counts and search) |

**Switch `codex_v2` and `CODEX_V2` (F1, C-192).** `resolveFeature` prefers a `feature_switches` row and reads `CODEX_V2` only when no row exists, or when the switch read fails (database error or 0111 marker read failure: every switch falls back to env until the next read). Production had no `codex_v2` row on 13 Nov 2026 and the production env value is unverified, so the fallback stays. Luke: (1) production `/admin/features`, Platform > Tasks (Codex), read the value and source (Env var CODEX_V2); (2) press Save current values there, which writes a row at that value (no behaviour change); turn Codex on only after the F14 Ava patches are live; (3) check the row (`SELECT key, enabled FROM feature_switches WHERE key = 'codex_v2'`); (4) a later small change drops `envName` / `envParse` from the entry and the Vercel var can go.

**Who sees what (plan section 13).**

- **Staff only.** Every `/api/codex/*` route: `codex_v2` off 404, then any feature switch of its own 404 (both before auth), no session 401, a role outside `CODEX_SHADOW_ROLES` 403, then owner checks where a row has an owner (saved views). Client users never see Codex.
- **Internal meeting summaries are visible to all staff (decision 52).** Codex lists, search and `/admin/fireflies-unattributed` show internal meetings to staff. F0 (attendees only) was dropped.
- **Never to Ava (F9, decision 10 A, 0114 live).** The `ava_readonly` policy `ava_read` on `client_notes` is `is_internal IS NOT TRUE AND coalesce(attributed_type, '') <> 'internal'` (checked live 13 Nov 2026). Ava reads client and publisher meeting notes, never internal ones. Codex search is not an Ava tool.
- **Ava on `/tasks` fails closed (F14, C-191, B36 and B36fix).** `/tasks/*` offers only `TASKS_TOOL_ALLOWLIST` (read tools, `lib/ava/tools/toolAccess.ts`) plus capture-tagged read tools, and never server web search. A chat request with no usable route gets read tools only and no web search. Once a capture tool's output enters a conversation it is tainted for good: a signed marker (`lib/ava/taintMarker.ts`, purpose `ava-taint` from `APP_SIGNING_SECRET`) and `AVA_TAINT_NOTICE` in the history drop write tools on every page; only a new chat clears it. A tainted conversation's replies never drive the page (no form patch, no line items load, no legacy action JSON). The widget starts a fresh conversation when the route leaves `/tasks`, and a send whose page context was still loading at that reset sends nothing. Capture output is stripped of links (including `//host`, `mailto:` and bare hosts) and images and framed as untrusted. **Taint is held by the client only (C-195):** no tool may carry a `capture` tag until the server keeps its own taint record per conversation and owner (`AVA_SERVER_TAINT_RECORD`, pinned by `taintPreconditions.test.ts`) and `APP_SIGNING_SECRET` is confirmed in production; none does today. A new Codex Ava tool must be tagged in `AVA_TOOL_TAGS` and, if read only, added to the allowlist.
- **Read-only panels outside `/tasks` (decision 3 B).** Other pages may show Codex data read only, to admins only: Campaign hours (`CampaignHoursWidget`, `/api/codex/time/summary`), Client Hub and Publisher Hub meetings (`requireAdmin`). The task detail MBA links one way to `/mediaplans/mba/[mba]/edit`. **Not yet true:** four places outside `/tasks` still write tasks (C-200): pacing Ask for help (`CampaignAskHelpDialog`), the scenario planner (`ScenarioPlannerDrawer` / `ScenarioPlannerContext`), the creative admin landing (`TaskFormDialog`) and relabel notifications (`lib/pacing/relabel/handlers.ts`, server side, `createTask`; `autoClose.ts`, `updateTask`).

**Discipline:** live in Stage 0 for a fortnight; accumulate bugs in **Stage 0 observations** below; that list shapes the Stage 1 pack. Do not invent Stage 1 scope from speculation.

Related: `docs/brain/codex-client-id-fk.md` (DI-12), `docs/brain/fail-soft-consumers.md`, `docs/brain/codex-write-failure-static.md`, `docs/brain/codex-team-create-never-reached.md`.

---

## Stage 0 — what ships today

UI: `app/tasks/page.tsx` + `TasksPageClient.tsx` (list). `app/tasks/[id]/page.tsx` renders the **same list** with a right **slide-over** open for that id (Esc / overlay click closes to `/tasks`; Slack-pasteable URL). Flag off → server EmptyState "Codex is not enabled" (no client fetch). Flag on → four tabs on the list:

| Surface | Behaviour |
|---|---|
| **Tasks** | Flat **list** (TanStack, contained width) or **board** (dnd-kit columns for `backlog\|todo\|in_progress\|waiting\|done`, full viewport minus nav; columns `flex-1` with min width, horizontal scroll only below min). Shared filter state — switching view does not reset My Tasks / client / status / search / category / MBA scope. Compact toolbar: search, client combobox, assignee combobox (active roster, not free-text email), category combobox, status pills, My week, All tasks, view toggle. Active filters render as removable chips. State survives reload via URL params (`?mba=` / `?client=` preserved; also `q`, `assignee`, `category`, `status`, `all`, `week`, `view`). Layout defaults to **board** when `view` is absent; last choice is remembered in `localStorage` `codex.tasksLayout` (try/catch, convenience only — `view=list` on a shared link still opens list). **Quick-add** bar (list + board): Enter creates `todo` assigned to me; inline `@assignee` `#client` `!high/!low` `due …` (Sydney) `~2h`/`~45m` estimate with chip preview — unmatched tokens stay in the title. **My week** saved view: assigned to me, due today..+7 Sydney, not done. List **bulk select** → status / assignee / due. Row/card → `/tasks/[id]` (list stays visible under the slide-over). Modal create still available (optional **template** apply + **recurring_rule** seed). Soft delete via confirm. Deep link: `/tasks?task=<id>` → `/tasks/<id>`. Board drag → optimistic PATCH status (revert + toast). Cards show title, client, assignee, due (overdue critical), estimate chip when set, priority, checklist `done/total`. No swimlanes / WIP / extra statuses. Clients picker + quick-add fallback use `fetchClientsList` (empty + fail-soft → error, never "no clients"). |
| **Inbox** | Fireflies action-item proposals (`ava_task_proposals`, status `proposed`), grouped by meeting, **paginated by meeting group** (badge = full `pendingCount`, not the loaded page). Accept / Edit-then-accept / Dismiss / Accept all / **Dismiss all** (one confirm, one `POST /api/codex/proposals/dismiss-all` for the note’s full proposed set). Accept creates a task via `createTask` (`source=ava`, `actor_kind=ava`, `source_note_id` link). Unique-roster client action items auto-create tasks on sync (`auto_created` + `ava_auto_key`); Unassigned/ambiguous stay here. Duplicate title+MBA vs open tasks → “possible duplicate” flag only. Time-entry drafts never appear here; they belong to Team. |
| **Templates** | CRUD for `task_templates` + ordered `task_template_items` (checklist labels). Apply on task create copies labels into `task_checklist_items`. |
| **Team** | Roster table + `TeamMemberFormDialog` create/edit + **Sync roster** (`Auth0RosterSyncButton` → `POST /api/admin/auth0-roster-sync`). Layer 2 Management API eligibility: `getUserRoles({app_metadata})` admin and not free-mail, **or** no client role and email domain exactly `assembledmedia.com.au` (run result includes `treated as admin by domain rule`). Free-mail and client-role users are never roster-eligible. Sync does not write roles to Auth0 and does not deactivate; Luke toggles bogus rows in the UI. Columns include Sydney-week hours (from `time_entries`), **Est. open (h)** (sum of `estimated_minutes` on open assigned tasks), + open/overdue task counts; sortable by hours. Unmapped-time banner when `unmapped_count > 0` links to `/admin/myhours-mapping`. Shared-alias banner when `GET /api/codex/team` returns `alias_collisions` (report-only — never auto-resolve or deactivate). `TimesheetDraftsPanel` lists all members' current Sydney-week meeting-derived proposals from `ava_time_entry_proposals`. Confirm is the sole MyHours `Create Time Log` path and refreshes weekly hours; Skip writes no time. Structure-blocked rows link to `/admin/myhours-mapping`. Admin Auth0 login also fail-soft upserts the roster (`beforeSessionSaved`, claims-based); cron `GET/POST /api/cron/auth0-roster-sync` (`0 */6 * * *`) is a sibling of Fireflies, not piggybacked. |
| **Task detail** | Right `SlideOver` over the list (`TaskDetailSlideOver` + `TaskDetailClient`). Left-edge drag handle resizes the panel (min ~420px, max ~80vw, localStorage; double-click resets). Panel header: inline-editable title + **Mark complete**. Fields: status / priority / category / due / **estimate** (`1h 30m` / `45m` / `2h` → `estimated_minutes`) / assignee + **Ask for help** (roster picker excluding self, one-line ask ≤280 → child task on the helper’s board) / client / MBA searchable combobox of that client's campaigns labelled `<mba_number> — <campaign name>` (`GET /api/codex/client-mbas`, MBA number descending) — empty + disabled until a client is chosen. MBA links **one-way** to `/mediaplans/mba/[mba]/edit` (containment: nothing outside `/tasks` links back). Parent detail lists open help children as **Waiting on**. A help child shows a read-only snapshot of the parent (description / checklist / comments) above its own fields. Checklist tickboxes optimistic-PATCH (`applyChecklistToggle` / `persistChecklistToggle`); add/reorder/delete + "N of M"; comments (newest last); activity from `codex_activity` (`entity_type=task`) with legible before→after diffs via `formatActivityDiff`. Failed inline saves restore previous value + destructive toast. |

**People resolution (F16, C-193).** One resolver, `lib/codex/rosterResolve.ts`: `resolveRosterAddress` (an email: assignee writes, Ask for help, Fireflies attendees and action-item owners via `lib/fireflies/rosterAliases.ts`) and `resolveRosterMention` (a quick-add `@token`: email, local part, display name, unique partial name; only with `codex_roster_aliases` on: off, quick-add keeps its pre-F16 match, `legacyMatchTeamMember`, first row wins). Primary email always counts; `email_aliases` count for Fireflies always and for Codex behind `codex_roster_aliases`. Inactive rows never match. An address, alias, local part or exact name held by two people is ambiguous: no one is picked (quick-add keeps the token with "matches N people"). `rosterDisplayName` shows a name built from the email when the name field holds an email or is blank (board card, list cell, pickers, filter chips); the Team tab and the task detail picker still show the stored name.

**Saved views (F8, switch `codex_saved_views`, needs `codex_v2` and migration 0117, default off).** A Views menu above the toolbar (`SavedViewsMenu`): your views, views others shared, Save current filters as a view (name, Share with the team), and for your active view Rename, Share or Stop sharing, Delete. A view stores the `/tasks` query string (canonical, minus `view`) in `filters`, the layout in `layout`, `group_by` `status` for a board, `lens` `plan`, `screen` `tasks`. Picking a view applies its filters, sort and layout (`savedViewToolbarState`). The URL carries `view=<id>` (in place of `view=list`) while the toolbar shows the view unedited; change a filter and the menu says "(edited)" and the id leaves the URL. Opening `/tasks?view=<id>` applies the view once the views load; a deleted or private-to-someone-else view toasts and is ignored. Before 0117 the API says `available: false` and the menu stays hidden; the page loads as today. 50 views per person, held under concurrent saves by a per-owner advisory lock around the count and insert (C-203).

**Projects and sections (S1, B38, switch `codex_projects`, needs `codex_v2` and migration 0118, default off).** The API (B38) and the board (B39); task detail (B40), comments and notifications (B41) and My Work (B42) build on it. Rules in `lib/codex/projects.ts` (pure), store in `lib/codex/projectsRepo.ts`:
- A project has a kind (campaign, retainer, onboarding, pitch, internal, ops), an optional client (app exists-check, no FK) and MBA (one live project per MBA; Sinch is MBA `sinch001`, decision 42 A), an owner (defaults to the creator), members, a status (active, on_hold, closed) and dates. No delete in S1 (close it).
- Private projects: owner, creator and members see them; anyone else gets 404. Only the owner or creator changes private, owner or members (403 `not_owner`). Any staff member who can see a project can rename it, set its status and manage its sections.
- Sections are the board columns, in `sort_order`. Each has a status category (todo, in_progress, waiting, done), suggested from the name (plan 5.2: Done, Finished; Awaiting, Support needed; In Progress, Today, This Week; else to do) and editable. A new project gets the sections sent, or To do, In progress, Done; "Done" is appended when none is done.
- Moving a task into a section (`POST .../sections/[sectionId]/tasks`) sets its status to the category through the PATCH path (activity row, help parent restore), joins it to the project (from no project only; another project is 409 `other_project`) and puts it last unless `sort_order` is sent. Completing (`POST .../tasks/[taskId]/complete`) moves it to the first done section; a task already in a done section stays.
- A project always keeps a done section: the last one cannot be recategorised or deleted (409 `last_done_section`). A section is deleted only with no live tasks (409 `section_not_empty`); soft-deleted tasks in it lose their `section_id`. Recategorising a section does not re-status the tasks already in it.
- A status change from PATCH `/api/codex/tasks/[id]`, bulk or the Tasks board on a project task (switch on, after 0118) moves it by section (`updateTaskThroughSections`, `planStatusChangeInProject`): it stays when its section already has that status, done goes to the first done section, else the first section with that category; no such section (backlog never has one) is 409 `no_section_for_status` with nothing changed, and a bulk refusal rolls back the batch. Other status writers do not yet (C-220).
- Task activity is readable by all staff, so a private project's task activity rows (`move_section`, `create`) keep the ids and name no section; public projects keep the names.
- Not yet (later batches): tasks in private projects still show to all staff in the Tasks list, counts and search (C-211, B42); the new `tasks` columns are raw SQL until mirrored (C-210).

**Project board (B39, same switch).** `/tasks/projects/[id]` (`ProjectBoardClient` loads, `ProjectBoardView` draws, `ProjectBoardDialogs`); the Projects tab (`ProjectsPanel`, `?tab=projects`) lists the projects you can see and creates one (name, kind, optional MBA, owner, private; sections To do, In progress, Done). One board component for both views: `GenericTaskBoard` in `TaskBoard.tsx` takes a column source (statuses or the project's sections, `lib/codex/projectBoard.ts`).
- Columns are the sections in `sort_order`, headed by name and status; cards are the section's live tasks in `tasks.sort_order` (50 per section, then Load more). Card: title, assignee, due (overdue in the critical colour), priority (ASAP too), checklist, subtask (`task_type = 'subtask'`) and comment counts when there are any.
- Drag (`planBoardDrop`): into another section moves the card there and sets its status (a done section completes it); inside a section reorders. The board sends `after_task_id` (null for first); the store renumbers the section 0..n-1 in the same transaction and refuses a stale anchor with 409 `anchor_not_in_section`. Moves show at once and roll back with the server's message on any refusal (`commitBoardMove`).
- Section header menu (`sectionMenuItems`): paste tasks, rename, move left or right (reorder), collapse (this browser only, C-221), set status category (the last done section cannot change), delete (only when empty and not the last done section; the menu says why not). Add section suggests the status from the name, editable.
- Inline add in each column footer and bulk paste (one line per task, trimmed, blanks ignored, a count preview, 200 at most, `parsePastedTaskTitles`) both call `POST .../sections/[sectionId]/tasks/create`: new tasks go last, take the section's status and the project's client and MBA, created by you, unassigned.
- Hide or show completed: `codex_board_configs` per person and project (`scope` `project:<id>`) when the save works, else `?completed=hide|show` on the link; a link's value wins, then the stored one, then hide.
- Switch off: no Projects tab, the board page says projects are off. Before 0118: "Projects need a database update" on both, nothing errors.
- Before 0118 every call is 503 `migration_not_applied` (marker `0118_codex_s1_projects`; seen is cached for the process, missing for a minute). A missing table mid-query (42P01) is 503 too and drops the cached marker. A missing column (42703) is 503 only when a fresh marker read finds it missing; with the marker in place it is a real error (500), so a column typo is not hidden as "not applied" (STACKfix, review N2).
- Not yet (later batches): existing PATCH, bulk and board drag status changes do not move a project task between sections (B39); tasks in private projects still show to all staff in the Tasks list, counts and search (C-211, B42); the new `tasks` columns are raw SQL until mirrored (C-210).

**Search (F8, switch `codex_search`, needs `codex_v2`, default off).** A Search button in the page header opens `CodexSearchDialog`. `GET /api/codex/search` returns three groups, each with `more` when there are further hits: **tasks** (live only; title, MBA, description, comments; says where it matched and shows a snippet; a title hit, literal or on a word stem, is labelled title and ranks first), **Inbox** (`ava_task_proposals` still `proposed`; opens the Inbox tab) and **meetings** (`client_notes` title by ILIKE, summary and action items by full text; internal meetings included and marked, decision 52; Fireflies link when it is http(s); count of live tasks from the meeting). Matching is Postgres full text (`plainto_tsquery('english')`, the repo's pattern; `pg_trgm` is not installed) OR a literal ILIKE so partial words and MBA codes match. Meeting bodies are Fireflies JSON, so the full text runs on `CLIENT_NOTES_BODY_FTS_EXPRESSION` (the JSON keys and `\n` `\r` `\t` escapes blanked; C-202) and the snippet on the parsed summary and action items (`meetingSearchText`). Migration 0116 adds `idx_client_notes_body_fts` on exactly that expression; without it the meeting arm is a sequential scan (about 220 to 340 ms on 341 meetings, 13 Nov 2026). Tasks and Inbox items are not indexed (under 100 ms). The list toolbar search (`?q=`) is unchanged: title, description and MBA only.

**Default scope:** `mine=1` → `assignee_email = me OR created_by_email = me` (includes unassigned tasks I created). **All tasks** toggle clears that scope so null-assignee rows stay visible. Exact `assignee_email` filter still excludes unassigned by design (`resolveListAssigneeScope`).

**Filters:** client (`client_id` / deep-link `?client=`), MBA (`mba_number` / deep-link `?mba=`), status (multi / `?status=`), assignee roster combobox (when not mine / `?assignee=`), category (`?category=`), text search (`?q=`, server side: ILIKE on title, description and MBA number, `taskSearchCondition`; comments and meetings are in **Search**, not here), `?all=1`, `?week=1`, `?view=list` (board is the omitted default; `?view=<number>` is a saved view), plus `priority`, `overdue`, `unassigned`, `no_client`, `created_by`, `due_from`, `due_to`, `source`, `sort` (`lib/codex/queryHelpers.ts`). Last layout is `codex.tasksLayout` in localStorage. Sort: `due_date` / API sorts `due_date_asc|desc`, `created_at_desc`. List responses include `checklist_done` / `checklist_total` (aggregated from `task_checklist_items`) for board cards.

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
| POST | `/api/codex/tasks/[id]/dismiss-auto` | `dismissAutoCreatedTask` — auto-created meeting tasks only |
| POST | `/api/codex/tasks/bulk` | `bulkUpdateTasks` / `bulkSoftDeleteTasks`: 1 to 200 ids; status, assignee, due, priority, category, or delete |
| GET | `/api/codex/tasks/status-counts` | `countTasksByStatus`: board column counts for the same filters as the list (unknown statuses count as To do) |
| GET | `/api/codex/tasks/counts` | `countTasksByMba` — `?mba=A,B` open + overdue (Sydney) per MBA |
| GET | `/api/codex/client-mbas` | `campaignsForClientFromPlans(readPlanMasters(), client_id)` — `{ mba_numbers, campaigns }` descending; labels `<mba> — <campaign name>` |
| GET | `/api/codex/time/summary` | `getMbaTimeSummary` — `?mba=` hours-to-date + by-member + 4-week sparkline (admin-gated; not for client roles) |
| GET | `/api/codex/time/team-week` | `getTeamWeekTimeSummary` — Sydney-week hours per roster member + Est. open hours + open/overdue + `unmapped_count` |
| GET | `/api/codex/time/proposals` | `listTimeEntryProposalsForWeek` — `?week_start=` Monday YMD (defaults to current Sydney week), with client/campaign display fields |
| POST | `/api/codex/time/proposals/[id]/confirm` | `confirmTimeEntryProposal` — overlap/structure guards, then the sole intentional MyHours time-log write |
| POST | `/api/codex/time/proposals/[id]/skip` | `skipTimeEntryProposal` — records the human terminal decision without a MyHours write |
| GET, PATCH, DELETE | `/api/codex/tasks/[id]` | `getTask`, `updateTask`, `softDeleteTask`. Marking the last open help child done, or soft-deleting it while the parent is still `waiting`, restores `help_prior_status` (fallback `in_progress`). Reopening a done help child puts the parent back to `waiting` |
| POST | `/api/codex/tasks/[id]/help` | `requestHelp` — `{ assignee_email, ask }` creates a child assigned to the helper and moves the parent to `waiting` |
| GET, POST | `/api/codex/tasks/[id]/checklist` | `listChecklistItems`, `createChecklistItem` / `reorderChecklistItems` (`ordered_ids`) |
| PATCH, DELETE | `/api/codex/tasks/[id]/checklist/[itemId]` | `updateChecklistItem`, `deleteChecklistItem` |
| GET, POST | `/api/codex/tasks/[id]/comments` | `listComments`, `createComment` |
| DELETE | `/api/codex/tasks/[id]/comments/[commentId]` | `deleteComment` (no edit) |
| GET | `/api/codex/tasks/[id]/activity` | `listTaskActivity` (requires live task) |
| GET, POST | `/api/codex/team` | `listTeamMembers`, `createTeamMember` |
| PATCH | `/api/codex/team/[id]` | `updateTeamMember` |
| GET | `/api/codex/client_notes` | `listClientNotes` (read-only in Stage 0) |
| GET, POST | `/api/codex/saved-views` | `listSavedViews` (own + shared, `?screen=tasks`; before 0117: 200 `{ available: false, items: [] }`), `createSavedView` (owner = session email; 50 per person, 409; count and insert in one transaction under a per-owner advisory lock). Behind `codex_saved_views` |
| PATCH, DELETE | `/api/codex/saved-views/[id]` | `updateSavedView` (`name`, `shared`), `deleteSavedView`. Owner only: someone else's shared view 403 `not_owner`, private or missing 404; 503 before 0117 |
| GET, POST | `/api/codex/projects` | `listProjects` (`?status=`; private projects to owner, creator and members only), `createProject` (201 with sections). Behind `codex_projects`; 503 `migration_not_applied` before 0118 (every projects route) |
| GET, PATCH | `/api/codex/projects/[id]` | `getProject` (with sections), `updateProject` (`name`, `status`; `is_private`, `owner_email` owner or creator only, 403). A private project not yours is 404 |
| POST, DELETE | `/api/codex/projects/[id]/members` | `addProjectMembers` (`{ emails }`), `removeProjectMember` (`?email=`). Owner or creator only |
| GET, POST | `/api/codex/projects/[id]/sections` | `listSections`, `createSection` (last; category suggested from the name) |
| PATCH, DELETE | `/api/codex/projects/[id]/sections/[sectionId]` | `updateSection` (`name`, `status_category`, `collapsed_default`), `deleteSection` (empty only; 409 `section_not_empty`, `last_done_section`) |
| POST | `/api/codex/projects/[id]/sections/reorder` | `reorderSections` (`{ ordered_ids }`, every section once; 400 `invalid_order`) |
| GET, POST | `/api/codex/projects/[id]/sections/[sectionId]/tasks` | `listSectionTasks` (Load more: `?offset`, `?limit` 1 to 200, `?completed`), `moveTaskToSection` (`{ task_id, sort_order? \| after_task_id? }`): status from the section category; 409 `other_project`, `anchor_not_in_section` |
| POST | `/api/codex/projects/[id]/sections/[sectionId]/tasks/create` | `createTasksInSection` (`{ titles }`, 1 to 200; 201) |
| GET | `/api/codex/projects/[id]/board` | `loadProjectBoard` (`?completed=hide\|show`, `?per_section`): sections, first page per section, counts, `hide_completed` and its source |
| PUT | `/api/codex/projects/[id]/board-config` | `setBoardHideCompleted` (`{ hide_completed }`) |
| POST | `/api/codex/projects/[id]/tasks/[taskId]/complete` | `completeProjectTask`: to the first done section |
| GET | `/api/codex/search` | `searchCodex` (`lib/codex/searchRepo.ts`): `?q=` (2 to 100 characters) `&limit=` (default 8, max 25 per group). Behind `codex_search` (404 before auth when off) |
| GET, POST | `/api/codex/templates` | `listTemplates`, `createTemplate` |
| GET, PUT, PATCH, DELETE | `/api/codex/templates/[id]` | `getTemplate`, `updateTemplate`, `deleteTemplate` |
| GET, POST | `/api/codex/templates/[id]/items` | `listTemplateItems`, `createTemplateItem` / `reorderTemplateItems` |
| PATCH, DELETE | `/api/codex/templates/[id]/items/[itemId]` | `updateTemplateItem`, `deleteTemplateItem` |
| GET, POST | `/api/codex/proposals` | `listProposedInbox` (paginated by meeting; `pendingCount` is the full set), `batchAcceptForNote` |
| POST | `/api/codex/proposals/[id]/accept` | `acceptProposal` (optional edits body) |
| POST | `/api/codex/proposals/[id]/dismiss` | `dismissProposal` → status `rejected` |
| POST | `/api/codex/proposals/expire-stale` | `expireStaleProposals`: `proposed` rows older than 21 days (meeting date, else created) become `expired`; never deleted |
| POST | `/api/codex/proposals/dismiss-all` | `dismissAllProposedForNote` — one UPDATE of the note’s full proposed set |
| GET, POST | `/api/cron/codex-recurring` | `runCodexRecurring` — `CRON_SECRET` gate (not Codex flag/auth matrix) |

Every handler: `codexFlagGuard()`, then its own switch where it has one (`codex_search`, `codex_saved_views`, `codex_projects`), then `requireCodexInternalAccess()` (`app/api/codex/_shared.ts`). Checked 13 Nov 2026: all 44 route files, every method (the 11 projects files pinned by `routes.projects.test.ts`; PATCH and bulk with `codex_projects` by `routes.taskSections.test.ts`).

**Assignee writes (F16, switch `codex_roster_aliases`, needs `codex_v2`, default off).** `POST /tasks`, `PATCH /tasks/[id]`, `POST /tasks/bulk` and `POST /tasks/[id]/help` pass a non-empty `assignee_email` through `resolveAssigneeForWrite` (`lib/codex/assigneeWrite.ts`, roster from `lib/codex/rosterRead.ts`): an address one active person holds (main or alias) stores that person's main email and display name; an address two people hold is 409 `{ error: "ambiguous_assignee", message, holders }` and nothing is written; an address no one holds saves as sent. Switch off: the address passes through untouched and the roster is not read. Quick-add @mentions count aliases under the same switch (`clientFeatureOn`).

**Gate order (pinned by `lib/codex/__tests__/routes.flagAuth.test.ts`):**

1. `codex_v2` off → **404** `{ error: "not_found" }`: module invisible; not 403. Then a route's own switch off → **404** (search, saved views; `routes.search.test.ts`, `routes.savedViews.test.ts`).
2. No session → **401** `{ error: "unauthorised" }`.
3. Session but role outside `CODEX_SHADOW_ROLES` → **403** `{ error: "forbidden" }`.
4. Admin (shadow allowlist) → handler runs.

Middleware only authenticates; tenant/role is per-route. Writes stamp email identity (lowercased/trimmed) and append `codex_activity` **in the same `db.transaction` as the mutation** (Stage 0 hardening). `client_id` on create/PATCH is app-checked via `codexClientExists` (no DB FK until T6 — DI-12).

---

## Tables (`db/schema/codex.ts`; 0013 plus later migrations)

Live rows 13 Nov 2026: `tasks` 502 live (0 with an estimate, 0 recurring seeds, 0 help children), `client_notes` 341 (104 internal), `team_members` 12 (11 active), `codex_activity` 2,011, `ava_task_proposals` 1,648 (126 proposed), `ava_time_entry_proposals` 265, `client_domains` 58, `publisher_domains` 1, `meeting_title_rules` 1, `fireflies_sync_state` 238; templates, checklist items, comments and assignment rules 0.

| Table | Status | Notes |
|---|---|---|
| `tasks` | **Live** | Create / list / patch / soft-delete; `auto_created` + `ava_auto_key` (0040, partial unique `uq_tasks_ava_auto_key` when set); `estimated_minutes` integer NULL (0048; mirrored in `db/schema/codex.ts`); help-request columns `parent_task_id` / `help_requested_by_email` / `help_prior_status` (0078 applied) |
| `client_notes` | **Live** (read API + Fireflies writes) | GET list; Fireflies sync inserts; `attributed_type` + `publisher_id`; assign + Sync now at `/admin/fireflies-unattributed` (Fireflies meetings). Ava policy excludes internal (0114). Body full-text index `idx_client_notes_body_fts` (0116, authored) |
| `team_members` | **Live** | Roster CRUD; `email_aliases` jsonb; `auth0_user_id` / `roster_source` / `last_login_at` (0045). New aliases that another **active** row already holds are refused. `roster_source` is set only on insert (`manual` / `auth0_login` / `auth0_sync`); login and sync updates never overwrite it. |
| `codex_activity` | **Live** (writes + GET list) | Append-only from repo; `GET .../activity` reads task-scoped rows; UI formats diffs via `lib/codex/activityDiff.ts` |
| `client_domains` | **Live** (Fireflies) | Domain→client for attribution (second after title); seeded from `clients.keyemail` / `billingemail` / `website` excluding vendor domains; learned on client assign (MR-5) |
| `publisher_domains` | **Live** (Fireflies, 0043 applied) | Domain→publisher; learned on publisher assign; never seeded; skipped if free-mail, roster, or already in `client_domains` |
| `meeting_title_rules` | **Live** (Fireflies, 0043 applied) | Normalised title → `internal` / `new_business`; upserted on those assigns; same normalisation as client title match |
| `task_templates` | **Live** (API + Templates tab) | Name + description; hard delete cascades items |
| `task_template_items` | **Live** (API + Templates tab) | Ordered checklist labels; hard delete |
| `task_checklist_items` | **Live** (API + detail UI) | Stage 1 detail — hard delete (no `deleted_at`) |
| `task_comments` | **Live** (API + detail UI) | Stage 1 detail — hard delete; no edit; `author_kind` user\|ava |
| `ava_task_proposals` | **Live** (Inbox tab) | Unassigned/ambiguous action items; unique-roster client items auto-create tasks instead |
| `assignment_rules` | **Live** (training writes) | Auto-created Dismiss inserts `source=learned` `active=false`; do not auto-assign from these yet |
| `fireflies_sync_state` | **Live** (cron cursor) | Poll cursor + run log; `GET/POST /api/cron/fireflies-sync` |
| `ava_time_entry_proposals` | **Live** (Team tab drafts, 0032) | See **Adjacent MyHours proposal table** below |
| `codex_saved_views` | **Authored** (0117, not applied) | Saved views (F8). Read only after marker `0117_codex_saved_views` |
| `codex_projects`, `codex_project_members`, `codex_sections` | **Authored** (0118, not applied) | Projects, members, sections (S1). Read only after marker `0118_codex_s1_projects` (`projectsRepo.ts`) |
| `codex_custom_fields`, `task_followers`, `task_attachments`, `codex_board_configs`, `codex_notifications`, `codex_notification_prefs`, `codex_user_prefs` | **Authored** (0118, not applied), unused | For B39 to B42. RLS on, no `ava_readonly` grant. `tasks` gains `project_id`, `section_id`, `task_type`, `assigned_by_email`, `start_on`, `due_on`, `sort_order`, `completed_at`, `custom_values`, `created_by_automation`; `task_comments` gains `mentions`. Those columns are not in the Drizzle mirror until 0118 runs (C-210). Trigger `trg_tasks_codex_s1_sync` keeps `due_on` (Sydney civil date) and `due_date` in step and `completed_at` on done tasks only; a write that sets both to different Sydney days is refused (STACKfix, review L4) |

**Q23:** provisioned-but-dead Codex tables were created early **on purpose** and are to be **integrated during rollout** (Stages 1–5). Do not drop them as unused schema; do not treat empty as abandoned. Templates + template items are live; Fireflies wires `client_notes` / `client_domains` / `publisher_domains` / `meeting_title_rules` / `fireflies_sync_state` / `ava_task_proposals`.

No FKs from Codex `client_id` columns to `clients` until T6 (DI-12). New 0013 tables: RLS on, **no** `ava_readonly` grants (fail closed). Exception: `client_notes` is on the AVA allowlist, internal notes excluded — see standing decision below.

**`myhours_links` integrity:** partial unique index `idx_myhours_links_kind_mba_unique` on `(kind, mba_number) WHERE mba_number IS NOT NULL` (migration 0028). One MyHours structure link per kind per MBA — not a performance hint. Separate from `UNIQUE (kind, myhours_id)`.

**Adjacent MyHours proposal table:** migration `0032_ava_time_entry_proposals.sql` adds `ava_time_entry_proposals` (RLS on; no `ava_readonly` grant). Fireflies sync upserts one draft per `(source_note_id, member_email)` only for non-internal, client-attributed meetings whose attendee uniquely matches an active roster member (canonical or `email_aliases`). A colliding alias writes no draft. Re-sync refreshes `proposed` / blocked rows but never overwrites terminal `confirmed` / `skipped` decisions. `entry_date` is the Sydney civil date converted from the Fireflies UTC meeting instant. Internal-domain resolution prefers `INTERNAL_EMAIL_DOMAINS`; unset or blank configuration falls back to `DEFAULT_ASSEMBLED_DOMAINS` (blank also warns), never an empty internal-domain set.

---

## Standing decision: AVA and `client_notes` (Q22, narrowed by F9)

**AVA keeps SELECT on `client_notes` for client and publisher meetings, never internal ones.** The grant is from `0003_ava_readonly.sql`; migration 0114 (applied 2 Nov 2026, decision 10 A) narrowed the `ava_read` policy to `is_internal IS NOT TRUE AND coalesce(attributed_type, '') <> 'internal'`. Do not revoke the grant as a tidy-up, and do not widen the policy. Staff still see internal summaries in Codex (decision 52). New Codex tables stay deny-by-default for AVA until explicitly allowlisted (`codex_saved_views` and the ten 0118 tables have no grant).

---

## Key files

- `lib/codex/{repo,types,flag,shadowRoles,queryHelpers,activityDiff,quickAddParse,recurringRule,runRecurring,seedTasks,auth0LoginUpsert,auth0RosterSync,rosterEligibility,auth0RosterStore,rosterEmailAlias,rosterAliasGuard,rosterLoginCheck,rosterResolve,rosterRead,assigneeWrite,clientMbas,checklistToggle,helpRoster,search,searchRepo,savedViews,savedViewsRepo,projects,projectsRepo,projectBoard}.ts`
- `lib/fireflies/{client,attribution,internalDomains,sync,runSync,assign,assignTargets,learnableDomains,titleClients,rosterAliases,lookback,seedDomains,actionItems,actionItemBlocks,autoCreate,proposals,proposalRepo,timeEntryDrafts}.ts` — Fireflies GraphQL pull + attribution + unique-roster auto-create + task-proposal Inbox + time-draft generation
- `lib/myhours/{proposalRepo,timeEntryProposals,overlap,ensureOneStructure,client}.ts` — Team-week proposal reads, Confirm/Skip decisions, overlap/structure gates, and the sole MyHours write
- `app/api/codex/**`, `app/api/cron/codex-recurring/route.ts`, `app/api/cron/fireflies-sync/route.ts`, `app/api/cron/auth0-roster-sync/route.ts`, `app/tasks/**`
- `app/admin/fireflies-unattributed/**`, `app/api/admin/fireflies-unattributed/route.ts`, `app/api/admin/auth0-roster-sync/route.ts`, `app/api/admin/fireflies-sync/route.ts`
- `components/tasks/{CodexSearchDialog,SavedViewsMenu,TasksFilterBar,TaskBoard,TaskBulkBar,TaskDetailClient,TaskDetailSlideOver,TaskMbaSelect,TaskChecklist,TaskAskHelpDialog,TaskFormDialog,TaskQuickAdd,TeamMemberFormDialog,TemplateFormDialog,Auth0RosterSyncButton,ProjectBoardClient,ProjectBoardView,ProjectBoardDialogs,ProjectsPanel}.tsx`
- `db/schema/{codex,myhours,meetingAttribution}.ts`, `db/migrations/0013_codex_v2.sql`, `db/migrations/0025_codex_tasks_source_profile.sql`, `db/migrations/0029_fireflies_client_notes.sql`, `db/migrations/0030_ava_proposals_mba.sql`, `db/migrations/0032_ava_time_entry_proposals.sql`, `db/migrations/0039_fireflies_client_first.sql`, `db/migrations/0040_fireflies_auto_create.sql`, `db/migrations/0043_meeting_attribution_targets.sql`, `db/migrations/0045_team_members_auth0.sql`, `db/migrations/0048_tasks_estimated_minutes.sql`, `db/migrations/0078_tasks_help_request.sql`, `db/migrations/0114_ava_client_notes_not_internal.sql`, `db/migrations/0116_codex_search_index.sql`, `db/migrations/0117_codex_saved_views.sql`, `db/migrations/0118_codex_s1_projects.sql`
- Tests: `test:codex-flag-auth`, `test:codex-stage0-guarantees` (DB-gated; 0 tests without a database), `test:codex-stage1-detail`, `test:codex-stage1-scope`, `test:codex-stage1-templates`, `test:codex-auth0-roster`, `test:codex-task-detail-ui`, `test:codex-search`, `test:codex-saved-views`, `test:codex-search-views-ui`, `test:codex-projects` (its two Postgres suites need `CODEX_PROJECTS_TEST_DATABASE_URL`, a local `*_codex_test` database; the board suite uses a sibling `*_board_codex_test`), `test:codex-board-ui`, `test:ava-f14`, `test:features`, `test:fireflies`, `test:myhours`. Not in any script (run with `npx tsx --test`): `boardCounts`, `countTasksByStatus`, `repoHelpers`, `seedTasks`, `types` tests under `lib/codex/__tests__` (16 pass, 13 Nov 2026; C-201). There is no `test:codex-seed-tasks`.

## Campaign seed (`lib/codex/seedTasks.ts`)

Plumbing only — **not** called from campaign create. `seedTasksForCampaign({ mbaNumber, clientId, campaignStart, campaignEnd, profile, actor })` expands a profile’s `{ label, dueOffset, ownerRole }` rows (Sydney civil dates), creates tasks with `source=profile:<name>` and `actor_kind=system` (C-39), and is idempotent on `(mba_number, source, label)`. Past-due dues are created with description flag `[codex-seed-flag:past-due]` (never skipped). Hard-coded data profile: `CAMPAIGN_PROFILE` ("Campaign"). Month-end rows expand to one task per flight month (`Monthly report — YYYY-MM`). Requires `0025_codex_tasks_source_profile.sql` (`source LIKE 'profile:%'`).

## Recurring rule format (`tasks.recurring_rule`)

Boring text — **no cron-expression parser**. All date decisions use **Australia/Sydney** civil time (`lib/codex/recurringRule.ts`).

| Rule | Meaning | Period key |
|---|---|---|
| `monthly:<day>` | Day N of each Sydney month (1–31; clamp to last civil day) | `YYYY-MM-dN` |
| `weekly:<dow>` | `mon\|tue\|wed\|thu\|fri\|sat\|sun` | `YYYY-Www-dow` (ISO week of due date) |
| `monthly:lbd` | Last Mon–Fri of the Sydney month (no public-holiday calendar) | `YYYY-MM-lbd` |

**Series seeds:** live tasks with non-null `recurring_rule` + `template_id` + `client_id`, and status not `done`. A done seed stops. Cron `GET /api/cron/codex-recurring` (`CRON_SECRET`, Vercel `30 19 * * *`) generates children with `source=recurring`, `recurring_rule=null`, checklist copied from the template, `due_date` = period due YMD.

**Idempotency:** key `(seed task id, period)`, stamped as `[codex-period:<key>]` then `[codex-seed:<id>]`. Soft-deleted instances do not block regeneration. Running the job twice on the same Sydney day creates one task. Catch-up fills missed due dates back to the later of the seed's created Sydney day and 31 Sydney days ago.

## Depends on

Auth0 session + `getUserRoles`; `GET /api/clients` for pickers; Postgres owner connection for writes (not `ava_readonly`). Cron uses `CRON_SECRET` only.

## Consumed by

Sidebar (`CODEX_SHADOW_ROLES` visibility). Read only, admins only (decision 3 B): `CampaignHoursWidget`, Client Hub and Publisher Hub meetings. Writers outside `/tasks` that decision 3 B does not allow yet (C-200): `CampaignAskHelpDialog`, the scenario planner, `CreativeAdminLanding` (`TaskFormDialog`), relabel handlers and auto-close. Nothing new should import Codex write paths outside `/tasks`.

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
- 2026-08-14 — Task detail is a right slide-over over the list (`/tasks/[id]` still pasteable; list + panel). Left-edge resize persists in localStorage. MBA is a client-scoped searchable combobox labelled `<mba> — <campaign>` (desc). Planner `estimated_minutes` (0048 applied; mirrored in Drizzle). Inbox GET paginates by meeting; dismiss-all is one UPDATE of the note’s full proposed set. Filter toolbar state is URL params; board is full-width.
- 2026-08-07 — Stage 1 step 3 board: `@dnd-kit` installed; list/board toggle shares filters; drag → PATCH status with revert+toast; listTasks enriches `checklist_done`/`checklist_total` for cards.
- 2026-08-07 — Stage 1 step 4 capture: quick-add parser (`lib/codex/quickAddParse.ts`) + chip preview; category filter; My week view; list bulk status/assignee/due; clients via `fetchClientsList` only.
- 2026-08-07 — Stage 1 step 5 templates + recurring: Templates tab; apply-on-create checklist; `recurring_rule` format in this page; idempotent `/api/cron/codex-recurring` keyed on `(template_id, client_id, period)` Sydney.
- 2026-08-11 — Stage 1 addendum: `/tasks?mba=` + `/tasks?client=` deep-link filters; detail MBA one-way link to campaign edit; `countTasksByMba` + `GET /api/codex/tasks/counts` (open/overdue, Sydney).
- 2026-08-11 — Campaign seed plumbing: `seedTasksForCampaign` + `CAMPAIGN_PROFILE` (no create trigger); `tasks_source_check` allows `profile:%` (0025).
- 2026-08-28 — Shared `email_aliases` (`samantha@` on two active rows) is detect-not-resolve: resolution declines, Auth0/create/PATCH refuse a new colliding alias, Team tab reports holders. Luke picks who keeps the address (C-58).
- 2026-10-06 — R0 repair pack started (av-review/PACK-codex-R0-repair-2026-10-06.md). 0078 confirmed applied. Inbox held 1,427 proposed rows, 1,403 older than 21 days.
