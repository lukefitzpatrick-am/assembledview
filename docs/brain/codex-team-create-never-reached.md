# Codex — `team_members` insert never reached DB

**Status:** investigation only (4 Aug). **No fix** — cause not proven as a code defect.
**Fact:** `team_members_id_seq.is_called = FALSE` ⇒ Postgres has never evaluated that identity. Meanwhile `tasks` inserts succeeded (1 Aug + 4 Aug). Flag/role gates shared with tasks are ruled out.

---

## STEP 1 — Full path (quoted)

### 1. `TeamMemberFormDialog` — schema, defaults, submit

```ts
const teamMemberFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  role_title: z.string().optional(),
  active: z.boolean(),
  capacity_notes: z.string().optional(),
  working_style: z.string().optional(),
})

defaultValues: {
  name: "", email: "", role_title: "", active: true,
  capacity_notes: "", working_style: "",
}
```

Submit (`form.handleSubmit`):

- **Edit** (`isEdit && member`): PATCH dirty fields only; empty patch closes dialog **without** fetch.
- **Create** (else): `POST /api/codex/team` with `{ name, email, role_title, active, capacity_notes, working_style }`.

Conditions that prevent create fetch:

| # | Condition | Silent? |
|---|---|---|
| 1 | Dialog `open === false` | n/a |
| 2 | Zod fails (empty name, invalid/empty email) | No — `FormMessage` |
| 3 | Native `type="email"` HTML5 constraint | Browser-native |
| 4 | `submitting` disables button after first click | After attempt only |
| 5 | Edit branch with empty dirty patch | Create N/A |

### 2. Parent wiring (`TasksPageClient`)

```ts
const openCreateMember = () => {
  setEditingMember(null)
  setTeamDialogOpen(true)
}
// Hero (only when mainTab === "team"):
<Button type="button" onClick={openCreateMember}>Add member</Button>
// Empty state:
emptyAction={<Button type="button" onClick={openCreateMember}>Add member</Button>}
// Sibling of <Tabs> (always mounted unless accessDenied):
<TeamMemberFormDialog
  open={teamDialogOpen}
  onOpenChange={setTeamDialogOpen}
  member={editingMember}
  onSaved={() => { void fetchTeam() }}
/>
```

**Not a Cinema/OOH dead-handler:** `onClick` → `openCreateMember`; form `onSubmit={onSubmit}`; submit button `type="submit"`. Same pattern as the working task dialog.

### 3. `POST /api/codex/team` (`app/api/codex/team/route.ts`)

Order: `codexFlagGuard` → `requireCodexInternalAccess` → parse JSON → require non-empty `email` + `name` → `createTeamMember(...)` → 201.

No other gates. Same flag/role helpers as tasks POST.

### 4. `createTeamMember` (`lib/codex/repo.ts:437-466`)

```ts
.insert(teamMembers).values({
  email,  // already trim+toLowerCase
  name: input.name.trim(),
  roleTitle, active, capacityNotes, workingStyle,
  defaultClientIds: input.defaultClientIds ?? [],
  createdAt, updatedAt,
  // no id
}).returning()
// then appendActivity
```

No `id`. Insert is the first DB touch. If this ran, `is_called` would be true (even on later unique/check failure in normal PG behaviour).

---

## TaskFormDialog vs TeamMemberFormDialog

| Aspect | Task (works) | Team (never inserted) |
|---|---|---|
| Open CTA | Hero **New task** on Tasks tab; Creative landing too | Hero **Add member** only when `mainTab === "team"`; empty-state CTA on Team tab |
| Extra create surfaces | `CreativeAdminLanding` | **None** — Team tab only |
| Zod hard fields | `title` min1; **`client_id` positive** (default `0` traps until select) | `name` min1; `email` email (defaults `""` fail until typed) |
| Zod trap like client_id=0? | Yes (near-miss) | **No** — no positive-number default that can never be fixed without UI |
| Optional fields | mba, assignee, due, description | role_title, capacity_notes, working_style |
| Create POST body | title, client_id, … | name, email, … |
| API pre-insert | title + client_id required | email + name required |
| Repo | `createTask` → insert + activity | `createTeamMember` → insert + activity |
| Auth/flag | shared | shared |
| Dead `onClick` / dead submit? | No | **No (proven wired)** |

**Material difference for “tasks worked, team never”:** tasks can be created without ever opening the Team tab (default tab + Creative). Team create has **no alternate entry**. Code paths after a valid submit are isomorphic.

---

## STEP 2 — Three silent-block checks

### (a) Zod default vs validator

| Field | Default | Validator | Blocks create fetch? |
|---|---|---|---|
| name | `""` | trim min 1 | Yes until filled — **visible** |
| email | `""` | trim email | Yes until valid — **visible** |
| role_title | `""` | optional string | No |
| active | `true` | boolean | No |
| capacity_notes | `""` | optional string | No |
| working_style | `""` | optional string | No |

**No `client_id: 0` / `.positive()` class trap.**

### (b) UNIQUE on email

Yes: schema + migration `email text NOT NULL UNIQUE`, plus `CHECK (email = lower(email))`. Repo lowercases before insert.

**Cannot explain `is_called = FALSE`.** A constraint violation still draws the sequence. Stopping here on that hypothesis.

### (c) Dead handler (Cinema/OOH class)?

**Disproved.** Both Add member buttons call `openCreateMember`; dialog submit is `form.handleSubmit` → `fetch POST` on create. No stub / no-op / wrong prop name.

---

## STEP 3 — Failing test?

**Not written.** Repo/route layer would **pass** for a valid POST body — that would false-green while the real gap (never reaching insert in prod) is “path never exercised” or a UI-only issue unobservable without browser.

A UI wiring characterisation test could lock the `onClick`/`onSubmit` contracts; that is optional follow-up, not a repro of a proven bug.

---

## STEP 4 — Fix?

**No.** No proven code defect that would keep `is_called = FALSE` while tasks succeed under the same flag/role.

---

## Ranked candidates (post-trace)

| Rank | Candidate | For | Against | Confidence |
|---|---|---|---|---|
| **1** | **Team create never completed a valid submit** (tab never used / form left invalid / smoke never done) | Seq never called; handoff Stage 0 exit still owed Luke smoke incl. Team add; tasks have other entry points; wiring is live | Assumes humans didn’t finish the form | **~75%** |
| **2** | **POST reached API but died before `createTeamMember`** (400 missing name/email) | Would leave seq untouched | Client Zod should block empty; would need bypass (curl/raw) with empty body | **~10%** |
| **3** | Hidden UI defect (dialog submit swallowed, wrong mode) | Would match evidence | Static read shows live wiring identical to working task dialog; not proven | **~10%** |
| **4** | Server insert uniqueness / CHECK / RLS | Ruled out for `is_called=FALSE` | — | **~0%** for this evidence |

### What was proven

1. Team create wiring is **not** dead (Cinema-class defect absent).
2. Team Zod has **no** unsatisfiable default trap.
3. UNIQUE/CHECK cannot explain unused sequence.
4. After a successful client POST with name+email, server path is the same shape as tasks and **must** hit `insert(teamMembers)`.

### What was not proven

Any code bug that silently blocks team create while allowing task create under shared gates.

### Confidence in “no code fix”

**~80%** that the right next step is Luke’s live **Add member** smoke (Network: expect `POST /api/codex/team` → 201), not a speculative patch.

If smoke shows POST → 201 and seq still false → wrong DB. If no POST in Network → UI/session. If POST → 4xx/5xx → capture status/body for a second pass.
