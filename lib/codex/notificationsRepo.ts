/**
 * Codex notifications store (B41): the bell (list, unread count, mark read),
 * the digest switch per person, and the daily run (due tomorrow and overdue
 * reminders, then the email digest). Behind `codex_notifications` (routes
 * and the cron check) and the 0118 marker (`guarded`).
 *
 * A notification shows only while its task is live and the recipient can
 * still see the task's project (a private project they were removed from
 * drops out of the bell and the digest).
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import {
  digestEnabled,
  digestSubject,
  groupDigest,
  isNotificationKind,
  isQuietHours,
  notificationText,
  reminderDates,
  type DigestEmail,
  type DigestRow,
  type NotificationKind,
} from "@/lib/codex/notifications"
import { loadTaskFacts, writeNotifications } from "@/lib/codex/notify"
import { normaliseEmail } from "@/lib/codex/projects"
import { guarded } from "@/lib/codex/projectsRepo"
import { displayNameFromEmail, looksLikeEmail } from "@/lib/codex/rosterResolve"

const { codexNotificationPrefs } = schema

export const BELL_LIMIT_DEFAULT = 30
export const BELL_LIMIT_MAX = 100
/** The digest covers notifications from the last week at most. */
export const DIGEST_LOOKBACK_DAYS = 7
/** A run sends at most this many notifications in all (the rest wait for the next day). */
export const DIGEST_ROWS_MAX = 5000

export type BellItem = {
  id: number
  kind: NotificationKind
  task_id: number
  task_title: string
  actor_email: string | null
  actor_name: string | null
  text: string
  created_at: string
  read_at: string | null
}

export type BellPayload = { items: BellItem[]; unread: number; email_digest: boolean }

/** SQL: notification `n` on live task `t` (with project `p` left-joined) that `recipient` may see. */
function visibleToRecipient(recipient: SQL): SQL {
  return sql`t.deleted_at IS NULL AND (
    p.id IS NULL OR p.is_private = false
    OR lower(p.owner_email) = ${recipient} OR lower(p.created_by_email) = ${recipient}
    OR EXISTS (SELECT 1 FROM public.codex_project_members m WHERE m.project_id = p.id AND lower(m.email) = ${recipient}))`
}

function actorName(email: unknown, rosterName: unknown): string | null {
  if (email == null) return null
  const name = typeof rosterName === "string" ? rosterName.trim() : ""
  if (name && !looksLikeEmail(name)) return name
  return displayNameFromEmail(String(email)) || String(email)
}

function bellItem(r: Record<string, unknown>): BellItem | null {
  if (!isNotificationKind(r.kind)) return null
  const name = actorName(r.actor_email, r.actor_roster_name)
  const title = String(r.task_title ?? "")
  return {
    id: Number(r.id),
    kind: r.kind,
    task_id: Number(r.task_id),
    task_title: title,
    actor_email: r.actor_email == null ? null : String(r.actor_email),
    actor_name: name,
    text: notificationText(r.kind, name, title),
    created_at: String(r.created_at ?? ""),
    read_at: r.read_at == null ? null : String(r.read_at),
  }
}

/** The viewer's bell: newest first, the unread count and their digest switch. */
export async function listBell(viewerEmail: string, limit = BELL_LIMIT_DEFAULT, database: Db = db): Promise<BellPayload> {
  const viewer = normaliseEmail(viewerEmail)
  const take = Math.min(Math.max(1, Math.trunc(limit) || BELL_LIMIT_DEFAULT), BELL_LIMIT_MAX)
  return guarded(database, async () => {
    const rows = executeRows(
      await database.execute(sql`
        SELECT n.id, n.kind, n.task_id, t.title AS task_title, n.actor_email, tm.name AS actor_roster_name,
               n.created_at::text AS created_at, n.read_at::text AS read_at
          FROM public.codex_notifications n
          JOIN public.tasks t ON t.id = n.task_id
          LEFT JOIN public.codex_projects p ON p.id = t.project_id
          LEFT JOIN public.team_members tm ON lower(tm.email) = n.actor_email
         WHERE n.recipient_email = ${viewer} AND ${visibleToRecipient(sql`${viewer}`)}
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT ${take}
      `)
    )
    const [unread] = executeRows(
      await database.execute(sql`
        SELECT count(*)::int AS n
          FROM public.codex_notifications n
          JOIN public.tasks t ON t.id = n.task_id
          LEFT JOIN public.codex_projects p ON p.id = t.project_id
         WHERE n.recipient_email = ${viewer} AND n.read_at IS NULL AND ${visibleToRecipient(sql`${viewer}`)}
      `)
    )
    const prefs = await database
      .select({ prefs: codexNotificationPrefs.prefs })
      .from(codexNotificationPrefs)
      .where(sql`${codexNotificationPrefs.email} = ${viewer}`)
      .limit(1)
    return {
      items: rows.map(bellItem).filter((i): i is BellItem => i != null),
      unread: Number(unread?.n ?? 0),
      email_digest: digestEnabled(prefs[0]?.prefs),
    }
  })
}

