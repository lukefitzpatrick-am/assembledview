/**
 * In-memory period store for unit tests / local simulation without Postgres.
 */

import { addPeriodMonths, toPeriodMonthKey } from "@/lib/finance/periods/monthKey"
import { mergeRunCandidates } from "@/lib/finance/periods/mergeRun"
import { freezeItemsForLock, buildHeldRollCandidates } from "@/lib/finance/periods/lockPeriod"
import { applyReviewAction } from "@/lib/finance/periods/reviewItem"
import { flipStaleOnPublish } from "@/lib/finance/periods/staleFlip"
import { buildAdminAmendAudit, buildVarianceCandidate } from "@/lib/finance/periods/variance"
import { mediaInvoiceReference } from "@/lib/finance/periods/naturalKeys"
import type {
  AppNotification,
  ClientSnapshot,
  FinancePeriod,
  FinanceRunItem,
  ReviewAction,
  RunCandidate,
} from "@/lib/finance/periods/types"

let periodSeq = 1
let notifSeq = 1

export function resetMemoryPeriodStore(): void {
  periodSeq = 1
  notifSeq = 1
  memoryPeriods.clear()
  memoryItems.clear()
  memoryNotifications.length = 0
}

const memoryPeriods = new Map<string, FinancePeriod>()
const memoryItems = new Map<number, FinanceRunItem[]>() // periodId → items
const memoryNotifications: AppNotification[] = []

export function ensurePeriod(periodMonth: string): FinancePeriod {
  const key = toPeriodMonthKey(periodMonth)
  let p = memoryPeriods.get(key)
  if (!p) {
    p = {
      id: periodSeq++,
      periodMonth: key,
      status: "open",
      ranAt: null,
      lockedAt: null,
      lockedBy: null,
      amendedAfterLock: false,
      sheetBlobPathname: null,
      sheetVersion: 1,
    }
    memoryPeriods.set(key, p)
    memoryItems.set(p.id, [])
  }
  return p
}

export function getPeriod(periodMonth: string): FinancePeriod | null {
  return memoryPeriods.get(toPeriodMonthKey(periodMonth)) ?? null
}

export function listPeriods(): FinancePeriod[] {
  return [...memoryPeriods.values()].sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
}

export function getItems(periodId: number): FinanceRunItem[] {
  return [...(memoryItems.get(periodId) ?? [])]
}

export function runPeriodMemory(args: {
  periodMonth: string
  candidates: RunCandidate[]
  now?: Date
}): { period: FinancePeriod; items: FinanceRunItem[]; inserted: number; updated: number } {
  const period = ensurePeriod(args.periodMonth)
  const existing = getItems(period.id)
  const merged = mergeRunCandidates({
    periodId: period.id,
    existing,
    candidates: args.candidates,
  })
  memoryItems.set(period.id, merged.items)
  period.status = "review"
  period.ranAt = (args.now ?? new Date()).toISOString()
  memoryPeriods.set(period.periodMonth, period)
  return {
    period,
    items: merged.items,
    inserted: merged.inserted,
    updated: merged.updated,
  }
}

export function reviewItemMemory(
  periodMonth: string,
  itemId: number,
  action: ReviewAction
): FinanceRunItem {
  const period = ensurePeriod(periodMonth)
  const items = getItems(period.id)
  const idx = items.findIndex((i) => i.id === itemId)
  if (idx < 0) throw new Error(`Item ${itemId} not found`)
  const next = applyReviewAction(items[idx]!, action)
  items[idx] = next
  memoryItems.set(period.id, items)
  return next
}

export function lockPeriodMemory(args: {
  periodMonth: string
  lockedBy: string
  clientSnapshots: Map<number, ClientSnapshot>
  now?: Date
  sheetPathname?: string
}): {
  period: FinancePeriod
  frozen: FinanceRunItem[]
  nextPeriod: FinancePeriod
  rolled: number
} {
  const period = ensurePeriod(args.periodMonth)
  const items = getItems(period.id)
  const { frozen, heldToRoll } = freezeItemsForLock({
    items,
    clientSnapshotsByClientId: args.clientSnapshots,
  })
  memoryItems.set(period.id, frozen)
  period.status = "locked"
  period.lockedAt = (args.now ?? new Date()).toISOString()
  period.lockedBy = args.lockedBy
  if (args.sheetPathname) period.sheetBlobPathname = args.sheetPathname
  memoryPeriods.set(period.periodMonth, period)

  const nextKey = addPeriodMonths(period.periodMonth, 1)
  const nextPeriod = ensurePeriod(nextKey)
  const roll = buildHeldRollCandidates(heldToRoll)
  if (roll.length) {
    const existing = getItems(nextPeriod.id)
    const candidates: RunCandidate[] = roll.map((r) => ({
      source: r.source,
      naturalKey: r.naturalKey,
      mbaNumber: r.mbaNumber,
      clientId: r.clientId,
      versionId: r.versionId,
      sowId: r.sowId,
      lineItemsJson: r.lineItemsJson,
      amountCents: r.amountCents,
      invoiceReference: r.invoiceReference,
      heldReason: r.heldReason,
    }))
    const merged = mergeRunCandidates({
      periodId: nextPeriod.id,
      existing,
      candidates,
    })
    // stamp rolledFrom
    const stamped = merged.items.map((it) => {
      const src = roll.find((r) => r.naturalKey === it.naturalKey && r.source === it.source)
      return src ? { ...it, rolledFromItemId: src.rolledFromItemId, status: "held" as const } : it
    })
    memoryItems.set(nextPeriod.id, stamped)
  }

  return { period, frozen, nextPeriod, rolled: roll.length }
}

