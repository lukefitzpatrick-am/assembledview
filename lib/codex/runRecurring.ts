import "server-only"

import { isCodexV2Enabled } from "@/lib/codex/flag"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import {
  createGeneratedRecurringTask,
  findGeneratedRecurringTask,
  listRecurringSeeds,
} from "@/lib/codex/repo"
import {
  parseRecurringRule,
  resolveRecurringDue,
} from "@/lib/codex/recurringRule"

export type RecurringRunResult = {
  status: "ok" | "skipped" | "error"
  reason?: string
  checked: number
  created: number
  skippedExisting: number
  skippedNotDue: number
  skippedInvalidRule: number
  createdIds: number[]
  sydneyYmd: string
}

/**
 * Idempotent retainer generation. Safe to run twice in one day.
 * Keys on (template_id, client_id, period) via description period marker.
 */
export async function runCodexRecurring(
  now: Date = new Date()
): Promise<RecurringRunResult> {
  const sydneyYmd = sydneyCivilParts(now).ymd

  if (!isCodexV2Enabled()) {
    return {
      status: "skipped",
      reason: "codex_v2_off",
      checked: 0,
      created: 0,
      skippedExisting: 0,
      skippedNotDue: 0,
      skippedInvalidRule: 0,
      createdIds: [],
      sydneyYmd,
    }
  }

  const seeds = await listRecurringSeeds()
  const createdIds: number[] = []
  let skippedExisting = 0
  let skippedNotDue = 0
  let skippedInvalidRule = 0

  for (const seed of seeds) {
    const parsed = parseRecurringRule(seed.recurringRule)
    if (!parsed) {
      skippedInvalidRule += 1
      continue
    }

    const due = resolveRecurringDue(parsed, now)
    if (!due.shouldGenerate) {
      skippedNotDue += 1
      continue
    }

    const existing = await findGeneratedRecurringTask(
      seed.templateId,
      seed.clientId,
      due.period
    )
    if (existing) {
      skippedExisting += 1
      continue
    }

    const created = await createGeneratedRecurringTask({
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
      createdByEmail: seed.createdByEmail || "system@codex.local",
    })
    createdIds.push(Number(created.id))
  }

  return {
    status: "ok",
    checked: seeds.length,
    created: createdIds.length,
    skippedExisting,
    skippedNotDue,
    skippedInvalidRule,
    createdIds,
    sydneyYmd,
  }
}
