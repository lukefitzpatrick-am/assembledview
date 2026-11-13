/**
 * Codex notifications (B41, plan 5.3). Pure: client-safe, no database.
 *
 * Events: assigned, reassigned, unassigned, mentioned, comment on a followed
 * task, due date changed, attachment added, added as follower, completed, due
 * tomorrow and overdue (the last two from the daily cron).
 *
 * Rules (`recipientsFor`):
 * - Never the actor: nobody is told about their own action.
 * - Private projects: only people who can see the project (owner, creator,
 *   members) are notified (`canSee`, the B38 rule).
 * - One notification per person per event; the first kind in the event's
 *   order wins (a mentioned follower gets "mentioned", not also "commented").
 * - Only active roster members, by primary email (`onRoster`, the B36
 *   resolver with aliases off): an address that entered the task some other
 *   way (an assignee or helper stored as sent, an old follower row, someone
 *   who has left) is never notified or emailed.
 *
 * Followers (`effectiveFollowers`): the rows in `task_followers` whose reason
 * is not `unfollowed`, plus the creator and the current assignee unless they
 * unfollowed. So tasks made before B41 still reach their creator and assignee
 * without a backfill.
 *
 * Unfollow stops the follower notices (commented, due date changed,
 * attachment added, completed), for the assignee too. Notices addressed to
 * the person stay: assigned, reassigned, unassigned, mentioned, added as
 * follower, and the due tomorrow and overdue reminders for a task they hold.
 *
 * Email digest: one email a day per person, of the notifications that are
 * still unread and were not in an earlier digest. Never in quiet hours
 * (18:00 to 08:00 Melbourne unless the person's row says otherwise).
 */

import { resolveRosterAddress, type RosterPerson } from "./rosterResolve"

export const NOTIFICATION_KINDS = [
  "assigned",
  "reassigned",
  "unassigned",
  "mentioned",
  "commented",
  "due_changed",
  "attachment_added",
  "follower_added",
  "completed",
  "due_tomorrow",
  "overdue",
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value)
}

export const FOLLOW_REASONS = ["creator", "assignee", "mentioned", "commented", "manual", "added", "unfollowed"] as const
export type FollowReason = (typeof FOLLOW_REASONS)[number]

/** Reasons a person follows; `unfollowed` is the row that says they stopped. */
export type FollowRow = { email: string; reason: string | null }

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase()
}

/**
 * What a follow write does to an existing row: null keeps it. A person who is
 * following keeps their first reason. A person who unfollowed comes back only
 * through something they or a colleague did on purpose (assigned to them,
 * mentioned, their own comment, follow, added); never through `creator`.
 */
export function nextFollowReason(existing: string | null | undefined, incoming: FollowReason): FollowReason | null {
  if (incoming === "unfollowed") return existing === "unfollowed" ? null : "unfollowed"
  if (existing == null) return incoming
  if (existing !== "unfollowed") return null
  return incoming === "creator" ? null : incoming
}

export type FollowerView = { email: string; reason: FollowReason | "implicit_creator" | "implicit_assignee" }

/** The people following a task (see the module note), sorted by email. */
export function effectiveFollowers(
  rows: readonly FollowRow[],
  task: { created_by_email?: string | null; assignee_email?: string | null },
): FollowerView[] {
  const out = new Map<string, FollowerView>()
  const stopped = new Set<string>()
  for (const r of rows) {
    const email = norm(r.email)
    if (!email) continue
    if (r.reason === "unfollowed") {
      stopped.add(email)
      continue
    }
    const reason = (FOLLOW_REASONS as readonly string[]).includes(String(r.reason)) ? (r.reason as FollowReason) : "manual"
    out.set(email, { email, reason })
  }
  const creator = norm(task.created_by_email)
  if (creator && !stopped.has(creator) && !out.has(creator)) out.set(creator, { email: creator, reason: "implicit_creator" })
  const assignee = norm(task.assignee_email)
  if (assignee && !stopped.has(assignee) && !out.has(assignee)) out.set(assignee, { email: assignee, reason: "implicit_assignee" })
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email))
}

// ---------------------------------------------------------------------------
// Events and recipients
// ---------------------------------------------------------------------------

export type NotifyEvent =
  | { kind: "assignment"; taskId: number; actor: string | null; from: string | null; to: string | null }
  | { kind: "comment"; taskId: number; actor: string | null; mentioned: readonly string[] }
  | { kind: "due_changed"; taskId: number; actor: string | null }
  | { kind: "attachment_added"; taskId: number; actor: string | null }
  | { kind: "follower_added"; taskId: number; actor: string | null; added: readonly string[] }
  | { kind: "completed"; taskId: number; actor: string | null }
  | { kind: "due_tomorrow"; taskId: number; actor: null }
  | { kind: "overdue"; taskId: number; actor: null }

