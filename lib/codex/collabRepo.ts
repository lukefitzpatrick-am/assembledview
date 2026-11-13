/**
 * Codex comments with @mentions, followers and attachments store (B41).
 * Behind `codex_projects` (routes check) and the 0118 marker (`guarded`: 503
 * before the migration). A task in a private project the viewer cannot see
 * is not found here (existence not confirmed), as on /api/codex/projects.
 *
 * Every change writes its `codex_activity` row in the same transaction, and,
 * when the caller passes `notify` (codex_notifications on), its
 * notifications through the one write path (`writeNotifications`).
 */
import "server-only"

import { and, asc, count, eq, sql } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import {
  ATTACHMENTS_PER_TASK_MAX,
  ATTACHMENT_TYPES,
  attachmentExtension,
  attachmentHost,
  canDeleteAttachment,
  isTaskBlobPathname,
  type TaskAttachment,
} from "@/lib/codex/attachments"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { readStoredMentions, resolveCommentMentions, type CommentMention, type UnresolvedMention } from "@/lib/codex/mentions"
import {
  applyFollows,
  canSeeTask,
  loadEffectiveFollowers,
  loadVisibleTask,
  writeNotifications,
  type TaskFacts,
} from "@/lib/codex/notify"
import { normaliseEmail } from "@/lib/codex/projects"
import { appendActivity, guarded, type ProjectFailure } from "@/lib/codex/projectsRepo"
import type { DbExecutor } from "@/lib/codex/repo"
import { loadRosterPeople } from "@/lib/codex/rosterRead"
import { displayNameFromEmail, resolveRosterAddress, rosterDisplayName, type RosterPerson } from "@/lib/codex/rosterResolve"
import type { TaskComment } from "@/lib/codex/types"

const { taskAttachments, teamMembers } = schema

const TASK_NOT_FOUND: ProjectFailure = { ok: false, reason: "task_not_found", message: "Task not found." }
const ATTACHMENT_NOT_FOUND: ProjectFailure = { ok: false, reason: "not_found", message: "Attachment not found." }

// ---------------------------------------------------------------------------
// Comments with mentions
// ---------------------------------------------------------------------------

function commentFromRow(r: Record<string, unknown>): TaskComment {
  return {
    id: Number(r.id),
    task_id: Number(r.task_id),
    body: String(r.body ?? ""),
    created_at: String(r.created_at ?? ""),
    author_email: r.author_email == null ? null : String(r.author_email),
    author_name: r.author_name == null ? null : String(r.author_name),
    author_kind: r.author_kind === "ava" ? "ava" : "user",
    mentions: readStoredMentions(r.mentions),
  }
}

/** Comments of a task the viewer may see, oldest first, with their mentions. */
export async function listCommentsWithMentions(
  taskId: number,
  viewerEmail: string,
  database: Db = db
): Promise<{ ok: true; items: TaskComment[] } | ProjectFailure> {
  return guarded(database, async () => {
    if (!(await loadVisibleTask(database, taskId, viewerEmail))) return TASK_NOT_FOUND
    const rows = executeRows(
      await database.execute(sql`
        SELECT id, task_id, body, created_at::text AS created_at, author_email, author_name, author_kind, mentions
          FROM public.task_comments WHERE task_id = ${taskId}::bigint ORDER BY created_at ASC, id ASC
      `)
    )
    return { ok: true as const, items: rows.map(commentFromRow) }
  })
}

export type CreateCommentWithMentionsInput = {
  body: string
  authorEmail: string
  authorName: string | null
  /** Active and inactive roster rows (the resolver skips inactive people). */
  roster: readonly RosterPerson[]
  /** codex_roster_aliases on. */
  aliases: boolean
  /** codex_notifications on: write mentioned and commented notifications. */
  notify: boolean
}

export type CreateCommentResult = { ok: true; comment: TaskComment; unresolved: UnresolvedMention[]; notified: number } | ProjectFailure

/**
 * A person's comment. Mentions are parsed here from the body (never taken
 * from the client), stored in `task_comments.mentions`, and the author and
 * each person mentioned follow the task.
 */