/** Mark the viewer's own notifications read: the ids given, or all. Returns how many changed. */
export async function markNotificationsRead(
  viewerEmail: string,
  target: { ids: readonly number[] } | { all: true },
  database: Db = db
): Promise<number> {
  const viewer = normaliseEmail(viewerEmail)
  return guarded(database, async () => {
    if ("ids" in target && target.ids.length === 0) return 0
    const which =
      "ids" in target
        ? sql`AND id IN (${sql.join(
            target.ids.map((id) => sql`${id}::bigint`),
            sql`, `
          )})`
        : sql``
    const rows = executeRows(
      await database.execute(sql`
        UPDATE public.codex_notifications SET read_at = now()
         WHERE recipient_email = ${viewer} AND read_at IS NULL ${which}
        RETURNING id
      `)
    )
    return rows.length
  })
}

/** The person's daily email switch (default on). */
export async function setEmailDigest(viewerEmail: string, on: boolean, database: Db = db): Promise<boolean> {
  const viewer = normaliseEmail(viewerEmail)
  return guarded(database, async () => {
    await database.execute(sql`
      INSERT INTO public.codex_notification_prefs (email, prefs)
      VALUES (${viewer}, jsonb_build_object('email_digest', ${on}::boolean))
      ON CONFLICT (email) DO UPDATE
        SET prefs = public.codex_notification_prefs.prefs || jsonb_build_object('email_digest', ${on}::boolean)
    `)
    return on
  })
}

// ---------------------------------------------------------------------------
// Daily run: reminders, then the digest
// ---------------------------------------------------------------------------

export type ReminderResult = { due_tomorrow: number; overdue: number; tasks: number }

/**
 * Due tomorrow (due on the Melbourne day after today) and overdue (due in the
 * 7 days before today), for live tasks that are not done. Once per task and
 * person: due tomorrow once per day, overdue once per due date (keyed on the
 * task and the due date, so a moved due date is reminded again). Each task in
 * its own transaction through the one write path.
 */
export async function generateDueReminders(now: Date, database: Db = db): Promise<ReminderResult> {
  const d = reminderDates(now)
  return guarded(database, async () => {
    const rows = executeRows(
      await database.execute(sql`
        SELECT id, due_on::text AS due_on FROM public.tasks
         WHERE deleted_at IS NULL AND status <> 'done' AND due_on IS NOT NULL
           AND (due_on = ${d.tomorrow}::date OR (due_on >= ${d.overdueFrom}::date AND due_on <= ${d.overdueTo}::date))
         ORDER BY id
      `)
    )
    const out: ReminderResult = { due_tomorrow: 0, overdue: 0, tasks: rows.length }
    for (const r of rows) {
      const id = Number(r.id)
      const dueOn = String(r.due_on)
      const kind = dueOn === d.tomorrow ? "due_tomorrow" : "overdue"
      const written = await database.transaction(async (tx) => {
        const task = await loadTaskFacts(tx, id)
        if (!task) return 0
        return writeNotifications(
          tx,
          { kind, taskId: id, actor: null },
          kind === "due_tomorrow" ? { task, onceSinceMelbourneDate: d.today } : { task, oncePerDueOn: dueOn }
        )
      })
      out[kind] += written
    }
    return out
  })
}

export type DigestSender = (args: { to: string; subject: string; html: string; digest: DigestEmail }) => Promise<void>

export type DigestResult = { people: number; sent: number; failed: number; quiet: number; off: number; notifications: number }

/**
 * The rows a digest would carry, grouped per person (no sending). Unread,
 * never digested, last 7 days, still visible, and only to people still
 * active on the roster (someone who left gets no email). The upper bound is the later of
 * `now` and the database clock, so rows written earlier in the same run (the
 * reminders, stamped by the database a moment after the route read its clock)
 * go in this digest, and a `?now=` run still sees them.
 */
