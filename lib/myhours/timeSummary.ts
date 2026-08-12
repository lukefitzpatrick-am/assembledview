/**
 * Read helpers for mirrored MyHours time_entries (campaign + team surfaces).
 */
import { and, eq, gte, isNotNull, isNull, lt, lte, ne, sql, sum } from "drizzle-orm"

import { getDb, schema, type Db } from "@/db"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { minutesToHours } from "@/lib/myhours/hoursMath"
import {
  sydneyLastNWeekStarts,
  sydneyWeekRange,
} from "@/lib/myhours/sydneyWeek"

const db = () => getDb()

export type MbaTimeMemberRow = {
  member_email: string
  hours: number
  duration_minutes: number
}

export type MbaTimeSummary = {
  mba_number: string
  total_hours: number
  total_minutes: number
  by_member: MbaTimeMemberRow[]
  /** Hours per week for the last 4 Sydney weeks (oldest → newest). */
  sparkline_weeks: number[]
  week_starts: string[]
}

export type TeamWeekMemberRow = {
  email: string
  name: string
  active: boolean
  hours: number
  duration_minutes: number
  open: number
  overdue: number
}

export type TeamWeekTimeSummary = {
  week_start: string
  week_end: string
  unmapped_count: number
  members: TeamWeekMemberRow[]
}

function normalizeMba(mba: string): string {
  return mba.trim().toLowerCase()
}

/**
 * Hours-to-date for one MBA: totals, per-member split, last-4-weeks sparkline.
 */
export async function getMbaTimeSummary(
  mbaNumber: string,
  database: Db = db(),
  now: Date = new Date()
): Promise<MbaTimeSummary> {
  const mba = normalizeMba(mbaNumber)
  const weekStarts = sydneyLastNWeekStarts(4, now)
  const sparkStart = weekStarts[0]!
  const sparkEnd = sydneyWeekRange(now).endYmd

  const memberRows = await database
    .select({
      memberEmail: schema.timeEntries.memberEmail,
      minutes: sum(schema.timeEntries.durationMinutes),
    })
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.mbaNumber, mba))
    .groupBy(schema.timeEntries.memberEmail)

  const by_member: MbaTimeMemberRow[] = memberRows
    .map((r) => {
      const duration_minutes = Number(r.minutes ?? 0)
      return {
        member_email: r.memberEmail,
        duration_minutes,
        hours: minutesToHours(duration_minutes),
      }
    })
    .sort((a, b) => b.duration_minutes - a.duration_minutes)

  const total_minutes = by_member.reduce((s, m) => s + m.duration_minutes, 0)

  const weekRows = await database
    .select({
      entryDate: schema.timeEntries.entryDate,
      minutes: schema.timeEntries.durationMinutes,
    })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.mbaNumber, mba),
        gte(schema.timeEntries.entryDate, sparkStart),
        lte(schema.timeEntries.entryDate, sparkEnd)
      )
    )

  const minutesByWeek = new Map<string, number>()
  for (const start of weekStarts) minutesByWeek.set(start, 0)
  for (const row of weekRows) {
    const ws = mondayOfYmd(String(row.entryDate))
    if (minutesByWeek.has(ws)) {
      minutesByWeek.set(
        ws,
        (minutesByWeek.get(ws) ?? 0) + Number(row.minutes ?? 0)
      )
    }
  }

  const sparkline_weeks = weekStarts.map((ws) =>
    minutesToHours(minutesByWeek.get(ws) ?? 0)
  )

  return {
    mba_number: mba,
    total_hours: minutesToHours(total_minutes),
    total_minutes,
    by_member,
    sparkline_weeks,
    week_starts: weekStarts,
  }
}

function mondayOfYmd(ymd: string): string {
  // Interpret YMD as Sydney civil date → weekday via UTC morning probe
  const [y, m, d] = ymd.split("-").map(Number)
  const probe = new Date(Date.UTC(y!, m! - 1, d!, 2, 0, 0))
  return sydneyWeekRange(probe).startYmd
}

/**
 * Per roster member: hours in the current Sydney week + open/overdue task counts.
 * Members with zero entries still appear with hours = 0.
 */
export async function getTeamWeekTimeSummary(
  database: Db = db(),
  now: Date = new Date()
): Promise<TeamWeekTimeSummary> {
  const { startYmd, endYmd } = sydneyWeekRange(now)
  const sydneyToday = sydneyCivilParts(now).ymd

  const members = await database
    .select({
      email: schema.teamMembers.email,
      name: schema.teamMembers.name,
      active: schema.teamMembers.active,
    })
    .from(schema.teamMembers)
    .orderBy(schema.teamMembers.name)

  const hourRows = await database
    .select({
      memberEmail: schema.timeEntries.memberEmail,
      minutes: sum(schema.timeEntries.durationMinutes),
    })
    .from(schema.timeEntries)
    .where(
      and(
        gte(schema.timeEntries.entryDate, startYmd),
        lte(schema.timeEntries.entryDate, endYmd)
      )
    )
    .groupBy(schema.timeEntries.memberEmail)

  const minutesByEmail = new Map<string, number>()
  for (const r of hourRows) {
    minutesByEmail.set(r.memberEmail.toLowerCase(), Number(r.minutes ?? 0))
  }

  const openRows = await database
    .select({
      email: schema.tasks.assigneeEmail,
      open: sql<number>`count(*)::int`,
    })
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.deletedAt),
        ne(schema.tasks.status, "done"),
        isNotNull(schema.tasks.assigneeEmail)
      )
    )
    .groupBy(schema.tasks.assigneeEmail)

  const overdueRows = await database
    .select({
      email: schema.tasks.assigneeEmail,
      overdue: sql<number>`count(*)::int`,
    })
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.deletedAt),
        ne(schema.tasks.status, "done"),
        isNotNull(schema.tasks.assigneeEmail),
        isNotNull(schema.tasks.dueDate),
        lt(schema.tasks.dueDate, sydneyToday)
      )
    )
    .groupBy(schema.tasks.assigneeEmail)

  const openBy = new Map<string, number>()
  for (const r of openRows) {
    if (r.email) openBy.set(r.email.toLowerCase(), Number(r.open ?? 0))
  }
  const overdueBy = new Map<string, number>()
  for (const r of overdueRows) {
    if (r.email) overdueBy.set(r.email.toLowerCase(), Number(r.overdue ?? 0))
  }

  const [unmappedRow] = await database
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.mappingSource, "unmapped"),
        gte(schema.timeEntries.entryDate, startYmd),
        lte(schema.timeEntries.entryDate, endYmd)
      )
    )

  const result: TeamWeekMemberRow[] = members.map((m) => {
    const email = m.email.toLowerCase()
    const duration_minutes = minutesByEmail.get(email) ?? 0
    return {
      email,
      name: m.name,
      active: m.active,
      duration_minutes,
      hours: minutesToHours(duration_minutes),
      open: openBy.get(email) ?? 0,
      overdue: overdueBy.get(email) ?? 0,
    }
  })

  // Default sort: hours desc (UI may re-sort)
  result.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))

  return {
    week_start: startYmd,
    week_end: endYmd,
    unmapped_count: Number(unmappedRow?.n ?? 0),
    members: result,
  }
}