export async function createCommentWithMentions(
  taskId: number,
  input: CreateCommentWithMentionsInput,
  database: Db = db
): Promise<CreateCommentResult> {
  const body = input.body.trim()
  const author = normaliseEmail(input.authorEmail)
  return guarded(database, () =>
    database.transaction(async (tx): Promise<CreateCommentResult> => {
      const task = await loadVisibleTask(tx, taskId, author)
      if (!task) return TASK_NOT_FOUND
      const { mentions, unresolved } = resolveCommentMentions(body, input.roster, {
        aliases: input.aliases,
        canSee: (email) => canSeeTask(task, email),
      })
      const [row] = executeRows(
        await tx.execute(sql`
          INSERT INTO public.task_comments (task_id, body, author_email, author_name, author_kind, mentions)
          VALUES (${taskId}::bigint, ${body}, ${author || null}, ${input.authorName ?? null}, 'user', ${JSON.stringify(mentions)}::jsonb)
          RETURNING id, task_id, body, created_at::text AS created_at, author_email, author_name, author_kind, mentions
        `)
      )
      const comment = commentFromRow(row ?? {})
      await appendActivity(tx, { entityType: "task_comment", entityId: comment.id, actorEmail: author, action: "create", after: comment })
      await applyFollows(tx, task, [
        { email: author, reason: "commented" },
        ...mentions.map((m) => ({ email: m.email, reason: "mentioned" as const })),
      ])
      let notified = 0
      if (input.notify) {
        notified = await writeNotifications(
          tx,
          { kind: "comment", taskId, actor: author, mentioned: mentions.map((m: CommentMention) => m.email) },
          { task }
        )
      }
      return { ok: true, comment, unresolved, notified }
    })
  )
}

// ---------------------------------------------------------------------------
// Followers
// ---------------------------------------------------------------------------

export type TaskFollower = { email: string; name: string; reason: string }
export type FollowersResult = { ok: true; followers: TaskFollower[]; following: boolean } | ProjectFailure

async function rosterNames(database: DbExecutor): Promise<Map<string, string>> {
  const rows = await database.select({ email: teamMembers.email, name: teamMembers.name }).from(teamMembers)
  return new Map(rows.map((r) => [normaliseEmail(r.email), rosterDisplayName(r)]))
}

async function followersOf(database: DbExecutor, task: TaskFacts, viewer: string): Promise<{ ok: true; followers: TaskFollower[]; following: boolean }> {
  const names = await rosterNames(database)
  const followers = (await loadEffectiveFollowers(database, task))
    .filter((f) => canSeeTask(task, f.email))
    .map((f) => ({
      email: f.email,
      name: names.get(f.email) ?? displayNameFromEmail(f.email),
      reason: f.reason === "implicit_creator" ? "creator" : f.reason === "implicit_assignee" ? "assignee" : f.reason,
    }))
  return { ok: true, followers, following: followers.some((f) => f.email === normaliseEmail(viewer)) }
}

export async function listFollowers(taskId: number, viewerEmail: string, database: Db = db): Promise<FollowersResult> {
  return guarded(database, async () => {
    const task = await loadVisibleTask(database, taskId, viewerEmail)
    if (!task) return TASK_NOT_FOUND
    return followersOf(database, task, viewerEmail)
  })
}

/**
 * Follow a task (yourself, reason `manual`), or add a colleague (`added`;
 * they are told, with codex_notifications on). Only active roster members
 * follow, by primary email, through the B36 resolver (aliases with
 * `codex_roster_aliases`): anyone else is 400 `not_on_roster`, an address two
 * people hold 400 `ambiguous_address`. Someone who cannot see the task's
 * private project cannot be added (409 follower_no_access).
 */
