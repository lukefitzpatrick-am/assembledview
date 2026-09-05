/**
 * Plan presence (SM-7). Information only — never a lock.
 * Fresh window is 90s; heartbeat is 30s (or piggybacked on the 15s autosave timeout).
 */

export const PLAN_PRESENCE_FRESH_MS = 90_000
export const PLAN_PRESENCE_HEARTBEAT_MS = 30_000

export type PlanPresencePage = "edit" | "create"

export type PlanPresenceRow = {
  userId: string
  userLabel: string | null
  lastSeenAt: string
  page: PlanPresencePage
}

export type PlanPresenceOther = {
  userLabel: string | null
  lastSeenAt: string
  page: PlanPresencePage
}

export function isPlanPresenceFresh(
  lastSeenAt: string,
  now: Date = new Date()
): boolean {
  const t = Date.parse(lastSeenAt)
  if (!Number.isFinite(t)) return false
  return now.getTime() - t <= PLAN_PRESENCE_FRESH_MS
}

export function filterFreshPlanPresence(
  rows: PlanPresenceRow[],
  args: { excludeUserId: string; now?: Date }
): PlanPresenceRow[] {
  const now = args.now ?? new Date()
  return rows.filter(
    (r) => r.userId !== args.excludeUserId && isPlanPresenceFresh(r.lastSeenAt, now)
  )
}

export function toPlanPresenceOther(row: PlanPresenceRow): PlanPresenceOther {
  return {
    userLabel: row.userLabel,
    lastSeenAt: row.lastSeenAt,
    page: row.page,
  }
}

/** Names for the banner. Never an email address. */
export function presenceDisplayName(label: string | null | undefined): string {
  const s = String(label ?? "").trim()
  if (!s || s.includes("@")) return "Another editor"
  return s
}

export function formatPresenceAgo(lastSeenAt: string, now: Date = new Date()): string {
  const t = Date.parse(lastSeenAt)
  if (!Number.isFinite(t)) return "just now"
  const deltaMs = Math.max(0, now.getTime() - t)
  if (deltaMs < 60_000) return "just now"
  const mins = Math.floor(deltaMs / 60_000)
  return mins === 1 ? "1 min ago" : `${mins} min ago`
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

export function formatPlanPresenceBanner(
  others: Array<{ userLabel: string | null; lastSeenAt: string }>,
  now: Date = new Date()
): string | null {
  if (others.length === 0) return null
  const names = others.map((o) => presenceDisplayName(o.userLabel))
  let newest = others[0]!.lastSeenAt
  for (const o of others) {
    if (Date.parse(o.lastSeenAt) > Date.parse(newest)) newest = o.lastSeenAt
  }
  const ago = formatPresenceAgo(newest, now)
  const verb = others.length === 1 ? "has" : "have"
  return `${joinNames(names)} also ${verb} this campaign open (${ago})`
}

/** Autosave 15s timeout is armed — heartbeat rides persistServer, no extra interval. */
export function shouldPiggybackPresenceOnAutosave(args: {
  masterId: number | null
  autosaveEnabled: boolean
  dirty: boolean
}): boolean {
  return args.masterId != null && args.autosaveEnabled && args.dirty
}

/** Start the 30s presence interval only when the autosave timeout is not armed. */
export function shouldArmPresenceInterval(args: {
  masterId: number | null
  autosaveEnabled: boolean
  dirty: boolean
}): boolean {
  if (args.masterId == null) return false
  return !shouldPiggybackPresenceOnAutosave(args)
}
