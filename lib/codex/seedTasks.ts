/**
 * Campaign task seeding — pure plumbing. No route, UI, or create-trigger.
 *
 * Idempotent on (mba_number, source, label). Past-due rows are created FLAGGED,
 * never skipped. Due dates use Australia/Sydney civil days.
 */

import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { db, type Db } from "@/db"
import { tasks } from "@/db/schema/codex"
import { addSydneyDays, sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { createTask, type CreateTaskInput } from "@/lib/codex/repo"
import type { CodexTask } from "@/lib/codex/types"

export const SEED_PAST_DUE_FLAG = "[codex-seed-flag:past-due]"

export type SeedDueRelativeTo = "start" | "end" | "monthEnd"

export type SeedTaskRow = {
  label: string
  dueOffset: { days: number; relativeTo: SeedDueRelativeTo }
  ownerRole: string
}

export type CampaignSeedProfile = {
  name: string
  tasks: readonly SeedTaskRow[]
}

export type SeedActor = {
  email: string
  name?: string | null
}

export type SeedTasksForCampaignArgs = {
  mbaNumber: string
  clientId: number
  campaignStart: string
  campaignEnd: string
  profile: CampaignSeedProfile
  actor: SeedActor
  /** Injectable for tests — overdue uses Sydney civil today of this instant. */
  now?: Date
}

export type ExpandedSeedRow = {
  label: string
  dueYmd: string
  ownerRole: string
  source: string
}

export type SeedTasksResult = {
  created: CodexTask[]
  skipped: Array<{ label: string; existingId: number }>
  flaggedPastDue: CodexTask[]
}

/** Hard-coded Campaign profile — data, not procedural code. */
export const CAMPAIGN_PROFILE: CampaignSeedProfile = {
  name: "Campaign",
  tasks: [
    {
      label: "Confirm brief and objectives",
      dueOffset: { days: -21, relativeTo: "start" },
      ownerRole: "account lead",
    },
    {
      label: "Issue media briefs",
      dueOffset: { days: -18, relativeTo: "start" },
      ownerRole: "planner",
    },
    {
      label: "Collate publisher responses",
      dueOffset: { days: -12, relativeTo: "start" },
      ownerRole: "planner",
    },
    {
      label: "Internal plan review",
      dueOffset: { days: -10, relativeTo: "start" },
      ownerRole: "account lead",
    },
    {
      label: "Client plan presentation",
      dueOffset: { days: -7, relativeTo: "start" },
      ownerRole: "account lead",
    },
    {
      label: "Issue MBA and obtain PO",
      dueOffset: { days: -5, relativeTo: "start" },
      ownerRole: "account lead",
    },
    {
      label: "Issue IOs and file confirms",
      dueOffset: { days: -3, relativeTo: "start" },
      ownerRole: "implementation",
    },
    {
      label: "Apply naming conventions",
      dueOffset: { days: -2, relativeTo: "start" },
      ownerRole: "implementation",
    },
    {
      label: "Traffic creative and QA",
      dueOffset: { days: -1, relativeTo: "start" },
      ownerRole: "implementation",
    },
    {
      label: "Go-live check",
      dueOffset: { days: 0, relativeTo: "start" },
      ownerRole: "implementation",
    },
    {
      label: "Monthly report",
      dueOffset: { days: 0, relativeTo: "monthEnd" },
      ownerRole: "account lead",
    },
    {
      label: "PCA",
      dueOffset: { days: 10, relativeTo: "end" },
      ownerRole: "account lead",
    },
    {
      label: "Finance reconciliation",
      dueOffset: { days: 14, relativeTo: "end" },
      ownerRole: "finance",
    },
  ],
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function lastCivilDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Last civil day of each Sydney month from start month through end month inclusive. */
export function eachMonthEndYmd(startYmd: string, endYmd: string): string[] {
  const [sy, sm] = startYmd.split("-").map(Number)
  const [ey, em] = endYmd.split("-").map(Number)
  if (!sy || !sm || !ey || !em) return []

  const out: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    const last = lastCivilDayOfMonth(y, m)
    out.push(`${y}-${pad2(m)}-${pad2(last)}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function profileSource(name: string): string {
  return `profile:${name}`
}

/**
 * Expand profile rows to concrete (label, dueYmd) instances.
 * `monthEnd` rows become one task per month in the campaign flight
 * with labels `Monthly report — YYYY-MM`.
 */
export function expandSeedDueDates(args: {
  profile: CampaignSeedProfile
  campaignStart: string
  campaignEnd: string
}): ExpandedSeedRow[] {
  const source = profileSource(args.profile.name)
  const start = args.campaignStart.trim()
  const end = args.campaignEnd.trim()
  const out: ExpandedSeedRow[] = []

  for (const row of args.profile.tasks) {
    const { days, relativeTo } = row.dueOffset
    if (relativeTo === "monthEnd") {
      for (const monthEnd of eachMonthEndYmd(start, end)) {
        const dueYmd = addSydneyDays(monthEnd, days)
        const ym = monthEnd.slice(0, 7)
        out.push({
          label: `${row.label} — ${ym}`,
          dueYmd,
          ownerRole: row.ownerRole,
          source,
        })
      }
      continue
    }
    const anchor = relativeTo === "start" ? start : end
    out.push({
      label: row.label,
      dueYmd: addSydneyDays(anchor, days),
      ownerRole: row.ownerRole,
      source,
    })
  }
  return out
}

function buildDescription(args: {
  ownerRole: string
  pastDue: boolean
}): string {
  const lines: string[] = []
  if (args.pastDue) lines.push(SEED_PAST_DUE_FLAG)
  lines.push(`Owner role: ${args.ownerRole}`)
  return lines.join("\n")
}

async function findExistingSeededTask(
  args: { mbaNumber: string; source: string; label: string },
  database: Db
): Promise<{ id: number } | null> {
  const [row] = await database
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.mbaNumber, args.mbaNumber),
        eq(tasks.source, args.source),
        eq(tasks.title, args.label),
        isNull(tasks.deletedAt)
      )
    )
    .limit(1)
  return row ? { id: Number(row.id) } : null
}

/**
 * Seed tasks for a campaign from a profile. Idempotent on
 * (mba_number, source, label). Does not wire into campaign create.
 */
export async function seedTasksForCampaign(
  args: SeedTasksForCampaignArgs,
  database: Db = db
): Promise<SeedTasksResult> {
  const now = args.now ?? new Date()
  const sydneyToday = sydneyCivilParts(now).ymd
  const expanded = expandSeedDueDates({
    profile: args.profile,
    campaignStart: args.campaignStart,
    campaignEnd: args.campaignEnd,
  })

  const created: CodexTask[] = []
  const skipped: SeedTasksResult["skipped"] = []
  const flaggedPastDue: CodexTask[] = []

  const actorEmail = args.actor.email.trim().toLowerCase()

  for (const row of expanded) {
    const existing = await findExistingSeededTask(
      {
        mbaNumber: args.mbaNumber,
        source: row.source,
        label: row.label,
      },
      database
    )
    if (existing) {
      skipped.push({ label: row.label, existingId: existing.id })
      continue
    }

    const pastDue = row.dueYmd < sydneyToday
    const input: CreateTaskInput = {
      title: row.label,
      clientId: args.clientId,
      mbaNumber: args.mbaNumber,
      dueDate: row.dueYmd,
      source: row.source,
      description: buildDescription({
        ownerRole: row.ownerRole,
        pastDue,
      }),
      status: "todo",
      priority: "normal",
      createdByEmail: actorEmail,
      actorKind: "system",
    }

    const task = await createTask(input, actorEmail, database)
    created.push(task)
    if (pastDue) flaggedPastDue.push(task)
  }

  return { created, skipped, flaggedPastDue }
}
