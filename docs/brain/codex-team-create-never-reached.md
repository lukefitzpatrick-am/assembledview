# Codex — `team_members` insert never reached DB

**Status:** settled (7 Aug). **No product fix** — not a team-only code defect.
**Fact:** `team_members_id_seq.is_called = FALSE` ⇒ Postgres has never evaluated that identity. Meanwhile `tasks` inserts succeeded (1 Aug + 4 Aug). Flag/role gates shared with tasks are ruled out.

**Verdict:** Team create was never completed against this database. The submit path is live; tasks do not require a roster row (create defaults assignee to session email when the roster is empty). Stage 0 exit smoke that seeds the Team tab was never closed.

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

Non-2xx responses toast destructive with message — not ignored.

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

**Tab reachable:** Tasks | Team `TabsTrigger`s; default tab is Tasks. Team is secondary but present for admins with Codex shadow access.

**Not a Cinema/OOH dead-handler:** `onClick` → `openCreateMember`; form `onSubmit={onSubmit}`; submit button `type="submit"`. Same pattern as the working task dialog.

### 3. `POST /api/codex/team` (`app/api/codex/team/route.ts`)

Order: `codexFlagGuard` → `requireCodexInternalAccess` → parse JSON → require non-empty `email` + `name` → `createTeamMember(...)` → 201.

No other gates. Same flag/role helpers as tasks POST.

### 4. `createTeamMember` (`lib/codex/repo.ts`)

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

## Why tasks worked without Team

| Aspect | Task (works) | Team (never inserted) |
|---|---|---|
| Open CTA | Hero **New task** on Tasks tab; Creative landing too | Hero **Add member** only when `mainTab === "team"`; empty-state CTA on Team tab |
| Extra create surfaces | `CreativeAdminLanding` | **None** — Team tab only |
| Assignee without roster | Create defaults `assignee_email` to `/api/me` when roster empty | N/A |
| Zod hard fields | `title` min1; **`client_id` positive** | `name` min1; `email` email |
| Auth/flag | shared | shared |

**Material difference:** tasks can be created without ever opening the Team tab. Team create has **no alternate entry**. After a valid submit, server paths are isomorphic.

---

## Settling evidence (finding, not hypothesis)

1. `is_called = FALSE` ⇒ `insert(teamMembers)` never executed on this DB (RLS/UNIQUE after nextval ruled out).
2. Shared flag/role with successful task POSTs ⇒ not a team-only gate bug.
3. Dialog → POST → `createTeamMember` wiring is live (same shape as TaskFormDialog).
4. No Zod unsatisfiable default on the create form.
5. Task create does not need `team_members` (session-email assignee fallback).
6. Stage 0 handoff still listed roster seeding + live smoke as owed; that smoke was never marked done.
7. Coverage added: `createTeamMember` insert→list→activity round-trip + POST route body→repo pin (`test:codex-stage0-guarantees`, `test:codex-flag-auth`).

---

## Fix?

**None for the empty sequence.** Path works; it was unused. Seed the roster via Team → Add member (expect `POST /api/codex/team` → 201).
