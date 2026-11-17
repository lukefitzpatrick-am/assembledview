/**
 * Task-count workload (B42, plan 5.5, behind `codex_projects`): open tasks
 * per person by week of `due_on` (Sydney civil date, Monday to Sunday), with
 * overdue, due this week and no due date. Pure (no database), so the panel
 * and the store share it.
 */
import { melbourneParts } from "@/lib/dates/melbourne"
import { addDaysISO } from "@/lib/dates/civil"

export const WORKLOAD_WEEKS_DEFAULT = 6
export const WORKLOAD_WEEKS_MAX = 12

export type WorkloadWeek = { start: string; end: string }

export type WorkloadPerson = {
  email: string
  name: string
  /** Open tasks assigned to them that the viewer can see. */
  open: number
  /** Open, due before today. */
  overdue: number
  /** Open, no due date. */
  no_due: number
  /** Open, due in each week of `weeks` (same order). */
  by_week: number[]
  /** Open, due after the last week shown. */
  later: number
}

export type Workload = { today: string; weeks: WorkloadWeek[]; people: WorkloadPerson[] }

/** `weeks` query: a whole number 1 to WORKLOAD_WEEKS_MAX, else the default. */
export function parseWorkloadWeeks(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= WORKLOAD_WEEKS_MAX ? n : WORKLOAD_WEEKS_DEFAULT
}

/** This Sydney week and the next `n - 1`, Monday to Sunday. */
export function workloadWeeks(now: Date, n: number): { today: string; weeks: WorkloadWeek[] } {
  const p = melbourneParts(now)
  const daysFromMonday = p.weekday === 0 ? 6 : p.weekday - 1
  const monday = addDaysISO(p.ymd, -daysFromMonday)
  const weeks: WorkloadWeek[] = []
  for (let i = 0; i < n; i++) {
    const start = addDaysISO(monday, 7 * i)
    weeks.push({ start, end: addDaysISO(start, 6) })
  }
  return { today: p.ymd, weeks }
}

/** One row per counted (assignee, due date) pair. */
export type WorkloadCountRow = { email: string; due_on: string | null; n: number }

/**
 * Rows per roster person, in roster order. Tasks assigned to someone not on
 * the list are not shown (the list is the people the viewer may see: active
 * roster members). A week holds tasks due in it; overdue ones count in
 * `overdue` and in the week they fall in only when it is shown (this week).
 */
export function buildWorkload(
  people: ReadonlyArray<{ email: string; name: string }>,
  rows: readonly WorkloadCountRow[],
  today: string,
  weeks: readonly WorkloadWeek[]
): WorkloadPerson[] {
  const byEmail = new Map<string, WorkloadPerson>()
  const out: WorkloadPerson[] = people.map((p) => {
    const row: WorkloadPerson = { email: p.email.toLowerCase(), name: p.name, open: 0, overdue: 0, no_due: 0, by_week: weeks.map(() => 0), later: 0 }
    byEmail.set(row.email, row)
    return row
  })
  const last = weeks.length > 0 ? weeks[weeks.length - 1].end : today
  for (const r of rows) {
    const person = byEmail.get(r.email.toLowerCase())
    if (!person) continue
    const n = Number(r.n) || 0
    person.open += n
    if (r.due_on == null) {
      person.no_due += n
      continue
    }
    if (r.due_on < today) person.overdue += n
    const w = weeks.findIndex((wk) => r.due_on! >= wk.start && r.due_on! <= wk.end)
    if (w >= 0) person.by_week[w] += n
    else if (r.due_on > last) person.later += n
  }
  return out
}
