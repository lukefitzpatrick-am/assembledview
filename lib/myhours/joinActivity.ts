/**
 * Join Reports/activity.userId → Users/getAll.email (lowercased).
 * Missing users are skipped with a counted sentinel — never silently dropped.
 */
import type { MyHoursActivityRow, MyHoursUser } from "./client.js"

export type JoinedActivityEntry = {
  myhoursLogId: string
  memberEmail: string
  entryDate: string
  durationMinutes: number
  note: string | null
  myhoursProjectId: string | null
  myhoursProjectName: string | null
  myhoursTaskId: string | null
  myhoursTaskName: string | null
  raw: MyHoursActivityRow
}

export type JoinActivityResult = {
  entries: JoinedActivityEntry[]
  unknownUserCount: number
  unknownUserIds: number[]
}

export function buildUserEmailById(
  users: MyHoursUser[]
): Map<number, string> {
  const map = new Map<number, string>()
  for (const u of users) {
    if (u?.id == null) continue
    const email = (u.email ?? "").trim().toLowerCase()
    if (!email) continue
    map.set(Number(u.id), email)
  }
  return map
}

/** Civil date YYYY-MM-DD from MyHours activity.date. */
export function activityEntryDate(dateRaw: string | null | undefined): string | null {
  if (!dateRaw?.trim()) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(dateRaw.trim())
  return m?.[1] ?? null
}

/** logDuration is seconds. */
export function activityDurationMinutes(row: MyHoursActivityRow): number {
  const seconds = Number(row.logDuration ?? row.laborDuration ?? 0)
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.round(seconds / 60)
}

/**
 * CX2-1: join activity rows to roster emails.
 * Rows whose userId is missing from Users/getAll → counted skip (not inserted).
 */
export function joinActivityRows(
  rows: MyHoursActivityRow[],
  usersById: Map<number, string>
): JoinActivityResult {
  const entries: JoinedActivityEntry[] = []
  const unknownIds = new Set<number>()

  for (const row of rows) {
    if (row?.logId == null) continue
    const userId = Number(row.userId)
    const email = usersById.get(userId)
    if (!email) {
      if (Number.isFinite(userId)) unknownIds.add(userId)
      continue
    }
    const entryDate = activityEntryDate(row.date)
    if (!entryDate) continue

    entries.push({
      myhoursLogId: String(row.logId),
      memberEmail: email,
      entryDate,
      durationMinutes: activityDurationMinutes(row),
      note: row.note?.trim() ? String(row.note) : null,
      myhoursProjectId:
        row.projectId != null ? String(row.projectId) : null,
      myhoursProjectName: row.projectName?.trim()
        ? String(row.projectName)
        : null,
      myhoursTaskId: row.taskId != null ? String(row.taskId) : null,
      myhoursTaskName: row.taskName?.trim() ? String(row.taskName) : null,
      raw: row,
    })
  }

  return {
    entries,
    unknownUserCount: unknownIds.size,
    unknownUserIds: [...unknownIds].sort((a, b) => a - b),
  }
}

/** Task name convention: "<mba> — <Campaign Name>" (em/en dash or hyphen). */
export function mbaFromTaskName(taskName: string | null | undefined): string | null {
  if (!taskName?.trim()) return null
  const m = /^([A-Za-z0-9]+)\s*[—–-]\s+/.exec(taskName.trim())
  return m?.[1] ? m[1].toLowerCase() : null
}
