import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"

import { addCalendarDays, burstDaysLeft } from "./dates.js"
import { fmtMoney } from "./format.js"
import { remainingSpendToDeliverable } from "./rate.js"
import type {
  ScenarioLevers,
  ScenarioLine,
  ScenarioLineResult,
  ScenarioResult,
} from "./types.js"

function dailyMultipleLimit(line: ScenarioLine): number | null {
  const hay = `${line.platform} ${line.channel}`.toLowerCase()
  if (hay.includes("meta") || hay.includes("facebook") || hay.includes("tiktok")) return 2
  if (line.channel === "search" || hay.includes("search")) return 3
  return null
}

function moneyRemaining(budget: number, spent: number): number {
  if (!Number.isFinite(budget) || !Number.isFinite(spent)) return Number.NaN
  return budget - spent
}

export function applyScenario(
  lines: ScenarioLine[],
  levers: ScenarioLevers,
  asOf: string,
): ScenarioResult {
  const working = lines.map((line) => ({
    ...line,
    bursts: line.bursts.map((burst) => ({ ...burst })),
  }))
  const warnings: string[] = []
  const extraNotes = new Map<string, string[]>()
  const addNote = (id: string, note: string) => {
    const list = extraNotes.get(id) ?? []
    list.push(note)
    extraNotes.set(id, list)
  }

  for (const move of levers.moves) {
    const from = working.find((line) => line.lineItemId === move.from)
    const to = working.find((line) => line.lineItemId === move.to)
    if (!from || !to || !Number.isFinite(move.amount) || move.amount === 0) continue
    const sourceRemaining = moneyRemaining(from.budget, from.spent)
    if (Number.isFinite(sourceRemaining) && move.amount > sourceRemaining) {
      warnings.push(
        `Move of ${fmtMoney(move.amount)} from ${from.lineItemId} exceeds remaining ${fmtMoney(sourceRemaining)}.`,
      )
    }
    from.budget -= move.amount
    to.budget += move.amount
    addNote(from.lineItemId, `Moved ${fmtMoney(move.amount)} to ${to.lineItemId}.`)
    addNote(to.lineItemId, `Received ${fmtMoney(move.amount)} from ${from.lineItemId}.`)
  }

  const paused = new Set(levers.pauses)
  const capById = new Map(levers.caps.map((cap) => [cap.lineItemId, cap.dailyCap]))

  if (levers.extendDays) {
    for (const line of working) {
      line.daysLeft += levers.extendDays
      line.endDate = addCalendarDays(line.endDate, levers.extendDays)
    }
  }

  for (const change of levers.burstDateChanges) {
    const line = working.find((row) => row.lineItemId === change.lineItemId)
    const burst = line?.bursts.find((row) => row.index === change.index)
    if (!burst) continue
    burst.start = change.start
    burst.end = change.end
  }

  const results: ScenarioLineResult[] = working.map((line) => {
    const notes: string[] = [...(extraNotes.get(line.lineItemId) ?? [])]
    const remainingRaw = moneyRemaining(line.budget, line.spent)
    const isPaused = paused.has(line.lineItemId)
    const remaining = isPaused ? 0 : remainingRaw
    if (isPaused && Number.isFinite(remainingRaw) && remainingRaw > 0) {
      notes.push(`Unspent budget ${fmtMoney(remainingRaw)} after pause.`)
    }
    if (levers.extendDays) {
      notes.push(`End date extended ${levers.extendDays} days to ${line.endDate}.`)
    }

    const daysLeft = Math.max(0, line.daysLeft)
    const uncappedDaily = daysLeft > 0 && Number.isFinite(remaining) && remaining > 0
      ? remaining / daysLeft
      : 0
    const cap = capById.get(line.lineItemId)
    if (cap != null && Number.isFinite(cap)) {
      notes.push(`Daily cap ${fmtMoney(cap)}.`)
    }
    const perDayNeeded =
      isPaused
        ? 0
        : cap != null && Number.isFinite(cap)
          ? Math.min(cap, uncappedDaily)
          : uncappedDaily

    const projectedRemainingSpend = isPaused ? 0 : perDayNeeded * daysLeft
    const projectedFinish = line.spent + projectedRemainingSpend
    const finishPct =
      line.budget > 0 && Number.isFinite(projectedFinish)
        ? (projectedFinish / line.budget) * 100
        : Number.NaN
    const paceAtFinish = deliveryStatusFromPct(
      Number.isFinite(finishPct) ? finishPct : undefined,
    )

    if (line.rate?.basis === "plan") {
      warnings.push(`${line.lineItemId} has no delivered rate; using the plan rate.`)
    }

    const limit = dailyMultipleLimit(line)
    if (
      !isPaused &&
      limit != null &&
      line.yesterday > 0 &&
      Number.isFinite(perDayNeeded) &&
      perDayNeeded > limit * line.yesterday
    ) {
      const multiple = perDayNeeded / line.yesterday
      warnings.push(
        `${line.lineItemId} daily ${fmtMoney(perDayNeeded)} is ${multiple.toFixed(1)}× yesterday (${fmtMoney(line.yesterday)}) — above the ${limit}× ${line.platform} ceiling.`,
      )
    }

    const currentBurst =
      line.bursts.find((burst) => burst.start <= asOf && asOf <= burst.end) ??
      line.bursts[0] ??
      null
    let burst: { spend: number; pct: number } | null = null
    if (currentBurst && currentBurst.budget > 0) {
      const days = burstDaysLeft(currentBurst.start, currentBurst.end, asOf)
      const burstDaily = cap != null && Number.isFinite(cap)
        ? Math.min(cap, uncappedDaily)
        : uncappedDaily
      const projectedBurstSpend = currentBurst.spend + Math.max(0, burstDaily) * days
      burst = {
        spend: projectedBurstSpend,
        pct: (projectedBurstSpend / currentBurst.budget) * 100,
      }
    }

    return {
      lineItemId: line.lineItemId,
      remaining: Number.isFinite(remaining) ? remaining : Number.NaN,
      perDayNeeded,
      projectedFinish,
      finishPct,
      paceAtFinish,
      projectedDeliverable: remainingSpendToDeliverable(projectedRemainingSpend, line.rate),
      burst,
      notes,
    }
  })

  const campaignBudget = working.reduce((sum, line) => sum + line.budget, 0)
  const campaignFinish = results.reduce((sum, line) => sum + line.projectedFinish, 0)
  const delta = campaignFinish - campaignBudget
  const deltaPct = campaignBudget > 0 ? (delta / campaignBudget) * 100 : Number.NaN

  return {
    lines: results,
    campaign: {
      projectedFinish: campaignFinish,
      budget: campaignBudget,
      delta,
      deltaPct,
    },
    warnings,
  }
}