export type NotifyFacts = {
  created_by_email: string | null
  assignee_email: string | null
  /** From effectiveFollowers. */
  followers: readonly string[]
  /** Can this person see the task's project? Always true with no project or a public one. */
  canSee: (email: string) => boolean
  /** Is this the primary email of an active roster member? (`activeRosterCheck`) */
  onRoster: (email: string) => boolean
}

/**
 * Who may be notified or emailed: the primary email of an active roster
 * member, through the one roster resolver (B36) with aliases off. Inactive
 * people, unknown addresses and aliases are not.
 */
export function activeRosterCheck(roster: readonly RosterPerson[]): (email: string) => boolean {
  return (email) => resolveRosterAddress(email, roster, { aliases: false }).kind === "unique"
}

export type Recipient = { email: string; kind: NotificationKind }

/** Who is told what for one event, before the actor and visibility filters. */
function candidates(event: NotifyEvent, facts: NotifyFacts): Recipient[] {
  // Follower notices: followers only (the assignee follows unless they unfollowed).
  const everyone = (kind: NotificationKind) => facts.followers.map((email) => ({ email, kind }))
  switch (event.kind) {
    case "assignment": {
      const out: Recipient[] = []
      if (event.to) out.push({ email: event.to, kind: "assigned" })
      if (event.from && norm(event.from) !== norm(event.to)) out.push({ email: event.from, kind: event.to ? "reassigned" : "unassigned" })
      return out
    }
    case "comment":
      return [
        ...event.mentioned.map((email) => ({ email, kind: "mentioned" as const })),
        ...facts.followers.map((email) => ({ email, kind: "commented" as const })),
      ]
    case "due_changed":
      return everyone("due_changed")
    case "attachment_added":
      return everyone("attachment_added")
    case "follower_added":
      return event.added.map((email) => ({ email, kind: "follower_added" as const }))
    case "completed":
      return everyone("completed")
    case "due_tomorrow":
    case "overdue": {
      const who = facts.assignee_email || facts.created_by_email
      return who ? [{ email: who, kind: event.kind }] : []
    }
  }
}

/** The people to notify and the kind each gets. */
export function recipientsFor(event: NotifyEvent, facts: NotifyFacts): Recipient[] {
  const actor = norm(event.actor)
  const seen = new Set<string>()
  const out: Recipient[] = []
  for (const c of candidates(event, facts)) {
    const email = norm(c.email)
    if (!email || !email.includes("@")) continue
    if (actor && email === actor) continue
    if (seen.has(email)) continue
    seen.add(email)
    if (!facts.onRoster(email)) continue
    if (!facts.canSee(email)) continue
    out.push({ email, kind: c.kind })
  }
  return out
}

/** A task as the change rules see it. `due` is the civil due date (YYYY-MM-DD) or null. */
export type TaskNotifyState = {
  id: number
  status: string
  assignee_email: string | null
  due: string | null
}

/**
 * The events one task write makes. `before` null is a new task: an
 * assignment only (a new task is not "completed" or "due changed").
 */
export function taskChangeEvents(before: TaskNotifyState | null, after: TaskNotifyState, actor: string | null): NotifyEvent[] {
  const out: NotifyEvent[] = []
  const to = norm(after.assignee_email) || null
  if (!before) {
    if (to) out.push({ kind: "assignment", taskId: after.id, actor, from: null, to })
    return out
  }
  const from = norm(before.assignee_email) || null
  if (from !== to) out.push({ kind: "assignment", taskId: after.id, actor, from, to })
  if ((before.due ?? null) !== (after.due ?? null)) out.push({ kind: "due_changed", taskId: after.id, actor })
  if (before.status !== "done" && after.status === "done") out.push({ kind: "completed", taskId: after.id, actor })
  return out
}

// ---------------------------------------------------------------------------
// Words (bell and email)
// ---------------------------------------------------------------------------

const VERB: Record<NotificationKind, string> = {
  assigned: "assigned you",
  reassigned: "reassigned",
  unassigned: "unassigned you from",
  mentioned: "mentioned you on",
  commented: "commented on",
  due_changed: "changed the due date of",
  attachment_added: "added an attachment to",
  follower_added: "added you as a follower on",
  completed: "completed",
  due_tomorrow: "",
  overdue: "",
}

/** One line: `Mia Tran mentioned you on "Book OOH"`. */
export function notificationText(kind: NotificationKind, actorName: string | null, title: string): string {
  const quoted = `"${title || "Untitled task"}"`
  if (kind === "due_tomorrow") return `${quoted} is due tomorrow`
  if (kind === "overdue") return `${quoted} is overdue`
  const who = actorName?.trim() || "Someone"
  if (kind === "assigned") return `${who} assigned you ${quoted}`
  if (kind === "reassigned") return `${who} reassigned ${quoted} to someone else`
  return `${who} ${VERB[kind]} ${quoted}`
}