export function staleOnPublishMemory(mbaNumber: string, versionId?: number): number {
  let flipped = 0
  for (const period of memoryPeriods.values()) {
    if (period.status === "locked" || period.status === "invoiced" || period.status === "reconciled") {
      continue
    }
    const { items, flippedIds } = flipStaleOnPublish({
      items: getItems(period.id),
      mbaNumber,
      versionId,
    })
    memoryItems.set(period.id, items)
    flipped += flippedIds.length
  }
  return flipped
}

export function queueVarianceMemory(args: {
  lockedPeriodMonth: string
  itemId: number
  proposedAmountCents: number
  reason: string
}): FinanceRunItem {
  const locked = ensurePeriod(args.lockedPeriodMonth)
  const item = getItems(locked.id).find((i) => i.id === args.itemId)
  if (!item) throw new Error("Item not found")
  const nextKey = addPeriodMonths(locked.periodMonth, 1)
  const next = ensurePeriod(nextKey)
  const inv =
    item.source === "media" && item.mbaNumber
      ? mediaInvoiceReference(item.mbaNumber, nextKey)
      : item.invoiceReference
  const cand = buildVarianceCandidate({
    lockedItem: item,
    proposedAmountCents: args.proposedAmountCents,
    reason: args.reason,
    nextPeriodInvoiceReference: inv,
  })
  const merged = mergeRunCandidates({
    periodId: next.id,
    existing: getItems(next.id),
    candidates: [cand],
  })
  const stamped = merged.items.map((it) =>
    it.naturalKey === cand.naturalKey
      ? { ...it, linkedVarianceFromItemId: cand.linkedVarianceFromItemId }
      : it
  )
  memoryItems.set(next.id, stamped)
  return stamped.find((i) => i.naturalKey === cand.naturalKey)!
}

export function adminAmendMemory(args: {
  periodMonth: string
  itemId: number
  afterAmountCents: number
  reason: string
}): { period: FinancePeriod; item: FinanceRunItem; audit: ReturnType<typeof buildAdminAmendAudit> } {
  const period = ensurePeriod(args.periodMonth)
  const items = getItems(period.id)
  const idx = items.findIndex((i) => i.id === args.itemId)
  if (idx < 0) throw new Error("Item not found")
  const audit = buildAdminAmendAudit({
    item: items[idx]!,
    afterAmountCents: args.afterAmountCents,
    reason: args.reason,
    currentSheetVersion: period.sheetVersion,
  })
  items[idx] = {
    ...items[idx]!,
    amountCents: audit.afterCents,
    status: "adjusted",
    adjustmentCents: 0,
    adjustmentReason: audit.reason,
  }
  memoryItems.set(period.id, items)
  period.amendedAfterLock = true
  period.sheetVersion = audit.nextSheetVersion
  memoryPeriods.set(period.periodMonth, period)
  return { period, item: items[idx]!, audit }
}

export function pushNotification(args: {
  audience: string
  kind: string
  payload: Record<string, unknown>
}): AppNotification {
  const n: AppNotification = {
    id: notifSeq++,
    audience: args.audience,
    kind: args.kind,
    payload: args.payload,
    createdAt: new Date().toISOString(),
    readAt: null,
  }
  memoryNotifications.unshift(n)
  return n
}

export function listNotifications(audience?: string): AppNotification[] {
  if (!audience) return [...memoryNotifications]
  return memoryNotifications.filter((n) => n.audience === audience)
}

export function unreadCount(audience: string): number {
  return memoryNotifications.filter((n) => n.audience === audience && !n.readAt).length
}
