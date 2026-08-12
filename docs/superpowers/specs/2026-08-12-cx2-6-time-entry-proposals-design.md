# CX2-6: Fireflies → MyHours time-entry proposals (Team tab)

**Date:** 2026-08-12  
**Status:** Approved — implement  
**Surface:** `/tasks` Team tab (Option A)  
**Prereq:** CX2-1 MyHours Users join + activity pull (`time_entries` mirror, `myhours_links`, cron)  
**Non-goals:** Inbox mixing; auto-write without Confirm; `assignment_rules`

## Problem

Client-attributed Fireflies meetings imply billable time for internal attendees, but writing MyHours logs without a human gate creates silent wrong hours. The weekly confirm is a time ritual and belongs beside the hours it feeds (Team tab). The Inbox must stay “things AVA thinks are tasks” — timesheet drafts must not dilute that model.

## Decision summary

1. One draft row per (meeting × roster-matched attendee) in `ava_time_entry_proposals`.
2. Confirm / Skip on the Team tab; admin-gated surface ⇒ admins see all members and may confirm on behalf.
3. Confirm writes MyHours Create Time Log, then re-sync reconciles on `myhours_log_id` (no dupes).
4. Never write without Confirm. Skip discards. Overlap / structure failures park the row with an explicit reason — never silent drop.
5. Inbox / `ava_task_proposals` untouched.

---

## 1. Draft model

**Table:** `ava_time_entry_proposals` (new migration; RLS on; no `ava_readonly` grant — commercially adjacent to hours).

| Column | Notes |
|--------|--------|
| `id` | identity PK |
| `source_note_id` | FK → `client_notes.id` ON DELETE CASCADE |
| `member_email` | lowercased; roster email at draft time |
| `entry_date` | Sydney civil date of the meeting start: convert Fireflies UTC start → `Australia/Sydney`, take `YYYY-MM-DD` (never the raw UTC calendar day) |
| `duration_minutes` | from `client_notes.duration_seconds` (round); meeting length, not a guessed split |
| `note` | `"<meeting title> (Fireflies)"` — exact string written to MyHours on confirm |
| `client_id` | from attributed note |
| `mba_number` | from attribution when present (nullable) |
| `myhours_project_id` / `myhours_task_id` | optional cache; **not** required at draft creation |
| `status` | `proposed` \| `confirmed` \| `skipped` \| `blocked_overlap` \| `blocked_structure` |
| `block_reason` | human text when blocked (nullable) |
| `myhours_log_id` | set after successful Create Time Log; unique when not null |
| `confirmed_by_email` / `confirmed_at` | actor (admin-on-behalf OK) |
| `created_at` / `updated_at` | timestamps |

**Unique:** `(source_note_id, member_email)` — one draft per attendee per meeting.

**Invariant:** Sync / draft creation never calls MyHours entry write APIs. Structure ensure (project/task) may run on Confirm only (see §4). Schema comment on `time_entries` (“AV never writes time logs”) is superseded for the **confirm path only** — update brain/`db/schema/myhours.ts` comment in the same change set.

---

## 2. Two distinct “internal” rules (do not conflate)

### 2a. Meeting `is_internal` (attribution)

A meeting is internal when **every** attendee email’s domain is in the **internal domain set**.

- Config: `INTERNAL_EMAIL_DOMAINS` (env CSV), parsed to a lowercased `Set`.
- **Non-empty CSV** replaces the set. **Unset, empty, or whitespace-only** → fall back to `DEFAULT_ASSEMBLED_DOMAINS` (`assembledmedia.com.au`, `assembledmedia.com`, `assembled.media`, `assembledview.com.au`) and **log a config warning** when the env was present but empty/whitespace (foot-gun: empty would otherwise mark no domain internal and push all-Assembled meetings into the unattributed queue / allow drafts). Alias domains belong in the env list on deploys that need them.
- Wire Fireflies attribution to this resolver (call sites stop hard-coding the set). Internal meetings: `client_id` null, `is_internal` true — **no time-entry drafts**.

### 2b. Draft eligibility (roster)

A draft is created for an attendee **only if** their email (lowercased) matches an **active** `team_members` row. The roster is source of truth: you cannot confirm time for someone who is not on the roster.

- Client-attributed meetings only (`client_id` set, `is_internal` false).
- Unattributed / internal meetings → no drafts.
- Attendees not on the active roster → skipped for drafts (no sentinel required; they are out of product scope). Counted sentinels remain a MyHours Users-join concern (CX2-1), not this table.

---

## 3. Draft creation (Fireflies sync)

After a note is inserted/updated as **client-attributed**:

1. Collect attendee emails from the transcript payload (same source attribution uses).
2. Intersect with active `team_members.email`.
3. Upsert `ava_time_entry_proposals` for each match with status `proposed` **only if** the existing row is not already `confirmed` or `skipped` (do not resurrect decided rows).
4. Re-sync of the same meeting refreshes mutable fields (`duration_minutes`, `note`, `client_id`, `mba_number`) while status stays `proposed` / blocked_*.

Missing `myhours_links` at draft time is **fine** — leave project/task ids null.

---

## 4. Confirm: resolve-on-confirm (not blocked-until-mapped)

On Confirm (Team tab → API):

