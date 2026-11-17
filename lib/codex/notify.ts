/**
 * The one write path for Codex notifications (B41). Every event (comment,
 * assignment, due date, completion, attachment, follower added, the daily
 * due tomorrow and overdue run) goes through `writeNotifications`, which
 * loads the task's facts and the roster, asks the pure rule
 * (`recipientsFor`) who is told what (active roster members only), and
 * inserts the rows. Callers check `codex_notifications` first;
 * `notifyEnabled` does that and the 0118 marker in one place.
 *
 * Comment, follower and attachment events are written in the same
 * transaction as the change. Task changes from PATCH, bulk, create and the
 * project board are recorded right after the save (`recordTaskChanges`,
 * through `afterTaskWrite`): a failure there is logged and the save stands.
 *
 * Also here: the task facts (creator, assignee, project visibility) that the
 * comments, followers and attachments store share, and the follower writes.
 */
import "server-only"

import { eq, sql, type SQL } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { isFeatureOn } from "@/lib/features/server"
import {
  activeRosterCheck,
  effectiveFollowers,
  nextFollowReason,
  recipientsFor,
  taskChangeEvents,
  type FollowReason,
  type NotifyEvent,
  type TaskNotifyState,
} from "@/lib/codex/notifications"
import { canSeeProject, NO_ALIASES, type AccessIdentity, type ProjectAccessFacts } from "@/lib/codex/projects"
import type { DbExecutor } from "@/lib/codex/repo"
import { loadRosterPeople } from "@/lib/codex/rosterRead"
import { SYSTEM_ACTORS } from "@/lib/codex/systemActors"
import { loadAccessIdentity } from "@/lib/codex/taskVisibility"
import { normaliseEmail } from "@/lib/email/address"

const { codexNotifications, codexActivity, taskFollowers, codexProjects, codexProjectMembers } = schema

// ---------------------------------------------------------------------------
// Task facts
// ---------------------------------------------------------------------------

export type TaskFacts = {
  id: number
  title: string
  status: string
  created_by_email: string | null
  assignee_email: string | null
  /** `due_on` (Sydney civil date, kept in step with due_date by the 0118 trigger). */
  due: string | null
  project_id: number | null
  deleted: boolean
  /** The task's project access facts, or null for a task in no project. */
  project: ProjectAccessFacts | null
  /** F4: the alias map the access checks on this task use (empty for no project or the switch off). */
  identity?: AccessIdentity
}

