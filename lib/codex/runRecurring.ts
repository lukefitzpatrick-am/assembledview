import "server-only"

import { toSydneyCivilYmd } from "@/lib/codex/dueDate"
import { isFeatureOn } from "@/lib/features/server"
import type { Db } from "@/db"
import {
  createGeneratedRecurringTask,
  findGeneratedRecurringTask,
  latestRecurringInstanceDueYmd,
  listRecurringSeeds,
  RecurringCopySkipped,
} from "@/lib/codex/repo"
import {
  parseRecurringRule,
  recurringPeriodsToGenerate,
} from "@/lib/codex/recurringRule"
import { melbourneParts } from "@/lib/dates/melbourne"

export type RecurringRunResult = {
  status: "ok" | "skipped" | "error"
  reason?: string
  checked: number
  created: number
  skippedExisting: number
  skippedNotDue: number
  skippedInvalidRule: number
  /** P1 (PACK3fix): a private project's seed whose assignee cannot see the project, or a seed deleted mid-run. */
  skippedNoAccess: number
  skippedSeedGone: number
  createdIds: number[]
  sydneyYmd: string
}

/**
 * Idempotent retainer generation. Safe to run twice in one day.
 * Keys on (seed task id, period). Catch-up fills missed due dates back
 * to the later of the seed's created day and 31 Sydney days ago.
 */
export async function runCodexRecurring(
  now: Date = new Date(),
  /** Tests pass a database; the cron uses the default. */
  database?: Db
): Promise<RecurringRunResult> {
  const sydneyYmd = melbourneParts(now).ymd

  if (!(await isFeatureOn("codex_v2"))) {
    return {
      status: "skipped",
      reason: "codex_v2_off",
      checked: 0,
      created: 0,
      skippedExisting: 0,
      skippedNotDue: 0,
      skippedInvalidRule: 0,
      skippedNoAccess: 0,
      skippedSeedGone: 0,
      createdIds: [],
      sydneyYmd,
    }
  }

  const seeds = await listRecurringSeeds(database)
  const createdIds: number[] = []
  let skippedExisting = 0
  let skippedNotDue = 0
  let skippedInvalidRule = 0
  let skippedNoAccess = 0
  let skippedSeedGone = 0

  for (const seed of seeds) {
    const parsed = parseRecurringRule(seed.recurringRule)
    if (!parsed) {
      skippedInvalidRule += 1
      continue
    }

    const lastDue = await latestRecurringInstanceDueYmd(seed.id, database)
    const createdYmd = toSydneyCivilYmd(seed.createdAt) ?? sydneyYmd
    const periods = recurringPeriodsToGenerate(parsed, {
      todayYmd: sydneyYmd,
      createdYmd,
      lastDueYmd: lastDue,
    })
    if (periods.length === 0) {
      skippedNotDue += 1
      continue
    }

    for (const due of periods) {
      const existing = await findGeneratedRecurringTask(seed.id, due.period, database)
      if (existing) {
        skippedExisting += 1
        continue
      }

      let created
      try {
        created = await createGeneratedRecurringTask(
          {
            seedTaskId: seed.id,
            title: seed.title,
            clientId: seed.clientId,
            templateId: seed.templateId,
            period: due.period,
            dueYmd: due.dueYmd,
            description: seed.description,
            priority: seed.priority,
            assigneeEmail: seed.assigneeEmail,
            assigneeName: seed.assigneeName,
            category: seed.category,
            mbaNumber: seed.mbaNumber,
            estimatedMinutes: seed.estimatedMinutes,
            createdByEmail: seed.createdByEmail || "system@codex.local",
          },
          database
        )
      } catch (err) {
        if (!(err instanceof RecurringCopySkipped)) throw err
        // Nothing written; the next run catches the period up once the seed is fixed.
        console.warn(`[codex-recurring] skipped seed ${seed.id} ${due.period}: ${err.reason}`)
        if (err.reason === "assignee_no_access") skippedNoAccess += 1
        else skippedSeedGone += 1
        break
      }
      createdIds.push(Number(created.id))
    }
  }

  return {
    status: "ok",
    checked: seeds.length,
    created: createdIds.length,
    skippedExisting,
    skippedNotDue,
    skippedInvalidRule,
    skippedNoAccess,
    skippedSeedGone,
    createdIds,
    sydneyYmd,
  }
}