// ---------------------------------------------------------------------------
// Melbourne clock: quiet hours, the daily job, reminder dates
// ---------------------------------------------------------------------------

export const MELBOURNE_TZ = "Australia/Melbourne"
export const DEFAULT_QUIET_START = "18:00"
export const DEFAULT_QUIET_END = "08:00"
/** The cron runs at 21:30 and 22:30 UTC; the job acts on the run that falls in this Melbourne hour (08:30). */
export const DAILY_JOB_MELBOURNE_HOUR = 8

function melbourneParts(now: Date): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

export function melbourneTodayYmd(now: Date): string {
  return melbourneParts(now).ymd
}

export function melbourneHour(now: Date): number {
  return Math.floor(melbourneParts(now).minutes / 60)
}

/** "18:00", "08:00:00" to minutes after midnight; null when it does not parse. */
export function parseClock(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Is `now` inside the quiet window on the Melbourne clock? The window may
 * cross midnight (18:00 to 08:00). Start equal to end means no quiet hours.
 * A value that does not parse falls back to the default for that end.
 */
export function isQuietHours(now: Date, quietStart?: string | null, quietEnd?: string | null): boolean {
  const start = parseClock(quietStart) ?? parseClock(DEFAULT_QUIET_START)!
  const end = parseClock(quietEnd) ?? parseClock(DEFAULT_QUIET_END)!
  if (start === end) return false
  const m = melbourneParts(now).minutes
  return start > end ? m >= start || m < end : m >= start && m < end
}

/** The daily cron's two runs: only the one in the Melbourne 08:00 hour does anything. */
export function isDailyJobHour(now: Date): boolean {
  return melbourneHour(now) === DAILY_JOB_MELBOURNE_HOUR
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Overdue reminders look back this many days, so an old overdue task is not announced once 0118 runs. */
export const OVERDUE_LOOKBACK_DAYS = 7

export type ReminderDates = { today: string; tomorrow: string; overdueFrom: string; overdueTo: string }

/** Due tomorrow: due on `tomorrow`. Overdue: due on `overdueFrom`..`overdueTo` (the 7 days before today). */
export function reminderDates(now: Date): ReminderDates {
  const today = melbourneTodayYmd(now)
  return { today, tomorrow: addDays(today, 1), overdueFrom: addDays(today, -OVERDUE_LOOKBACK_DAYS), overdueTo: addDays(today, -1) }
}

/** Which reminder a live, not done task gets today, if any. */
export function dueReminderKind(dueOn: string | null | undefined, now: Date): "due_tomorrow" | "overdue" | null {
  if (!dueOn || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return null
  const d = reminderDates(now)
  if (dueOn === d.tomorrow) return "due_tomorrow"
  if (dueOn >= d.overdueFrom && dueOn <= d.overdueTo) return "overdue"
  return null
}

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------

export type DigestRow = {
  id: number
  recipient_email: string
  kind: NotificationKind
  task_id: number
  task_title: string
  actor_name: string | null
  created_at: string
}

export type DigestTask = { task_id: number; title: string; lines: string[]; latest: string }
export type DigestEmail = { email: string; notificationIds: number[]; tasks: DigestTask[]; total: number }

/** Per person, per task: the lines in time order, tasks with the newest first. */
export function groupDigest(rows: readonly DigestRow[]): DigestEmail[] {
  const byPerson = new Map<string, DigestRow[]>()
  for (const r of rows) {
    const email = norm(r.recipient_email)
    if (!email) continue
    const list = byPerson.get(email) ?? []
    list.push(r)
    byPerson.set(email, list)
  }
  const out: DigestEmail[] = []
  for (const [email, list] of [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    const tasks = new Map<number, DigestTask>()
    for (const r of sorted) {
      const t = tasks.get(r.task_id) ?? { task_id: r.task_id, title: r.task_title, lines: [], latest: r.created_at }
      t.lines.push(notificationText(r.kind, r.actor_name, r.task_title))
      t.latest = r.created_at
      tasks.set(r.task_id, t)
    }
    out.push({
      email,
      notificationIds: sorted.map((r) => r.id),
      tasks: [...tasks.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.task_id - b.task_id),
      total: sorted.length,
    })
  }
  return out
}

export function digestSubject(d: Pick<DigestEmail, "total" | "tasks">): string {
  const n = d.total
  const t = d.tasks.length
  return `Codex: ${n} ${n === 1 ? "update" : "updates"} on ${t} ${t === 1 ? "task" : "tasks"}`
}

/** The person's digest switch from `codex_notification_prefs.prefs` (default on). */
export function digestEnabled(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object") return true
  return (prefs as Record<string, unknown>).email_digest !== false
}