export async function followTask(
  taskId: number,
  actorEmail: string,
  targetEmail: string | null,
  opts: { notify: boolean; aliases?: boolean },
  database: Db = db
): Promise<FollowersResult> {
  const actor = normaliseEmail(actorEmail)
  const asked = normaliseEmail(targetEmail)
  return guarded(database, () =>
    database.transaction(async (tx): Promise<FollowersResult> => {
      const task = await loadVisibleTask(tx, taskId, actor, true)
      if (!task) return TASK_NOT_FOUND
      const roster = await loadRosterPeople(tx)
      const resolve = (email: string) => resolveRosterAddress(email, roster, { aliases: opts.aliases === true })
      const actorMatch = resolve(actor)
      const match = asked ? resolve(asked) : actorMatch
      if (match.kind === "ambiguous") {
        return { ok: false, reason: "ambiguous_address", message: "That address belongs to more than one person on the team list. Use their main email." }
      }
      if (match.kind === "none") {
        return {
          ok: false,
          reason: "not_on_roster",
          message: asked
            ? "Only active people on the team list can follow a task."
            : "You are not an active person on the team list, so you cannot follow tasks.",
        }
      }
      const target = normaliseEmail(match.member.email)
      const actorPrimary = actorMatch.kind === "unique" ? normaliseEmail(actorMatch.member.email) : actor
      if (!canSeeTask(task, target)) {
        return { ok: false, reason: "follower_no_access", message: "That person cannot see this private project, so they cannot follow the task." }
      }
      const self = target === actorPrimary
      const changed = await applyFollows(tx, task, [{ email: target, reason: self ? "manual" : "added" }])
      if (changed.length > 0) {
        await appendActivity(tx, { entityType: "task_follower", entityId: taskId, actorEmail: actor, action: "follow", after: { email: target } })
        if (!self && opts.notify) {
          await writeNotifications(tx, { kind: "follower_added", taskId, actor, added: [target] }, { task })
        }
      }
      return followersOf(tx, task, actor)
    })
  )
}

/** Stop following (yourself only). Kept as an `unfollowed` row so creator and assignee can stop too. */
export async function unfollowTask(taskId: number, actorEmail: string, database: Db = db): Promise<FollowersResult> {
  const actor = normaliseEmail(actorEmail)
  return guarded(database, () =>
    database.transaction(async (tx): Promise<FollowersResult> => {
      const task = await loadVisibleTask(tx, taskId, actor, true)
      if (!task) return TASK_NOT_FOUND
      await applyFollows(tx, task, [{ email: actor, reason: "unfollowed" }])
      await appendActivity(tx, { entityType: "task_follower", entityId: taskId, actorEmail: actor, action: "unfollow", after: { email: actor } })
      return followersOf(tx, task, actor)
    })
  )
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

type AttachmentRow = typeof taskAttachments.$inferSelect

function attachmentToApi(row: AttachmentRow, viewer: string, roles: readonly string[]): TaskAttachment {
  const kind = row.kind === "link" ? "link" : "blob"
  return {
    id: Number(row.id),
    task_id: Number(row.taskId),
    kind,
    name: row.name,
    url: kind === "link" ? row.url ?? null : null,
    host: kind === "link" ? attachmentHost(row.url) : null,
    size_bytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    content_type: kind === "blob" ? ATTACHMENT_TYPES[attachmentExtension(row.name)] ?? "application/octet-stream" : null,
    uploaded_by_email: row.uploadedByEmail,
    created_at: row.createdAt,
    can_delete: canDeleteAttachment({ uploaded_by_email: row.uploadedByEmail }, viewer, roles),
  }
}

export type AttachmentsResult = { ok: true; attachments: TaskAttachment[] } | ProjectFailure

export async function listAttachments(taskId: number, viewerEmail: string, roles: readonly string[], database: Db = db): Promise<AttachmentsResult> {
  return guarded(database, async () => {
    if (!(await loadVisibleTask(database, taskId, viewerEmail))) return TASK_NOT_FOUND
    const rows = await database
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt), asc(taskAttachments.id))
    return { ok: true as const, attachments: rows.map((r) => attachmentToApi(r, normaliseEmail(viewerEmail), roles)) }
  })
}

/** Can the viewer attach to this task (before the file goes to Blob)? Also the count limit. */
export async function checkCanAttach(taskId: number, viewerEmail: string, database: Db = db): Promise<{ ok: true } | ProjectFailure> {
  return guarded(database, async () => {
    if (!(await loadVisibleTask(database, taskId, viewerEmail))) return TASK_NOT_FOUND
    const [n] = await database.select({ n: count() }).from(taskAttachments).where(eq(taskAttachments.taskId, taskId))
    if (Number(n?.n ?? 0) >= ATTACHMENTS_PER_TASK_MAX) return tooMany()
    return { ok: true as const }
  })
}

function tooMany(): ProjectFailure {
  return { ok: false, reason: "too_many_attachments", message: `A task holds ${ATTACHMENTS_PER_TASK_MAX} attachments at most.` }
}

export type NewAttachment =
  | { kind: "blob"; name: string; blobPathname: string; sizeBytes: number }
  | { kind: "link"; name: string; url: string }