export async function loadDigestBatch(now: Date, database: Db = db): Promise<{ digests: DigestEmail[]; prefs: Map<string, PrefRow> }> {
  return guarded(database, async () => {
    const since = new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 86_400_000).toISOString()
    const rows = executeRows(
      await database.execute(sql`
        SELECT n.id, n.recipient_email, n.kind, n.task_id, t.title AS task_title, n.actor_email, tm.name AS actor_roster_name,
               n.created_at::text AS created_at
          FROM public.codex_notifications n
          JOIN public.tasks t ON t.id = n.task_id
          LEFT JOIN public.codex_projects p ON p.id = t.project_id
          LEFT JOIN public.team_members tm ON lower(tm.email) = n.actor_email
         WHERE n.read_at IS NULL AND n.email_digest_at IS NULL
           AND n.created_at <= greatest(${now.toISOString()}::timestamptz, now()) AND n.created_at >= ${since}::timestamptz
           AND ${visibleToRecipient(sql`n.recipient_email`)}
           AND EXISTS (SELECT 1 FROM public.team_members r WHERE lower(r.email) = n.recipient_email AND r.active IS NOT FALSE)
         ORDER BY n.recipient_email, n.created_at, n.id
         LIMIT ${DIGEST_ROWS_MAX}
      `)
    )
    const digestRows: DigestRow[] = []
    for (const r of rows) {
      if (!isNotificationKind(r.kind)) continue
      digestRows.push({
        id: Number(r.id),
        recipient_email: String(r.recipient_email),
        kind: r.kind,
        task_id: Number(r.task_id),
        task_title: String(r.task_title ?? ""),
        actor_name: actorName(r.actor_email, r.actor_roster_name),
        created_at: String(r.created_at ?? ""),
      })
    }
    const digests = groupDigest(digestRows)
    const prefs = await loadPrefs(
      database,
      digests.map((x) => x.email)
    )
    return { digests, prefs }
  })
}

export type PrefRow = { prefs: unknown; quiet_start: string | null; quiet_end: string | null }

async function loadPrefs(database: Db, emails: readonly string[]): Promise<Map<string, PrefRow>> {
  const out = new Map<string, PrefRow>()
  if (emails.length === 0) return out
  const rows = executeRows(
    await database.execute(sql`
      SELECT email, prefs, quiet_start::text AS quiet_start, quiet_end::text AS quiet_end
        FROM public.codex_notification_prefs
       WHERE email IN (${sql.join(
         emails.map((e) => sql`${e}`),
         sql`, `
       )})
    `)
  )
  for (const r of rows) {
    out.set(normaliseEmail(String(r.email)), {
      prefs: r.prefs,
      quiet_start: r.quiet_start == null ? null : String(r.quiet_start),
      quiet_end: r.quiet_end == null ? null : String(r.quiet_end),
    })
  }
  return out
}

/**
 * One email per person with notifications waiting: digest off or in their
 * quiet hours, skipped (left for later); sent, the rows get
 * `email_digest_at`; a failed send leaves them for the next run.
 */
export async function runDigest(now: Date, send: DigestSender, buildHtml: (d: DigestEmail) => string, database: Db = db): Promise<DigestResult> {
  const { digests, prefs } = await loadDigestBatch(now, database)
  const out: DigestResult = { people: digests.length, sent: 0, failed: 0, quiet: 0, off: 0, notifications: 0 }
  for (const d of digests) {
    const pref = prefs.get(d.email)
    if (!digestEnabled(pref?.prefs)) {
      out.off += 1
      continue
    }
    if (isQuietHours(now, pref?.quiet_start, pref?.quiet_end)) {
      out.quiet += 1
      continue
    }
    try {
      await send({ to: d.email, subject: digestSubject(d), html: buildHtml(d), digest: d })
    } catch (err) {
      out.failed += 1
      console.error("[codex-digest] send failed", { to: d.email, error: err instanceof Error ? err.message : String(err) })
      continue
    }
    await guarded(database, () =>
      database.execute(sql`
        UPDATE public.codex_notifications SET email_digest_at = ${now.toISOString()}::timestamptz
         WHERE email_digest_at IS NULL AND id IN (${sql.join(
           d.notificationIds.map((id) => sql`${id}::bigint`),
           sql`, `
         )})
      `)
    )
    out.sent += 1
    out.notifications += d.notificationIds.length
  }
  return out
}

export type DailyRunResult = { reminders: ReminderResult; digest: DigestResult }

/**
 * The daily run, in order: the due tomorrow and overdue reminders first, then
 * the digest, so the reminders written now go out in this morning's email
 * (not the next one). One clock (`now`) for both.
 */
export async function runDailyNotifications(
  now: Date,
  send: DigestSender,
  buildHtml: (d: DigestEmail) => string,
  database: Db = db
): Promise<DailyRunResult> {
  const reminders = await generateDueReminders(now, database)
  const digest = await runDigest(now, send, buildHtml, database)
  return { reminders, digest }
}