function idList(ids: readonly number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::bigint`),
    sql`, `
  )
}

/** Raw read (the 0118 tasks columns are not mirrored, C-210). Only after the marker. */
export async function loadTaskFactsMany(database: DbExecutor, ids: readonly number[], lock = false): Promise<Map<number, TaskFacts>> {
  const out = new Map<number, TaskFacts>()
  const clean = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (clean.length === 0) return out
  const rows = executeRows(
    await database.execute(sql`
      SELECT id, title, status, created_by_email, assignee_email, due_on::text AS due_on, project_id, deleted_at IS NOT NULL AS deleted
        FROM public.tasks WHERE id IN (${idList(clean)}) ${lock ? sql`FOR UPDATE` : sql``}
    `)
  )
  const projectIds = [...new Set(rows.map((r) => (r.project_id == null ? null : Number(r.project_id))).filter((v): v is number => v != null))]
  const projects = await loadProjectFactsMany(database, projectIds)
  const identity = projectIds.length > 0 ? await loadAccessIdentity(database) : NO_ALIASES
  for (const r of rows) {
    const projectId = r.project_id == null ? null : Number(r.project_id)
    out.set(Number(r.id), {
      id: Number(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      created_by_email: r.created_by_email == null ? null : normaliseEmail(String(r.created_by_email)) || null,
      assignee_email: r.assignee_email == null ? null : normaliseEmail(String(r.assignee_email)) || null,
      due: r.due_on == null ? null : String(r.due_on),
      project_id: projectId,
      deleted: r.deleted === true || r.deleted === "t",
      project: projectId == null ? null : projects.get(projectId) ?? { is_private: true, owner_email: null, created_by_email: null, members: [] },
      identity,
    })
  }
  return out
}

export async function loadTaskFacts(database: DbExecutor, id: number, lock = false): Promise<TaskFacts | null> {
  return (await loadTaskFactsMany(database, [id], lock)).get(id) ?? null
}

async function loadProjectFactsMany(database: DbExecutor, ids: readonly number[]): Promise<Map<number, ProjectAccessFacts>> {
  const out = new Map<number, ProjectAccessFacts>()
  if (ids.length === 0) return out
  const rows = await database
    .select({
      id: codexProjects.id,
      isPrivate: codexProjects.isPrivate,
      ownerEmail: codexProjects.ownerEmail,
      createdByEmail: codexProjects.createdByEmail,
    })
    .from(codexProjects)
    .where(sql`${codexProjects.id} IN (${idList(ids)})`)
  const members = await database
    .select({ projectId: codexProjectMembers.projectId, email: codexProjectMembers.email })
    .from(codexProjectMembers)
    .where(sql`${codexProjectMembers.projectId} IN (${idList(ids)})`)
  for (const r of rows) {
    out.set(Number(r.id), {
      is_private: Boolean(r.isPrivate),
      owner_email: r.ownerEmail,
      created_by_email: r.createdByEmail,
      members: members.filter((m) => Number(m.projectId) === Number(r.id)).map((m) => normaliseEmail(m.email)),
    })
  }
  return out
}

/** Can this person see the task (its project's rule; no project: every staff member)? */
export function canSeeTask(task: Pick<TaskFacts, "project" | "identity">, email: string): boolean {
  return task.project == null || canSeeProject(task.project, email, task.identity ?? NO_ALIASES)
}

/** The task if it is live and the viewer may see it, else null (not found: existence not confirmed). */
export async function loadVisibleTask(database: DbExecutor, id: number, viewerEmail: string, lock = false): Promise<TaskFacts | null> {
  const task = await loadTaskFacts(database, id, lock)
  if (!task || task.deleted || !canSeeTask(task, viewerEmail)) return null
  return task
}

// ---------------------------------------------------------------------------
// Followers
// ---------------------------------------------------------------------------

export async function loadFollowerRows(database: DbExecutor, taskId: number): Promise<Array<{ email: string; reason: string | null }>> {
  return database
    .select({ email: taskFollowers.email, reason: taskFollowers.reason })
    .from(taskFollowers)
    .where(eq(taskFollowers.taskId, taskId))
}

/**
 * Write follows with their reasons (`nextFollowReason`). People who cannot
 * see the task's project are skipped. Returns the emails whose row changed
 * to a following reason (for "added as follower").
 */
export async function applyFollows(
  database: DbExecutor,
  task: Pick<TaskFacts, "id" | "project" | "identity">,
  follows: ReadonlyArray<{ email: string | null | undefined; reason: FollowReason }>
): Promise<string[]> {
  const changed: string[] = []
  const rows = await loadFollowerRows(database, task.id)
  const current = new Map(rows.map((r) => [normaliseEmail(r.email), r.reason]))
  for (const f of follows) {
    const email = normaliseEmail(f.email)
    if (!email || !email.includes("@")) continue
    if (f.reason !== "unfollowed" && !canSeeTask(task, email)) continue
    const next = nextFollowReason(current.has(email) ? current.get(email) ?? null : null, f.reason)
    if (next == null) continue
    await database
      .insert(taskFollowers)
      .values({ taskId: task.id, email, reason: next })
      .onConflictDoUpdate({ target: [taskFollowers.taskId, taskFollowers.email], set: { reason: next } })
    current.set(email, next)
    if (next !== "unfollowed") changed.push(email)
  }
  return changed
}

/** The task's followers by the B41 rule (rows, plus creator and assignee unless they unfollowed). */
export async function loadEffectiveFollowers(database: DbExecutor, task: TaskFacts) {
  return effectiveFollowers(await loadFollowerRows(database, task.id), task)
}

// ---------------------------------------------------------------------------
// The one write path
// ---------------------------------------------------------------------------

export type WriteNotificationsOptions = {
  /**
   * Reminders: write a row only when the same person has no row of the same
   * kind for the task created on or after this Melbourne date (YYYY-MM-DD).
   */
  onceSinceMelbourneDate?: string
  /**
   * Overdue: write a row only when the same person was never reminded of this
   * task with this due date (YYYY-MM-DD). Each reminder written is recorded as
   * a `codex_activity` row (`task_reminder`, system, the kind as the action,
   * `{ recipient, due_on, notification_id }`), so a task whose due date moves
   * is reminded again for the new date.
   */
  oncePerDueOn?: string
  /** Facts already loaded in this transaction (else read here). */
  task?: TaskFacts
}

/** Who is told what about one event, written as rows. Returns the rows written. */
export async function writeNotifications(database: DbExecutor, event: NotifyEvent, opts: WriteNotificationsOptions = {}): Promise<number> {
  const task = opts.task ?? (await loadTaskFacts(database, event.taskId))
  if (!task || task.deleted) return 0
  const followers = (await loadEffectiveFollowers(database, task)).map((f) => f.email)
  const recipients = recipientsFor(event, {
    created_by_email: task.created_by_email,
    assignee_email: task.assignee_email,
    followers,
    canSee: (email) => canSeeTask(task, email),
    onRoster: activeRosterCheck(await loadRosterPeople(database)),
  })
  const actor = normaliseEmail(event.actor) || null
  let written = 0
  for (const r of recipients) {
    if (opts.oncePerDueOn) {
      const told = executeRows(
        await database.execute(sql`
          SELECT 1 FROM public.codex_activity a
           WHERE a.entity_type = 'task_reminder' AND a.entity_id = ${task.id}::bigint AND a.action = ${r.kind}
             AND a.after->>'recipient' = ${r.email} AND a.after->>'due_on' = ${opts.oncePerDueOn}
           LIMIT 1
        `)
      )
      if (told.length > 0) continue
      const [row] = await database
        .insert(codexNotifications)
        .values({ recipientEmail: r.email, kind: r.kind, taskId: task.id, actorEmail: actor })
        .returning({ id: codexNotifications.id })
      await database.insert(codexActivity).values({
        entityType: "task_reminder",
        entityId: task.id,
        actorEmail: SYSTEM_ACTORS.reminders, // C-264 (B43)
        actorKind: "system",
        action: r.kind,
        after: { recipient: r.email, due_on: opts.oncePerDueOn, notification_id: Number(row?.id) },
      })
      written += 1
    } else if (opts.onceSinceMelbourneDate) {
      const rows = executeRows(
        await database.execute(sql`
          INSERT INTO public.codex_notifications (recipient_email, kind, task_id, actor_email)
          SELECT ${r.email}, ${r.kind}, ${task.id}::bigint, ${actor}
           WHERE NOT EXISTS (
             SELECT 1 FROM public.codex_notifications n
              WHERE n.recipient_email = ${r.email} AND n.kind = ${r.kind} AND n.task_id = ${task.id}::bigint
                AND (n.created_at AT TIME ZONE 'Australia/Melbourne')::date >= ${opts.onceSinceMelbourneDate}::date)
          RETURNING id
        `)
      )
      written += rows.length
    } else {
      await database.insert(codexNotifications).values({ recipientEmail: r.email, kind: r.kind, taskId: task.id, actorEmail: actor })
      written += 1
    }
  }
  return written
}

/** codex_notifications on (it needs codex_projects, codex_v2 and so 0118). Never throws. */
export async function notifyEnabled(): Promise<boolean> {
  try {
    return await isFeatureOn("codex_notifications")
  } catch (err) {
    console.warn("[codex-notify] switch read failed", err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Task changes (PATCH, bulk, create, board moves, subtasks)
// ---------------------------------------------------------------------------

function stateOf(t: TaskFacts): TaskNotifyState {
  return { id: t.id, status: t.status, assignee_email: t.assignee_email, due: t.due }
}

/** Read before a write (codex_projects on): the states the change rules compare against. */
export async function captureTaskStates(ids: readonly number[], database: Db = db): Promise<Map<number, TaskNotifyState>> {
  const out = new Map<number, TaskNotifyState>()
  for (const [id, t] of await loadTaskFactsMany(database, ids)) out.set(id, stateOf(t))
  return out
}

export type RecordTaskChangesOptions = {
  /** The tasks were just created (`before` is ignored). */
  created?: boolean
  /** Write notifications (codex_notifications on). Follows are written either way. */
  notify: boolean
}

/**
 * After a task write: follow the creator (new tasks) and a new assignee, then,
 * with `notify`, write the change events (assigned, reassigned, due date
 * changed, completed). One transaction. Returns the notification count.
 */
export async function recordTaskChanges(
  actor: string | null,
  before: ReadonlyMap<number, TaskNotifyState>,
  ids: readonly number[],
  opts: RecordTaskChangesOptions,
  database: Db = db
): Promise<number> {
  if (ids.length === 0) return 0
  return database.transaction(async (tx) => {
    const after = await loadTaskFactsMany(tx, ids)
    let written = 0
    for (const id of ids) {
      const task = after.get(id)
      if (!task || task.deleted) continue
      const prior = opts.created ? null : before.get(id)
      if (!opts.created && !prior) continue
      const events = taskChangeEvents(prior ?? null, stateOf(task), actor)
      const follows: Array<{ email: string | null; reason: FollowReason }> = []
      if (opts.created) follows.push({ email: task.created_by_email, reason: "creator" })
      if (events.some((e) => e.kind === "assignment") && task.assignee_email) follows.push({ email: task.assignee_email, reason: "assignee" })
      if (follows.length > 0) await applyFollows(tx, task, follows)
      if (!opts.notify) continue
      for (const event of events) written += await writeNotifications(tx, event, { task })
    }
    return written
  })
}

/**
 * The route hook: with codex_projects on, record follows and (with
 * codex_notifications on) notifications for tasks a route just wrote. Never
 * throws: the save already happened, so a failure here is logged.
 */
export async function afterTaskWrite(
  actor: string | null,
  before: ReadonlyMap<number, TaskNotifyState>,
  ids: readonly number[],
  opts: { created?: boolean } = {},
  database: Db = db
): Promise<void> {
  try {
    if (!(await isFeatureOn("codex_projects"))) return
    const notify = await notifyEnabled()
    await recordTaskChanges(actor, before, ids, { created: opts.created, notify }, database)
  } catch (err) {
    console.error("[codex-notify] task change not recorded", err)
  }
}

/** The route hook's read before a write: empty with codex_projects off (nothing is read). Never throws. */
export async function beforeTaskWrite(ids: readonly number[], database: Db = db): Promise<Map<number, TaskNotifyState>> {
  try {
    if (!(await isFeatureOn("codex_projects"))) return new Map()
    return await captureTaskStates(ids, database)
  } catch (err) {
    console.error("[codex-notify] task state not read", err)
    return new Map()
  }
}