export type AttachmentResult = { ok: true; attachment: TaskAttachment } | ProjectFailure

/** Record an attachment (the blob is already stored). The task row is locked so the count holds. */
export async function createAttachment(
  taskId: number,
  actorEmail: string,
  roles: readonly string[],
  input: NewAttachment,
  opts: { notify: boolean },
  database: Db = db
): Promise<AttachmentResult> {
  const actor = normaliseEmail(actorEmail)
  return guarded(database, () =>
    database.transaction(async (tx): Promise<AttachmentResult> => {
      const task = await loadVisibleTask(tx, taskId, actor, true)
      if (!task) return TASK_NOT_FOUND
      if (input.kind === "blob" && !isTaskBlobPathname(taskId, input.blobPathname)) {
        throw new Error("Attachment pathname is outside the task's folder.")
      }
      const [n] = await tx.select({ n: count() }).from(taskAttachments).where(eq(taskAttachments.taskId, taskId))
      if (Number(n?.n ?? 0) >= ATTACHMENTS_PER_TASK_MAX) return tooMany()
      const [row] = await tx
        .insert(taskAttachments)
        .values({
          taskId,
          kind: input.kind,
          name: input.name,
          blobPathname: input.kind === "blob" ? input.blobPathname : null,
          url: input.kind === "link" ? input.url : null,
          sizeBytes: input.kind === "blob" ? input.sizeBytes : null,
          uploadedByEmail: actor,
        })
        .returning()
      const api = attachmentToApi(row!, actor, roles)
      await appendActivity(tx, {
        entityType: "task_attachment",
        entityId: api.id,
        actorEmail: actor,
        action: "create",
        after: { task_id: taskId, kind: api.kind, name: api.name, host: api.host, size_bytes: api.size_bytes },
      })
      if (opts.notify) await writeNotifications(tx, { kind: "attachment_added", taskId, actor }, { task })
      return { ok: true, attachment: api }
    })
  )
}

export type DeleteAttachmentResult = { ok: true; blobPathname: string | null } | ProjectFailure

/** The uploader or an admin. Returns the blob pathname for the route to delete from Blob after the row is gone. */
export async function deleteAttachment(
  taskId: number,
  attachmentId: number,
  actorEmail: string,
  roles: readonly string[],
  database: Db = db
): Promise<DeleteAttachmentResult> {
  const actor = normaliseEmail(actorEmail)
  return guarded(database, () =>
    database.transaction(async (tx): Promise<DeleteAttachmentResult> => {
      const task = await loadVisibleTask(tx, taskId, actor, true)
      if (!task) return TASK_NOT_FOUND
      const [row] = await tx
        .select()
        .from(taskAttachments)
        .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
        .limit(1)
      if (!row) return ATTACHMENT_NOT_FOUND
      if (!canDeleteAttachment({ uploaded_by_email: row.uploadedByEmail }, actor, roles)) {
        return { ok: false, reason: "not_uploader", message: "Only the person who added it, or an admin, can delete it." }
      }
      await tx.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId))
      await appendActivity(tx, {
        entityType: "task_attachment",
        entityId: attachmentId,
        actorEmail: actor,
        action: "delete",
        before: { task_id: taskId, kind: row.kind, name: row.name },
      })
      return { ok: true, blobPathname: row.kind === "blob" ? row.blobPathname : null }
    })
  )
}

export type AttachmentFileResult = { ok: true; pathname: string; name: string; contentType: string } | ProjectFailure

/** A blob attachment the viewer may fetch: the task is live and visible, the row is a blob in the task's folder. */
export async function getAttachmentFile(taskId: number, attachmentId: number, viewerEmail: string, database: Db = db): Promise<AttachmentFileResult> {
  return guarded(database, async () => {
    if (!(await loadVisibleTask(database, taskId, viewerEmail))) return TASK_NOT_FOUND
    const [row] = await database
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
      .limit(1)
    if (!row || row.kind !== "blob" || !isTaskBlobPathname(taskId, row.blobPathname)) return ATTACHMENT_NOT_FOUND
    return {
      ok: true as const,
      pathname: row.blobPathname!,
      name: row.name,
      contentType: ATTACHMENT_TYPES[attachmentExtension(row.name)] ?? "application/octet-stream",
    }
  })
}
