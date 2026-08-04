# Codex `client_id` integrity — no FK to `clients`

Report only. No schema change, no migration. Confirms Claude’s live finding (4 Aug): a task can store a `client_id` that does not exist in `clients`.

**Register:** DI-12. **Deliberate 0013 design:** `db/migrations/0013_codex_v2.sql` and `db/schema/codex.ts` both state there are **no FKs to `clients`** until T6, because ETL truncate-reload of `clients` would collide with them.

---

## 1. Schema position (Drizzle + migration mirror)

### `tasks.client_id`

- Column: `bigint("client_id")` — **nullable in Drizzle**, no `.references()`, no `foreignKey({… clients …})`.
- Real FKs on `tasks` (only these two):
  - `template_id` → `task_templates.id` **ON DELETE SET NULL**
  - `source_note_id` → `client_notes.id` **ON DELETE SET NULL**
- Matches live: no `tasks.client_id` → `clients` constraint.

### Other Codex `client_id` columns

| Table | `client_id` → `clients` FK in Drizzle? | Notes |
|---|---|---|
| `tasks` | **No** | Index only (`idx_tasks_client_id_status`) |
| `client_notes` | **No** | Index only |
| `client_domains` | **No** | Index only |
| `assignment_rules` | **No** | Index via unique scope; `NULL` = global rule by design |
| `ava_task_proposals` | **No** | Index only; FKs are to `client_notes` / `tasks`, not `clients` |

### Related (not a scalar FK)

| Column | Integrity |
|---|---|
| `team_members.default_client_ids` (`bigint[]`) | **No** FK — Postgres cannot FK-array-to-`clients` without a junction table or trigger |

### Codex-internal FKs that *do* exist

`task_template_items.template_id`, `tasks.template_id`, `tasks.source_note_id`, `task_checklist_items.task_id`, `task_comments.task_id`, `ava_task_proposals.source_note_id`, `ava_task_proposals.created_task_id` — all Codex↔Codex. None of them validate against `clients`.

---

## 2. What the API does today

### POST `/api/codex/tasks`

Requires `client_id` to be present and (if a number) finite. **Does not** look up `clients`. Then calls `createTask` with `Number(clientId)`.

```130:154:app/api/codex/tasks/route.ts
    if (
      clientId === undefined ||
      clientId === null ||
      clientId === "" ||
      (typeof clientId === "number" && !Number.isFinite(clientId))
    ) {
      return NextResponse.json(
        { error: "bad_request", message: "client_id is required." },
        { status: 400 }
      )
    }
    // ...
    const task = await createTask(
      {
        title,
        clientId: Number(clientId),
```

### `createTask` (repo)

Inserts `clientId: input.clientId` with no existence check:

```246:248:lib/codex/repo.ts
    .values({
      title: input.title,
      clientId: input.clientId,
```

### PATCH `/api/codex/tasks/[id]`

`PATCH_ALLOWLIST` **excludes** `client_id`. `UpdateTaskInput` has no `clientId` field. Patch cannot retarget a task to another client — and cannot repair or introduce orphans via PATCH. Orphans are create-time (or direct SQL) only.

### UI

`TaskFormDialog` Zod requires `client_id: z.number().int().positive(...)` and the select is populated from the live clients list — so the **happy path UI** only offers real ids. That does not bind the API: any Codex-authed caller can POST an orphan id.

---

## 3. Options (propose only — do not implement)

| Option | What it prevents | What breaks / costs | Fit |
|---|---|---|---|
| **(a) App validation** — before insert, `SELECT`/`exists` on `clients`; **400** if missing. No migration. | New orphan writes via API/repo. | ~small route+repo change + test; every writer must share one helper. Does **not** fix existing orphans; bypassable via raw SQL. | **Do now** |
| **(b) FK `ON DELETE RESTRICT`** — migration 0018 `REFERENCES clients(id)`. | DB-enforced referential integrity for all writers. | **Fails to apply** while any orphan `client_id` exists. ETL truncate-reload of `clients` **breaks** until reloads end (0013’s stated reason; revisit at T6). Cost: orphan cleanup SQL + migration + drizzle mirror. | **After** orphan cleanup **and** ETL no longer truncates `clients` (T6) |
| **(c) FK `ON DELETE SET NULL`** | Survives client delete by nulling the pointer. | Conflicts with product: form requires positive `client_id`; list/UI assume a client. Nullable column + SET NULL creates “task with no client” the UI rejects on edit. Worse UX than RESTRICT for this product. | **Reject** for tasks |

### Orphan count today (no SQL run)

Exact count **unknown** without a live query. Proven floor from Claude (4 Aug): **≥ 1** — the 1 Aug task with `client_id = 8` while live clients were ids **2..54** (no id 8; cutover re-key risk). Stage 0 guarantee tests use a sentinel id and wipe their rows; they do not imply production orphans beyond that floor.

### Recommendation

1. **Ship (a) immediately** before Stage 1 puts real volume in `tasks` — closes the silent orphan path the UI does not protect against for API callers, no migration, no ETL collision.
2. **Plan (b) for T6** (or whenever `clients` truncate-reload ends): clean orphans first (`UPDATE`/`DELETE`/`repoint`), then add `ON DELETE RESTRICT`. Do **not** add the FK while ETL still truncates `clients`.
3. **Do not** choose (c) for `tasks` while the form treats client as required.

---

## 4. Dead Codex tables (Q23 rollout) — same treatment?

Stage 0 APIs touch **`tasks`**, **`team_members`**, **`client_notes`** (read), and **`codex_activity`** (via writes). The other **eight** Codex tables are schema-ready but unwired for product writes — cheaper to lock integrity **before** they carry data:

| Table | `client_id` / client refs | When wired, do what? |
|---|---|---|
| `client_domains` | `client_id` — no FK | Same as tasks: **(a)** on write now-or-at-wire; **(b)** RESTRICT at T6 with tasks |
| `client_notes` | `client_id` — no FK | Already readable; add **(a)** on any write path; include in T6 FK batch |
| `ava_task_proposals` | `client_id` — no FK | **(a)** when proposal create lands; T6 FK. `NULL` client only if product allows unmatched meetings |
| `assignment_rules` | `client_id` nullable (global) | FK must allow **NULL**; RESTRICT when non-null. App validation: null **or** existing client |
| `task_checklist_items` | no `client_id` | N/A (FK to `tasks` already) |
| `task_comments` | no `client_id` | N/A |
| `task_templates` / `task_template_items` | no `client_id` | N/A |
| `fireflies_sync_state` | no `client_id` | N/A |

**Also when Team defaults matter:** `team_members.default_client_ids[]` — validate each id exists on create/update (app-level); long-term prefer a junction table if DB FKs are required.

Getting **(a)** shared (`assertClientExists(id)`) into Codex write helpers **before** Stage 2–5 wires domains/notes/proposals/rules avoids a second orphan generation cycle after cutover re-keys.