1. **Auth:** Codex internal / admin gate (same shadow as Team hours). Confirm-on-behalf allowed because the surface is admin-gated today.
2. **Resolve MyHours user:** look up `Users/getAll` by lowercased email. If absent → `status = blocked_structure`, `block_reason = "no MyHours user for <email>"`, re-confirm eligible (clears once the user exists in MyHours). **No write.** Confirm-path mirror of CX2-1’s unknown-user sentinel.
3. **Resolve structure:**
   - Look up `myhours_links` for client project + campaign task (MBA).
   - If absent, run **ensure-structure for that one client/campaign inline** (same logic as MyHours sync ensure — create/link project + `"<mba> — <Campaign Name>"` task). Cron already self-heals; Confirm must not force a mapping-screen detour when the link simply post-dates the draft.
   - **Race with cron:** `myhours_links` unique indexes protect link rows — on create conflict, re-read the link and continue; do not fail Confirm.
   - If still unresolvable → set `status = blocked_structure`, `block_reason = "no MyHours task for <mba>"` (or client-only wording when MBA missing), surface a link to `/admin/myhours-mapping`. **No MyHours write.**
4. **Overlap guard** (§5). On hit → `blocked_overlap` + reason; no write.
5. **Write:** MyHours Create Time Log (date, duration, note, projectId, taskId, userId from step 2). Persist returned log id → `myhours_log_id`, `status = confirmed`, `confirmed_by_email` / `confirmed_at`.
6. **Reconcile:** subsequent MyHours activity sync upserts `time_entries` on `myhours_log_id` — one mirrored row, no duplicate from the proposal.

**Skip:** `status = skipped`; no API write. Terminal unless product later adds “undo skip” (out of scope).

**Re-confirm:** `blocked_overlap` and `blocked_structure` rows remain Confirm-eligible. Re-running Confirm re-evaluates structure + overlap against current mirror/links; if clear, proceeds to write.

---

## 5. Overlap guard (two-tier; never same-day-only)

`time_entries` stores `entry_date` + `duration_minutes`; start/end exist only in `raw` jsonb when MyHours provides them. Therefore:

### Tier 1 — always available (block if either)

- An existing `time_entries` row for the **same `member_email` + `entry_date`** whose `note` equals the proposal note (`"<title> (Fireflies)"`), **or**
- The proposal already has a `myhours_log_id` that exists on `time_entries` (idempotent / already linked).

### Tier 2 — when both sides have usable start/end

- Meeting interval: from Fireflies transcript `date` / duration (start + `duration_seconds`) when a parseable start timestamp exists; if the meeting has **no** usable start, **skip Tier 2** (Tier 1 only).
- Entry interval: only when that day's `time_entries.raw` exposes parseable start/end (or start + duration). Entries without times do not participate in Tier 2.
- Block on genuine interval overlap only.

### Explicit non-rule

- **Never** block solely because another entry exists on the same day. People log other work on meeting days.

On block: `status = blocked_overlap`, `block_reason` names the conflicting log/note; UI shows why. After the conflicting entry changes (note edit, delete/re-sync, different day), Confirm may succeed.

---

## 6. Team tab UI

On `/tasks` **Team** tab, beside weekly hours:

- Section **Timesheet drafts** for the selected Sydney week (`entry_date` in week range).
- Columns: member · date · duration · meeting title · client/MBA · status · Confirm / Skip.
- `blocked_*` rows show `block_reason` + mapping link when `blocked_structure`.
- Visibility: all members’ drafts (admin-gated page). No Inbox entries for these rows.

---

## 7. APIs (sketch)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/codex/time/proposals?week_start=` | List drafts for Sydney week (+ roster join) |
| POST | `/api/codex/time/proposals/[id]/confirm` | Resolve → overlap → MyHours write |
| POST | `/api/codex/time/proposals/[id]/skip` | Skip |

Tenant: `requireCodexInternalAccess` (same as `/api/codex/time/*`). Routes implement their own checks.

---

## 8. Tests

| Case | Expect |
|------|--------|
| Confirm → MyHours write → re-sync | Exactly one `time_entries` row for that `myhours_log_id` |
| Skip | No MyHours write; status `skipped` |
| Tier-1 note match | `blocked_overlap`; no write |
| Tier-1 already-linked `myhours_log_id` | No second write |
| Tier-2 window overlap (when raw times present) | `blocked_overlap`; no write |
| Same-day other work (different note, no window overlap) | Confirm allowed |
| Roster miss | No draft created |
| Internal meeting (`is_internal`) | No drafts |
| Empty/`""` `INTERNAL_EMAIL_DOMAINS` | Falls back to `DEFAULT_ASSEMBLED_DOMAINS` (+ warning when env present but blank) |
| **UTC date-boundary meeting** | e.g. 2026-08-12T23:00:00Z → `entry_date` = `2026-08-13` (Sydney) |
| **Resolve-on-confirm** | Link missing at draft creation, present (or ensure creates) at Confirm → success |
| **Re-confirm after conflict** | `blocked_overlap` becomes confirmable after conflicting entry changes |
| Structure still missing after ensure | `blocked_structure` + reason; mapping link |
| **No MyHours user for roster email** | `blocked_structure`, `block_reason = "no MyHours user for <email>"`; no write; re-confirm eligible |
| Member visibility | Team lists drafts; admin sees every member |

Injectable MyHours transport; no live dial-out in unit tests.

---

## 9. Brain / docs updates (same commit as implementation)

- `INVARIANTS.md` — entry write only after human Confirm; internal domains via `INTERNAL_EMAIL_DOMAINS`; Inbox ≠ time drafts.
- `docs/brain/modules/codex.md` + `admin-misc.md` — Team drafts surface; Confirm path.
- `db/README.md` — new migration id.
- `db/schema/myhours.ts` — comment: mirror remains pull-SoR; Confirm is the sole intentional write path.
- Regenerate `api-tenant-classification.md` after new routes.

---

## Out of scope

- Mixing drafts into Inbox
- Non-admin self-serve confirm when Team stops being admin-gated (revisit visibility then)
- Undo Skip / expire policies
- Splitting one meeting across multiple MBAs
- Writing entries for non-roster emails
