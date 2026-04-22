"use client"

import { useState, useEffect, lazy, Suspense, useCallback, useMemo, use, useRef } from "react"
import { useWatch } from "react-hook-form"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { Download, FileText, Loader2, MoreHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CampaignExportsSection } from "@/components/dashboard/CampaignExportsSection"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import FloatingSectionNav from "@/components/mediaplans/FloatingSectionNav"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatMoney } from "@/lib/format/money"
import {
  appendPartialApprovalToBillingSchedule,
  billingMonthsHaveDetailedLineItems,
  computeLineItemTotalsFromDeliveryMonths,
  hydratePartialMbaFromSavedMetadata,
  recomputePartialMbaFromSelections,
  type PartialApprovalLineItem,
  type PartialApprovalMetadata,
  type PartialMbaValues,
} from "@/lib/mediaplan/partialMba"
import { setAssistantContext } from "@/lib/assistantBridge"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { getSearchBursts } from "@/components/media-containers/SearchContainer"
import { getSocialMediaBursts } from "@/components/media-containers/SocialMediaContainer"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead, TableFooter } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { SavingModal, type SaveStatusItem } from "@/components/ui/saving-modal"
import { OutcomeModal } from "@/components/outcome-modal"
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-changes-prompt"
import { 
  getSearchLineItemsByMBA, 
  saveSocialMediaLineItems,
  getTelevisionLineItemsByMBA,
  getRadioLineItemsByMBA,
  getNewspaperLineItemsByMBA,
  getMagazinesLineItemsByMBA,
  getOOHLineItemsByMBA,
  getCinemaLineItemsByMBA,
  getDigitalDisplayLineItemsByMBA,
  getDigitalAudioLineItemsByMBA,
  getDigitalVideoLineItemsByMBA,
  getBVODLineItemsByMBA,
  getIntegrationLineItemsByMBA,
  getProgDisplayLineItemsByMBA,
  getProgVideoLineItemsByMBA,
  getProgBVODLineItemsByMBA,
  getProgAudioLineItemsByMBA,
  getProgOOHLineItemsByMBA,
  getInfluencersLineItemsByMBA,
  getSocialMediaLineItemsByMBA,
  getProductionLineItemsByMBA,
  saveTelevisionLineItems,
  saveRadioLineItems,
  saveNewspaperLineItems,
  saveMagazinesLineItems,
  saveOOHLineItems,
  saveCinemaLineItems,
  saveDigitalDisplayLineItems,
  saveDigitalAudioLineItems,
  saveDigitalVideoLineItems,
  saveBVODLineItems,
  saveIntegrationLineItems,
  saveSearchLineItems,
  saveProgDisplayLineItems,
  saveProgVideoLineItems,
  saveProgBVODLineItems,
  saveProgAudioLineItems,
  saveProgOOHLineItems,
  saveInfluencersLineItems,
  saveProductionLineItems,
  uploadMediaPlanVersionDocuments
} from "@/lib/api"
import type { BillingMonth, BillingLineItem as BillingLineItemType, BillingBurst } from "@/lib/billing/types"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import { prepareBillingMonthsForLineItemExport } from "@/lib/billing/prepareBillingMonthsForLineItemExport"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import {
  buildBillingScheduleExcelBlob,
  sanitizeFilenamePart,
} from "@/lib/billing/exportBillingScheduleExcel"
import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import {
  applyCostBucketFromAutoReferenceAggregates,
  buildWorkingMonthsFromAutoReference,
  copySingleLineItemFromAutoTemplate,
  deepCloneBillingMonthsState,
} from "@/lib/billing/resetFromAutoReference"
import { generateMediaPlan, MediaPlanHeader, LineItem, MediaItems } from '@/lib/generateMediaPlan'
import type { Publisher } from "@/lib/types/publisher"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
  filterMediaItemsForAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import { generateNamingWorkbook } from '@/lib/namingConventions'
import { saveAs } from 'file-saver'
import { filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper'
import { toDateOnlyString, parseDateOnlyString } from "@/lib/timezone"

/** Stable id for billing rows so merge/save validation align with persisted `lineItemId` / `line_item_id`. */
function billingStableLineItemId(mediaType: string, lineItem: any, index: number): string {
  const raw = lineItem?.line_item_id ?? lineItem?.id
  if (raw != null && String(raw).trim() !== "") {
    return `billing-${mediaType}::${String(raw)}`
  }
  return `billing-${mediaType}::new-${index}`
}

/** Normalize for Set / comparisons so template vs working ids always match when logically the same. */
function billingLineItemIdKey(id: unknown): string {
  return String(id ?? "").trim()
}

function billingHeadersMatch(
  a: { header1?: string; header2?: string },
  b: { header1?: string; header2?: string }
): boolean {
  return (
    String(a.header1 ?? "").trim() === String(b.header1 ?? "").trim() &&
    String(a.header2 ?? "").trim() === String(b.header2 ?? "").trim()
  )
}

/** True when id is from stable media line_item mapping (not legacy composite ids). */
function isStableBillingLineItemId(id: string | undefined): boolean {
  return Boolean(id && String(id).startsWith("billing-"))
}

function parseAudMoney(val: unknown): number {
  return parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0
}

const BILLING_INTEGRITY_EPS = 0.02

/**
 * Blocking integrity: month-level rollups, production vs mediaCosts.production, line sums vs media cost columns.
 * Does not judge manual vs burst intent — only internal consistency of saved billing rows.
 */
function collectBillingMonthStructuralBlockingIssues(
  months: BillingMonth[],
  fmt: Intl.NumberFormat
): string[] {
  const blocking: string[] = []

  for (const month of months) {
    const my = month.monthYear
    const fee = parseAudMoney(month.feeTotal)
    const adserv = parseAudMoney(month.adservingTechFees)
    const prodTop = parseAudMoney(month.production)
    const mc = month.mediaCosts
    const prodMc = mc ? parseAudMoney(mc.production) : 0

    if (Math.abs(prodTop - prodMc) > BILLING_INTEGRITY_EPS) {
      blocking.push(
        `${my}: Production total (${fmt.format(prodTop)}) does not match the production figure under media costs (${fmt.format(prodMc)}).`
      )
    }

    let mediaSumNonProduction = 0
    if (mc) {
      for (const [mk, raw] of Object.entries(mc)) {
        if (mk === "production") continue
        mediaSumNonProduction += parseAudMoney(raw)
      }
    }

    const mediaTotalLbl = parseAudMoney(month.mediaTotal)
    if (Math.abs(mediaSumNonProduction - mediaTotalLbl) > BILLING_INTEGRITY_EPS) {
      blocking.push(
        `${my}: Media subtotal (${fmt.format(mediaTotalLbl)}) must equal the sum of non-production media cost columns (${fmt.format(mediaSumNonProduction)}).`
      )
    }

    const totalLbl = parseAudMoney(month.totalAmount)
    const composed = mediaTotalLbl + fee + adserv + prodTop
    if (Math.abs(totalLbl - composed) > BILLING_INTEGRITY_EPS) {
      blocking.push(
        `${my}: Grand total (${fmt.format(totalLbl)}) must equal media subtotal + agency fee + tech fees + production (${fmt.format(composed)}).`
      )
    }

    if (month.lineItems && mc) {
      for (const mk of Object.keys(month.lineItems)) {
        const items = month.lineItems[mk as keyof typeof month.lineItems] as BillingLineItemType[] | undefined
        if (!items?.length) continue
        const lineSum = items.reduce((s, li) => s + (li.monthlyAmounts?.[my] || 0), 0)
        if (!(mk in mc)) continue
        const costParsed = parseAudMoney((mc as Record<string, string>)[mk])
        if (Math.abs(lineSum - costParsed) > BILLING_INTEGRITY_EPS) {
          blocking.push(
            `${my} · ${mk}: Sum of line items for this month (${fmt.format(lineSum)}) does not match the media cost column (${fmt.format(costParsed)}).`
          )
        }
      }
    }
  }

  return blocking
}

type BillingSaveValidationResult = {
  /** Must be fixed before campaign save (modal can bypass with “Save anyway”). */
  blockingErrors: string[]
  /** Intentional manual differences vs auto/bursts — informational on save, not blockers. */
  preservedManualOverrides: string[]
  hasAnyIssue: boolean
}

function calculateExpectedLineItemFeeTotal(sourceLineItem: any): number {
  let bursts: any[] = []
  if (typeof sourceLineItem?.bursts_json === "string") {
    try {
      bursts = JSON.parse(sourceLineItem.bursts_json)
    } catch {
      bursts = []
    }
  } else if (Array.isArray(sourceLineItem?.bursts_json)) {
    bursts = sourceLineItem.bursts_json
  } else if (Array.isArray(sourceLineItem?.bursts)) {
    bursts = sourceLineItem.bursts
  }

  const parseMoney = (v: any) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0

  return bursts.reduce((sum: number, burst: any) => {
    const budget = parseMoney(burst?.budget) || parseMoney(burst?.buyAmount)
    const feePctRaw =
      burst?.feePercentage ??
      burst?.fee_percentage ??
      sourceLineItem?.feePercentage ??
      sourceLineItem?.fee_percentage
    const feePct = Number.isFinite(Number(feePctRaw)) ? Math.max(0, Math.min(100, Number(feePctRaw))) : 0
    const budgetIncludesFees = Boolean(
      burst?.budgetIncludesFees ??
        burst?.budget_includes_fees ??
        sourceLineItem?.budgetIncludesFees ??
        sourceLineItem?.budget_includes_fees
    )
    const clientPaysForMedia = Boolean(
      burst?.clientPaysForMedia ??
        burst?.client_pays_for_media ??
        sourceLineItem?.clientPaysForMedia ??
        sourceLineItem?.client_pays_for_media
    )

    if (budget <= 0 || feePct <= 0) return sum
    if (budgetIncludesFees) return sum + (budget * feePct) / 100
    if (feePct >= 100) return sum
    return (
      sum +
      (clientPaysForMedia ? (budget / (100 - feePct)) * feePct : (budget * feePct) / (100 - feePct))
    )
  }, 0)
}

/** JSON deep clone for billing month graphs (merge helpers at file scope). */
function cloneBillingMonthGraph<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

/**
 * Build one row per campaign month from the auto template order: overlapping months are a deep clone of
 * **working** data (unchanged). Months that only exist on the auto template are cloned from the template.
 */
function appendMissingMonthsOnly(
  oldMonths: BillingMonth[],
  templateMonths: BillingMonth[]
): BillingMonth[] {
  const oldByKey = new Map(oldMonths.map((m) => [m.monthYear, m]))
  return templateMonths.map((t) => {
    const prev = oldByKey.get(t.monthYear)
    if (prev) return cloneBillingMonthGraph(prev)
    return cloneBillingMonthGraph(t)
  })
}

/**
 * Ensure every campaign month key exists on a *new* template line item; preserves template amounts where present.
 */
function seedLineItemMonthKeysFromTemplate(
  templateLi: BillingLineItemType,
  allCampaignMonthKeys: string[]
): BillingLineItemType {
  const li = cloneBillingMonthGraph(templateLi)
  const monthlyAmounts: Record<string, number> = { ...li.monthlyAmounts }
  for (const k of allCampaignMonthKeys) {
    if (!(k in monthlyAmounts)) monthlyAmounts[k] = 0
  }
  li.monthlyAmounts = monthlyAmounts
  li.totalAmount = Object.values(monthlyAmounts).reduce((s, v) => s + (v || 0), 0)
  return li
}

/** Overwrite an existing billing row with burst-derived template data (Edit Billing “reset all to auto” follow mode). */
function resyncExistingLineItemFromTemplate(
  existing: BillingLineItemType,
  tLi: BillingLineItemType,
  allCampaignMonthKeys: string[]
) {
  const seeded = seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys)
  const preserveId = existing.id
  const preserveLegacy = existing.legacySaved
  Object.assign(existing, seeded)
  existing.id = preserveId
  if (preserveLegacy) existing.legacySaved = true
  existing.preBill = false
  existing.preBillSnapshot = undefined
}

/**
 * Append line items that appear in the auto template but not in saved billing for this media type.
 * If an id already exists but was seeded with $0 and the template now has real amounts, merge those in
 * (burst data arriving after the first append). Other existing rows are unchanged.
 * With `resyncExistingFromTemplate`, every id present on the template is refreshed from the template (follow-auto mode).
 */
function appendMissingLineItemsOnly(
  existingItems: BillingLineItemType[],
  templateItems: BillingLineItemType[],
  allCampaignMonthKeys: string[],
  opts?: { resyncExistingFromTemplate?: boolean }
): { list: BillingLineItemType[]; didAppend: boolean } {
  const resync = Boolean(opts?.resyncExistingFromTemplate)
  const list = existingItems.map((li) => cloneBillingMonthGraph(li))
  const oldIds = new Set(list.map((li) => billingLineItemIdKey(li.id)))
  let didAppend = false
  for (const tLi of templateItems) {
    const tid = billingLineItemIdKey(tLi.id)
    if (!tid) continue
    if (oldIds.has(tid)) {
      const existing = list.find((li) => billingLineItemIdKey(li.id) === tid)
      if (!existing) continue
      if (resync) {
        resyncExistingLineItemFromTemplate(existing, tLi, allCampaignMonthKeys)
        didAppend = true
      } else if (existing.totalAmount === 0 && tLi.totalAmount > 0) {
        const seeded = seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys)
        existing.monthlyAmounts = seeded.monthlyAmounts
        existing.totalAmount = seeded.totalAmount
        if (seeded.feeMonthlyAmounts) existing.feeMonthlyAmounts = seeded.feeMonthlyAmounts
        if (seeded.totalFeeAmount != null) existing.totalFeeAmount = seeded.totalFeeAmount
        if (seeded.adServingMonthlyAmounts) existing.adServingMonthlyAmounts = seeded.adServingMonthlyAmounts
        if (seeded.totalAdServingAmount != null) existing.totalAdServingAmount = seeded.totalAdServingAmount
        didAppend = true
      }
      continue
    }
    list.push(seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys))
    oldIds.add(tid)
    didAppend = true
  }
  return { list, didAppend }
}

/**
 * New media key on the auto template: seed the full template line list for that key only (no changes to other keys).
 */
function appendMissingMediaTypesOnly(
  templateItems: BillingLineItemType[],
  allCampaignMonthKeys: string[]
): BillingLineItemType[] {
  return templateItems.map((tLi) => seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys))
}

const isBillingAppendDebug =
  typeof process !== "undefined" && process.env.NODE_ENV === "development"

function billingAppendDebug(...args: unknown[]) {
  if (isBillingAppendDebug) console.log("[billing-append]", ...args)
}

/**
 * `billingPlanStructureKey` uses `flag#id1(bursts),…`; an empty tail (`mp_bvod#`) means the media type is on but
 * no billing line-item ids are materialized yet (containers / transforms / API).
 */
function billingStructureKeyHasPendingEmptyLineSlots(structureKey: string): boolean {
  if (!structureKey?.trim()) return false
  return structureKey.split("|").some((seg) => {
    const hash = seg.indexOf("#")
    if (hash < 0) return false
    return seg.slice(hash + 1).trim() === ""
  })
}

/** Enabled media types need at least one line-item row before we treat that key as ready for template generation. */
function isMediaTypeReadyForBillingAppend(enabled: boolean, lineItems: any[] | null | undefined): boolean {
  if (!enabled) return true
  return Array.isArray(lineItems) && lineItems.length > 0
}

/**
 * Used only for **new** campaign months cloned from the auto template: set each `mediaCosts` bucket from
 * line items for that key only, then derive month rollups from **those** sums plus existing fee / tech /
 * production strings — does not re-sum unrelated `mediaCosts` keys that may exist on the cloned row.
 */
function recomputeFullMonthFromLineItems(row: BillingMonth, formatter: Intl.NumberFormat) {
  if (!row.mediaCosts) row.mediaCosts = {} as BillingMonth["mediaCosts"]
  const mc = row.mediaCosts as Record<string, string>
  let mediaSumExcludingProduction = 0
  if (row.lineItems) {
    for (const mk of Object.keys(row.lineItems)) {
      const lis = row.lineItems[mk as keyof typeof row.lineItems] as BillingLineItemType[]
      if (!lis?.length) continue
      const sum = lis.reduce((s, li) => s + (li.monthlyAmounts[row.monthYear] || 0), 0)
      mc[mk] = formatter.format(sum)
      if (mk !== "production") mediaSumExcludingProduction += sum
    }
  }
  const feeTotal = parseFloat(String(row.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0
  const adServingTotal = parseFloat(String(row.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0
  const productionTotal =
    parseFloat(String(row.production || row.mediaCosts?.production || "$0").replace(/[^0-9.-]/g, "")) || 0
  row.mediaTotal = formatter.format(mediaSumExcludingProduction)
  row.totalAmount = formatter.format(mediaSumExcludingProduction + feeTotal + adServingTotal + productionTotal)
}

/**
 * Append path only: bump month rollups by numeric deltas without re-reading every bucket.
 * Does not modify feeTotal, adservingTechFees, or production.
 */
function incrementMonthTotalsForNewEntries(
  row: BillingMonth,
  opts: { deltaNonProductionMedia: number; deltaAppliedToTotal: number },
  formatter: Intl.NumberFormat
) {
  const { deltaNonProductionMedia, deltaAppliedToTotal } = opts
  if (deltaNonProductionMedia === 0 && deltaAppliedToTotal === 0) return

  if (deltaNonProductionMedia !== 0) {
    const prevMedia = parseBucketMoney(row.mediaTotal)
    row.mediaTotal = formatter.format(prevMedia + deltaNonProductionMedia)
  }
  if (deltaAppliedToTotal !== 0) {
    const prevTotal = parseBucketMoney(row.totalAmount)
    row.totalAmount = formatter.format(prevTotal + deltaAppliedToTotal)
  }
}

function parseBucketMoney(val: unknown): number {
  return parseFloat(String(val ?? "$0").replace(/[^0-9.-]/g, "")) || 0
}

/** Sum of template line items’ amounts for `monthYear` whose ids are not in `existingIds` (normalized keys). */
function sumTemplateLineAmountsForNewIds(
  templateItems: BillingLineItemType[],
  existingIds: Set<string>,
  monthYear: string
): number {
  return templateItems
    .filter((t) => !existingIds.has(billingLineItemIdKey(t.id)))
    .reduce((s, t) => s + (t.monthlyAmounts[monthYear] || 0), 0)
}

/**
 * Working month has no line items for this media key: insert template lines and set `mediaCosts[mediaKey]`
 * from prior bucket + template line sums for this month. Returns the **numeric bucket delta** for rollup bumps.
 */
function appendNewMediaTypeIntoWorkingMonth(
  base: BillingMonth,
  mediaKey: string,
  templateItems: BillingLineItemType[],
  allCampaignMonthKeys: string[],
  formatter: Intl.NumberFormat
): { bucketDelta: number; mediaKey: string } | null {
  if (!templateItems.length) return null

  if (!base.lineItems) base.lineItems = {}
  if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

  const priorBucket = parseBucketMoney((base.mediaCosts as Record<string, string>)[mediaKey])
  const seeded = appendMissingMediaTypesOnly(templateItems, allCampaignMonthKeys)
  ;(base.lineItems as Record<string, BillingLineItemType[]>)[mediaKey] = seeded

  const sumNewLines = templateItems.reduce(
    (s, t) => s + (t.monthlyAmounts[base.monthYear] || 0),
    0
  )
  const nextBucket = priorBucket + sumNewLines
  const bucketDelta = nextBucket - priorBucket
  ;(base.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(nextBucket)

  billingAppendDebug("appendNewMediaTypeIntoWorkingMonth", {
    monthYear: base.monthYear,
    mediaKey,
    lineItemCount: seeded.length,
    priorBucket,
    sumNewLines,
    bucketDelta,
    mediaCostForKey: formatter.format(nextBucket),
  })

  return { bucketDelta, mediaKey }
}

/**
 * Merge auto template into an *existing* saved month: append-only structure and **constant-add** bucket updates.
 * Existing line items (by id) and existing month bucket strings are preserved; only **new** template line ids
 * contribute dollar deltas to `mediaCosts`. Month fee / tech / production strings are never derived here.
 * With `resyncExistingFromTemplate`, line items and month fee / tech / production match the template, then
 * media buckets and rollups are recomputed from line items (follow-auto after full billing reset).
 */
function mergeAppendIntoExistingMonth(
  base: BillingMonth,
  templateRow: BillingMonth,
  allCampaignMonthKeys: string[],
  formatter: Intl.NumberFormat,
  opts?: { resyncExistingFromTemplate?: boolean }
): BillingMonth {
  const resync = Boolean(opts?.resyncExistingFromTemplate)
  const templateMediaKeys = templateRow.lineItems
    ? Object.keys(templateRow.lineItems).filter((mk) => {
        const arr = templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as
          | BillingLineItemType[]
          | undefined
        return Array.isArray(arr) && arr.length > 0
      })
    : []

  if (templateMediaKeys.length === 0) {
    return base
  }

  if (resync) {
    if (!base.lineItems) base.lineItems = {}
    if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

    for (const mk of templateMediaKeys) {
      const templateItems =
        (templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as BillingLineItemType[]) ?? []
      const existingItems =
        (base.lineItems![mk as keyof typeof base.lineItems] as BillingLineItemType[] | undefined) ?? []

      if (existingItems.length === 0) {
        appendNewMediaTypeIntoWorkingMonth(base, mk, templateItems, allCampaignMonthKeys, formatter)
      } else {
        const { list } = appendMissingLineItemsOnly(existingItems, templateItems, allCampaignMonthKeys, {
          resyncExistingFromTemplate: true,
        })
        ;(base.lineItems as Record<string, BillingLineItemType[]>)[mk] = list
      }
    }

    base.feeTotal = templateRow.feeTotal
    base.adservingTechFees = templateRow.adservingTechFees
    base.production = templateRow.production ?? base.production
    if (base.mediaCosts && templateRow.mediaCosts?.production !== undefined) {
      base.mediaCosts.production = templateRow.mediaCosts.production
    }
    recomputeFullMonthFromLineItems(base, formatter)
    return base
  }

  const newMediaKeysForMonth = templateMediaKeys.filter((mk) => {
    const ex =
      (base.lineItems?.[mk as keyof typeof base.lineItems] as BillingLineItemType[] | undefined) ?? []
    return ex.length === 0
  })
  if (newMediaKeysForMonth.length > 0) {
    billingAppendDebug("mergeAppendIntoExistingMonth: new media keys on saved month", {
      monthYear: base.monthYear,
      newMediaKeysForMonth,
    })
  }

  if (!base.lineItems) base.lineItems = {}
  if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

  let deltaNonProductionMedia = 0
  let deltaAppliedToTotal = 0

  for (const mk of templateMediaKeys) {
    const templateItems =
      (templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as BillingLineItemType[]) ?? []
    const existingItems =
      (base.lineItems![mk as keyof typeof base.lineItems] as BillingLineItemType[] | undefined) ?? []

    if (existingItems.length === 0) {
      const added = appendNewMediaTypeIntoWorkingMonth(base, mk, templateItems, allCampaignMonthKeys, formatter)
      if (added && added.bucketDelta !== 0) {
        deltaAppliedToTotal += added.bucketDelta
        if (added.mediaKey !== "production") deltaNonProductionMedia += added.bucketDelta
      }
    } else {
      const priorBucket = parseBucketMoney((base.mediaCosts as Record<string, string>)[mk])
      const { list, didAppend } = appendMissingLineItemsOnly(
        existingItems,
        templateItems,
        allCampaignMonthKeys
      )
      if (didAppend) {
        ;(base.lineItems as Record<string, BillingLineItemType[]>)[mk] = list
        // Recalculate bucket from updated list — covers both new IDs and $0-to-real updates
        const newBucket = list.reduce((s, li) => s + (li.monthlyAmounts[base.monthYear] || 0), 0)
        const delta = newBucket - priorBucket
        if (delta !== 0) {
          ;(base.mediaCosts as Record<string, string>)[mk] = formatter.format(newBucket)
          deltaAppliedToTotal += delta
          if (mk !== "production") deltaNonProductionMedia += delta
          billingAppendDebug("append line items (existing media key)", {
            monthYear: base.monthYear,
            mediaKey: mk,
            delta,
            newBucket: formatter.format(newBucket),
          })
        } else {
          billingAppendDebug("append line items zero delta (ids added/updated, $0 this month)", {
            monthYear: base.monthYear,
            mediaKey: mk,
          })
        }
      }
    }
  }

  // Append-only fill for month-level cost buckets.
  // Treat $0.00 as "nothing saved, fill from auto" — the historical bug
  // silently zeroed adservingTechFees on save, so almost no $0 is intentional.
  // Manual edits land non-zero, so they survive.
  const isZeroOrEmpty = (s: unknown) => parseBucketMoney(s) === 0

  if (isZeroOrEmpty(base.feeTotal) && !isZeroOrEmpty(templateRow.feeTotal)) {
    const add = parseBucketMoney(templateRow.feeTotal)
    base.feeTotal = templateRow.feeTotal
    deltaAppliedToTotal += add
  }

  if (isZeroOrEmpty(base.adservingTechFees) && !isZeroOrEmpty(templateRow.adservingTechFees)) {
    const add = parseBucketMoney(templateRow.adservingTechFees)
    base.adservingTechFees = templateRow.adservingTechFees
    deltaAppliedToTotal += add
  }

  if (isZeroOrEmpty(base.production) && !isZeroOrEmpty(templateRow.production)) {
    const add = parseBucketMoney(templateRow.production)
    base.production = templateRow.production
    if (base.mediaCosts && templateRow.mediaCosts?.production !== undefined) {
      base.mediaCosts.production = templateRow.mediaCosts.production
    }
    deltaAppliedToTotal += add
  }

  if (deltaNonProductionMedia !== 0 || deltaAppliedToTotal !== 0) {
    incrementMonthTotalsForNewEntries(
      base,
      { deltaNonProductionMedia, deltaAppliedToTotal },
      formatter
    )
  }
  return base
}

/**
 * Append-only: working is authoritative. Template supplies **new** months, media keys, and line-item ids only.
 * Existing months: line items with matching ids are unchanged; `mediaCosts` for a key change only by **adding**
 * auto amounts for newly appended line ids (never full re-sum of that bucket). New months: row is template-derived
 * then totals derived once from those line-item buckets (+ fee / tech / production strings). Existing months:
 * use `incrementMonthTotalsForNewEntries` only — no full re-sum of all buckets. Full replace from auto remains only
 * via Edit Billing reset.
 */
function appendAutoLineItemTemplateIntoWorking(
  workingMonths: BillingMonth[],
  templateWithLineItems: BillingMonth[],
  formatter: Intl.NumberFormat,
  opts?: { resyncExistingFromTemplate?: boolean }
): BillingMonth[] {
  if (!templateWithLineItems.length) return workingMonths

  const oldByKey = new Map(workingMonths.map((m) => [m.monthYear, m]))
  const allCampaignMonthKeys = templateWithLineItems.map((m) => m.monthYear)
  const combinedRows = appendMissingMonthsOnly(workingMonths, templateWithLineItems)

  let newCampaignMonths = 0
  const out = combinedRows.map((row, i) => {
    const tRow = templateWithLineItems[i]
    if (!oldByKey.has(tRow.monthYear)) {
      newCampaignMonths++
      const fresh = cloneBillingMonthGraph(row)
      recomputeFullMonthFromLineItems(fresh, formatter)
      billingAppendDebug("new campaign month row", {
        monthYear: tRow.monthYear,
        mediaKeys: fresh.lineItems ? Object.keys(fresh.lineItems) : [],
      })
      return fresh
    }
    return mergeAppendIntoExistingMonth(row, tRow, allCampaignMonthKeys, formatter, opts)
  })

  billingAppendDebug("appendAutoLineItemTemplateIntoWorking done", {
    workingInputMonths: workingMonths.length,
    templateMonths: templateWithLineItems.length,
    newCampaignMonths,
    outputMonths: out.length,
  })

  return out
}

/**
 * Build line-item template: prefer burst-derived auto months; if auto is empty but working has rows, use working
 * as the month skeleton so toggling media types still merges (attach reads live form + containers).
 */
function buildWorkingBillingAppendTemplate(
  autoReferenceMonths: BillingMonth[],
  workingMonths: BillingMonth[],
  attachLineItemsToMonths: (months: BillingMonth[], mode: "billing" | "delivery") => BillingMonth[]
): BillingMonth[] {
  const skeleton = autoReferenceMonths.length > 0 ? autoReferenceMonths : workingMonths
  if (!skeleton.length) return []
  return attachLineItemsToMonths(cloneBillingMonthGraph(skeleton), "billing")
}

/**
 * Append-only: merges template from auto ref + containers into working. New months/keys/line ids only;
 * existing line ids unchanged (preserved-state model).
 */
function appendAutoReferenceIntoWorkingBilling(
  workingMonths: BillingMonth[],
  autoReferenceMonths: BillingMonth[],
  formatter: Intl.NumberFormat,
  attachLineItemsToMonths: (months: BillingMonth[], mode: "billing" | "delivery") => BillingMonth[],
  opts?: { resyncExistingFromTemplate?: boolean }
): BillingMonth[] {
  billingAppendDebug("appendAutoReferenceIntoWorkingBilling", {
    autoRefMonths: autoReferenceMonths.length,
    workingMonths: workingMonths.length,
    skeleton: autoReferenceMonths.length > 0 ? "autoReference" : "working",
    resyncExistingFromTemplate: Boolean(opts?.resyncExistingFromTemplate),
  })
  const templateWithLineItems = buildWorkingBillingAppendTemplate(
    autoReferenceMonths,
    workingMonths,
    attachLineItemsToMonths
  )
  return appendAutoLineItemTemplateIntoWorking(workingMonths, templateWithLineItems, formatter, opts)
}

/** Unwrap string / `{ months: [...] }` / top-level array from media_plan_versions or API. */
function normalizeBillingScheduleToArray(raw: unknown): any[] | null {
  if (raw == null || raw === "") return null
  let v: any = raw
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return null
    try {
      v = JSON.parse(t)
    } catch {
      return null
    }
  }
  if (Array.isArray(v)) return v.length > 0 ? v : null
  if (v && typeof v === "object" && Array.isArray((v as any).months)) {
    const m = (v as any).months
    return m.length > 0 ? m : null
  }
  return null
}

const parseMoneySaved = (val: unknown) =>
  parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0

/**
 * Parse persisted billingSchedule JSON from `media_plan_versions` into `BillingMonth[]` for hydrate → working/saved.
 * (Fees only affect search/social fee estimate when saved feeTotal absent.)
 */
function parseSavedBillingSchedulePayload(
  billingSchedule: unknown,
  fees: { searchFee: number; socialFee: number }
): {
  months: BillingMonth[]
  billingTotalFormatted: string
  partial:
    | {
        hydrate: ReturnType<typeof hydratePartialMbaFromSavedMetadata>
        metadata: PartialApprovalMetadata
      }
    | null
} | null {
  const parsed = normalizeBillingScheduleToArray(billingSchedule)
  if (!parsed) return null

  const { searchFee, socialFee } = fees
  const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
  const mediaTypeLabelMap: Record<string, string> = {
    Search: "search",
    "Social Media": "socialMedia",
    Television: "television",
    Radio: "radio",
    Newspaper: "newspaper",
    Magazines: "magazines",
    OOH: "ooh",
    Cinema: "cinema",
    "Digital Display": "digiDisplay",
    "Digital Audio": "digiAudio",
    "Digital Video": "digiVideo",
    BVOD: "bvod",
    Integration: "integration",
    "Programmatic Display": "progDisplay",
    "Programmatic Video": "progVideo",
    "Programmatic BVOD": "progBvod",
    "Programmatic Audio": "progAudio",
    "Programmatic OOH": "progOoh",
    Influencers: "influencers",
  }

  const parsedBillingMonthRows: BillingMonth[] = parsed.map((entry: any) => {
    const monthYear =
      entry.monthYear || entry.month_year || entry.month || entry.month_label || ""
    const mediaCosts: BillingMonth["mediaCosts"] = {
      search: "$0.00",
      socialMedia: "$0.00",
      television: "$0.00",
      radio: "$0.00",
      newspaper: "$0.00",
      magazines: "$0.00",
      ooh: "$0.00",
      cinema: "$0.00",
      digiDisplay: "$0.00",
      digiAudio: "$0.00",
      digiVideo: "$0.00",
      bvod: "$0.00",
      integration: "$0.00",
      progDisplay: "$0.00",
      progVideo: "$0.00",
      progBvod: "$0.00",
      progAudio: "$0.00",
      progOoh: "$0.00",
      influencers: "$0.00",
      production: "$0.00",
    }

    let totalMedia = 0
    let totalFee = 0
    const lineItems: Record<string, BillingLineItemType[]> = {}

    const mediaTypesRaw = entry.mediaTypes ?? entry.media_types
    if (mediaTypesRaw && Array.isArray(mediaTypesRaw)) {
      mediaTypesRaw.forEach((mediaType: any) => {
        const label =
          mediaType.mediaType ||
          mediaType.media_type ||
          mediaType.type ||
          mediaType.name ||
          ""
        const mediaKey = mediaTypeLabelMap[label] || String(label).toLowerCase()

        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          const mediaTotal = mediaType.lineItems.reduce((sum: number, item: any) => {
            const amountStr = item.amount || item.__amountValue || "0"
            const amount =
              typeof amountStr === "string"
                ? parseFloat(amountStr.replace(/[^0-9.]/g, ""))
                : amountStr
            return sum + (amount || 0)
          }, 0)

          mediaCosts[mediaKey] = currencyFormatter.format(mediaTotal)
          totalMedia += mediaTotal

          let feePercentage = 0
          if (mediaKey === "search") feePercentage = searchFee
          else if (mediaKey === "socialMedia") feePercentage = socialFee
          const feeAmount = (mediaTotal * feePercentage) / 100
          totalFee += feeAmount

          lineItems[mediaKey] = mediaType.lineItems.map((item: any) => {
            const amount =
              parseFloat((item.amount || item.__amountValue || "0").toString().replace(/[^0-9.]/g, "")) || 0
            const monthlyAmounts: Record<string, number> = {}
            parsed.forEach((e: any) => {
              const m = e.monthYear || e.month || ""
              monthlyAmounts[m] = m === monthYear ? amount : 0
            })

            const rawLiId = item.lineItemId ?? item.line_item_id
            return {
              id:
                rawLiId != null && String(rawLiId).trim() !== ""
                  ? String(rawLiId)
                  : `${mediaKey}-${item.header1}-${item.header2}`,
              header1: item.header1 || "",
              header2: item.header2 || "",
              monthlyAmounts,
              totalAmount: amount,
            }
          })
        }
      })
    }

    let finalFeeTotal = totalFee
    if (entry.feeTotal) {
      const savedFeeTotal = parseFloat(entry.feeTotal.toString().replace(/[^0-9.]/g, "")) || 0
      if (savedFeeTotal > 0) {
        finalFeeTotal = savedFeeTotal
      }
    }

    const adservingTechFees =
      parseFloat((entry.adservingTechFees || entry.adServing || "0").toString().replace(/[^0-9.]/g, "")) || 0
    const production = parseFloat((entry.production || "0").toString().replace(/[^0-9.]/g, "")) || 0
    let totalAmountNum = totalMedia + finalFeeTotal + adservingTechFees + production

    // Legacy / MBA PDF shape: month row with totalAmount only (no mediaTypes)
    if (
      Object.keys(lineItems).length === 0 &&
      (!entry.mediaTypes || !Array.isArray(entry.mediaTypes) || entry.mediaTypes.length === 0)
    ) {
      const legacyTotal = parseMoneySaved(entry.totalAmount ?? entry.amount)
      const feeLegacy = parseMoneySaved(entry.feeTotal)
      const adservLegacy = parseMoneySaved(entry.adservingTechFees ?? entry.adServing)
      const prodLegacy = parseMoneySaved(entry.production)
      if (
        monthYear &&
        (legacyTotal > 0 || feeLegacy > 0 || adservLegacy > 0 || prodLegacy > 0)
      ) {
        const inferredMedia =
          legacyTotal > 0
            ? Math.max(0, legacyTotal - feeLegacy - adservLegacy - prodLegacy)
            : totalMedia
        const useMedia = inferredMedia > 0 ? inferredMedia : totalMedia
        const useFee = feeLegacy > 0 ? feeLegacy : finalFeeTotal
        const useAd = adservLegacy > 0 ? adservLegacy : adservingTechFees
        const useProd = prodLegacy > 0 ? prodLegacy : production
        totalAmountNum =
          legacyTotal > 0 ? legacyTotal : useMedia + useFee + useAd + useProd
        return {
          monthYear,
          mediaTotal: currencyFormatter.format(useMedia),
          feeTotal: currencyFormatter.format(useFee),
          totalAmount: currencyFormatter.format(totalAmountNum),
          adservingTechFees: currencyFormatter.format(useAd),
          production: currencyFormatter.format(useProd),
          mediaCosts,
          lineItems: undefined,
        }
      }
    }

    return {
      monthYear,
      mediaTotal: currencyFormatter.format(totalMedia),
      feeTotal: currencyFormatter.format(finalFeeTotal),
      totalAmount: currencyFormatter.format(totalAmountNum),
      adservingTechFees: currencyFormatter.format(adservingTechFees),
      production: currencyFormatter.format(production),
      mediaCosts,
      lineItems: Object.keys(lineItems).length > 0 ? lineItems : undefined,
    }
  })

  // Consolidate monthlyAmounts across all months for each line item
  const allMonthKeys = parsedBillingMonthRows.map((m) => m.monthYear)
  parsedBillingMonthRows.forEach((month) => {
    if (!month.lineItems) return
    Object.entries(month.lineItems).forEach(([mediaKey, items]) => {
      (items as BillingLineItemType[]).forEach((item) => {
        // Ensure all month keys exist
        allMonthKeys.forEach((mk) => {
          if (!(mk in item.monthlyAmounts)) {
            item.monthlyAmounts[mk] = 0
          }
        })
        // Find this item's amount in other months and merge
        parsedBillingMonthRows.forEach((otherMonth) => {
          if (otherMonth.monthYear === month.monthYear) return
          const otherItems = (otherMonth.lineItems as Record<string, BillingLineItemType[]> | undefined)?.[
            mediaKey
          ]
          const match = otherItems?.find((oi) => oi.id === item.id)
          if (match && match.monthlyAmounts[otherMonth.monthYear]) {
            item.monthlyAmounts[otherMonth.monthYear] = match.monthlyAmounts[otherMonth.monthYear]
          }
        })
        item.totalAmount = Object.values(item.monthlyAmounts).reduce((sum, v) => sum + v, 0)
      })
    })
  })

  const total = parsedBillingMonthRows.reduce((sum, m) => {
    return sum + parseFloat(m.totalAmount.replace(/[^0-9.]/g, ""))
  }, 0)
  const billingTotalFormatted = currencyFormatter.format(total)

  const partialEntry = parsed.find((e: any) => e?.partialApproval ?? e?.partial_approval)
  const savedPartial = (partialEntry?.partialApproval ?? partialEntry?.partial_approval) as
    | PartialApprovalMetadata
    | undefined
  const partial =
    savedPartial?.isPartial === true
      ? { hydrate: hydratePartialMbaFromSavedMetadata(savedPartial), metadata: savedPartial }
      : null

  return { months: parsedBillingMonthRows, billingTotalFormatted, partial }
}

/** Grand total line for the billing table from month `totalAmount` strings (aligned with auto-calculate). */
function formatGrandTotalFromBillingMonths(months: BillingMonth[], formatter: Intl.NumberFormat): string {
  const grandTotal = months.reduce(
    (sum, m) => sum + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  return formatter.format(grandTotal)
}

// Define media type keys as a const array
const MEDIA_TYPE_KEYS = [
  'mp_production',
  'mp_television',
  'mp_radio',
  'mp_newspaper',
  'mp_magazines',
  'mp_ooh',
  'mp_cinema',
  'mp_digidisplay',
  'mp_digiaudio',
  'mp_digivideo',
  'mp_bvod',
  'mp_integration',
  'mp_search',
  'mp_socialmedia',
  'mp_progdisplay',
  'mp_progvideo',
  'mp_progbvod',
  'mp_progaudio',
  'mp_progooh',
  'mp_influencers'
] as const;

type MediaTypeKey = typeof MEDIA_TYPE_KEYS[number];

// Create a type for the media fields
type MediaFields = {
  [K in MediaTypeKey]: boolean;
};

// Create a type for the form field names
type FormFieldName = keyof MediaPlanFormValues;

type PageField = {
  id: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "boolean";
  value: any;
  editable: boolean;
  options?: { label: string; value: string }[];
  validation?: { required?: boolean; min?: number; max?: number; pattern?: string };
  semanticType?: string;
  group?: string;
  source?: "xano" | "computed" | "ui";
};

type PageContext = {
  route: { pathname: string; clientSlug?: string; mbaSlug?: string };
  fields: PageField[];
  generatedAt: string;
  entities?: { clientSlug?: string; clientName?: string; mbaNumber?: string; campaignName?: string; mediaTypes?: string[] };
  pageText?: { title?: string; headings?: string[]; breadcrumbs?: string[] };
};

const mediaPlanSchema = z.object({
  mp_clientname: z.string().min(1, "Client name is required"),
  mp_campaignstatus: z.string().min(1, "Campaign status is required"),
  mp_campaignname: z.string().min(1, "Campaign name is required"),
  mp_campaigndates_start: z.date(),
  mp_campaigndates_end: z.date(),
  mp_brand: z.string(),
  mp_clientcontact: z.string().min(1, "Client contact is required"),
  mp_ponumber: z.string(),
  mp_campaignbudget: z.number(),
  mbaidentifier: z.string(),
  mbanumber: z.string(),
  mp_plannumber: z.string(),
  // Media types
  ...Object.fromEntries(
    MEDIA_TYPE_KEYS.map(key => [key, z.boolean()])
  ) as { [K in MediaTypeKey]: z.ZodBoolean },
  lineItems: z.array(
    z.object({
      bursts: z.array(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          budget: z.string(),
        })
      ),
    })
  ),
})

type MediaPlanFormValues = z.infer<typeof mediaPlanSchema>

interface Client {
  id: number
  clientname_input: string
  mp_client_name?: string
  mbaidentifier: string
  feetelevision?: number
  feeradio?: number
  feenewspapers?: number
  feemagazines?: number
  feeooh?: number
  feecinema?: number
  feedigidisplay?: number
  feedigiaudio?: number
  feedigivideo?: number
  feebvod?: number
  feeintegration?: number
  feeinfluencers?: number
  feesearch: number
  feesocial: number
  feeprogdisplay: number
  feeprogvideo: number
  feeprogbvod: number
  feeprogaudio: number
  feeprogooh: number
  feecontentcreator: number
  adservvideo: number
  adservimp: number
  adservdisplay: number
  adservaudio: number
  streetaddress?: string
  suburb?: string
  state_dropdown?: string
  postcode?: string | number
}

function MediaContainerSuspenseFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-8">
      <div className="relative h-5 w-5 shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-t-primary" />
      </div>
      <span className="text-sm text-muted-foreground">Loading {label}…</span>
    </div>
  )
}

// Lazy-loaded components for each media type
const TelevisionContainer = lazy(() => import("@/components/media-containers/TelevisionContainer"))
const RadioContainer = lazy(() => import("@/components/media-containers/RadioContainer"))
const NewspaperContainer = lazy(() => import("@/components/media-containers/NewspaperContainer"))
const MagazinesContainer = lazy(() => import("@/components/media-containers/MagazinesContainer"))
const OOHContainer = lazy(() => import("@/components/media-containers/OOHContainer"))
const CinemaContainer = lazy(() => import("@/components/media-containers/CinemaContainer"))
const DigitalDisplayContainer = lazy(() => import("@/components/media-containers/DigitalDisplayContainer"))
const DigitalAudioContainer = lazy(() => import("@/components/media-containers/DigitalAudioContainer"))
const DigitalVideoContainer = lazy(() => import("@/components/media-containers/DigitalVideoContainer"))
const BVODContainer = lazy(() => import("@/components/media-containers/BVODContainer"))
const IntegrationContainer = lazy(() => import("@/components/media-containers/IntegrationContainer"))
const SearchContainer = lazy(() => import("@/components/media-containers/SearchContainer"))
const SocialMediaContainer = lazy(() => import("@/components/media-containers/SocialMediaContainer"))
const ProgDisplayContainer = lazy(() => import("@/components/media-containers/ProgDisplayContainer"))
const ProgVideoContainer = lazy(() => import("@/components/media-containers/ProgVideoContainer"))
const ProgBVODContainer = lazy(() => import("@/components/media-containers/ProgBVODContainer"))
const ProgAudioContainer = lazy(() => import("@/components/media-containers/ProgAudioContainer"))
const ProgOOHContainer = lazy(() => import("@/components/media-containers/ProgOOHContainer"))
const InfluencersContainer = lazy(() => import("@/components/media-containers/InfluencersContainer"))
const ProductionContainer = lazy(() => import("@/components/media-containers/ProductionContainer"))

// Update mediaTypes array to use the strict type
const mediaTypes: Array<{
  name: MediaTypeKey;
  label: string;
  component: React.LazyExoticComponent<any>;
}> = [
  { name: 'mp_television', label: "Television", component: TelevisionContainer },
  { name: 'mp_radio', label: "Radio", component: RadioContainer },
  { name: 'mp_newspaper', label: "Newspaper", component: NewspaperContainer },
  { name: 'mp_magazines', label: "Magazines", component: MagazinesContainer },
  { name: 'mp_ooh', label: "OOH", component: OOHContainer },
  { name: 'mp_cinema', label: "Cinema", component: CinemaContainer },
  { name: 'mp_digidisplay', label: "Digital Display", component: DigitalDisplayContainer },
  { name: 'mp_digiaudio', label: "Digital Audio", component: DigitalAudioContainer },
  { name: 'mp_digivideo', label: "Digital Video", component: DigitalVideoContainer },
  { name: 'mp_bvod', label: "BVOD", component: BVODContainer },
  { name: 'mp_integration', label: "Integration", component: IntegrationContainer },
  { name: 'mp_search', label: "Search", component: SearchContainer },
  { name: 'mp_socialmedia', label: "Social Media", component: SocialMediaContainer },
  { name: 'mp_progdisplay', label: "Programmatic Display", component: ProgDisplayContainer },
  { name: 'mp_progvideo', label: "Programmatic Video", component: ProgVideoContainer },
  { name: 'mp_progbvod', label: "Programmatic BVOD", component: ProgBVODContainer },
  { name: 'mp_progaudio', label: "Programmatic Audio", component: ProgAudioContainer },
  { name: 'mp_progooh', label: "Programmatic OOH", component: ProgOOHContainer },
  { name: 'mp_influencers', label: "Influencers", component: InfluencersContainer },
  { name: 'mp_production', label: "Production", component: ProductionContainer },
];

// Media key map for billing schedule
const mediaKeyMap: { [key: string]: string } = {
  mp_search: 'search',
  mp_socialmedia: 'socialMedia',
  mp_digiaudio: 'digiAudio',
  mp_digidisplay: 'digiDisplay',
  mp_digivideo: 'digiVideo',
  mp_bvod: 'bvod',
  mp_progdisplay: 'progDisplay',
  mp_progvideo: 'progVideo',
  mp_progbvod: 'progBvod',
  mp_progaudio: 'progAudio',
  mp_progooh: 'progOoh',
  mp_cinema: 'cinema',
  mp_television: 'television',
  mp_radio: 'radio',
  mp_newspaper: 'newspaper',
  mp_magazines: 'magazines',
  mp_ooh: 'ooh',
  mp_integration: 'integration',
  mp_influencers: 'influencers',
  mp_production: 'production',
};

export default function EditMediaPlan({ params }: { params: Promise<{ mba_number: string }> }) {
  // Use React's use() hook to unwrap the params Promise
  // This ensures we get the latest value on every render/navigation
  const { mba_number: mbaNumber } = use(params)
  
  console.log("Current MBA number from params:", mbaNumber)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const versionNumber = searchParams ? searchParams.get('version') : null
  
  console.log("Version number from query params:", versionNumber)

  const { setMbaNumber: setContextMbaNumber } = useMediaPlanContext()

  // Sticky banner sizing (ensure scroll space is 2x banner height)
  const stickyBarRef = useRef<HTMLDivElement | null>(null)
  const [stickyBarHeight, setStickyBarHeight] = useState(0)

  useEffect(() => {
    const el = stickyBarRef.current
    if (!el) return

    const update = () => {
      const next = el.getBoundingClientRect().height || 0
      setStickyBarHeight(next)
    }

    update()

    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])
  
  const [clients, setClients] = useState<Client[]>([])
  const [availableVersions, setAvailableVersions] = useState<Array<{ id?: number; version_number: number; created_at?: number | string | null }>>([])
  const [latestVersionNumber, setLatestVersionNumber] = useState<number>(1)
  const [nextSaveVersionNumber, setNextSaveVersionNumber] = useState<number | null>(null)
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null)
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false)
  const [rollbackTargetVersion, setRollbackTargetVersion] = useState<number | null>(null)
  const [rollbackTargetCreatedAt, setRollbackTargetCreatedAt] = useState<number | string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDownloadingAa, setIsDownloadingAa] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientAddress, setClientAddress] = useState("")
  const [clientSuburb, setClientSuburb] = useState("")
  const [clientState, setClientState] = useState("")
  const [clientPostcode, setClientPostcode] = useState("")
  const [feesearch, setFeeSearch] = useState<number | null>(null)
  const [feesocial, setFeeSocial] = useState<number | null>(null)
  /** Latest fee values for async fetch handler (avoids stale closure without re-fetching the plan). */
  const feeSearchRef = useRef<number | null>(null)
  const feeSocialRef = useRef<number | null>(null)
  feeSearchRef.current = feesearch
  feeSocialRef.current = feesocial
  const [feeTelevision, setFeeTelevision] = useState<number | null>(null)
  const [feeRadio, setFeeRadio] = useState<number | null>(null)
  const [feeNewspapers, setFeeNewspapers] = useState<number | null>(null)
  const [feeMagazines, setFeeMagazines] = useState<number | null>(null)
  const [feeOoh, setFeeOoh] = useState<number | null>(null)
  const [feeCinema, setFeeCinema] = useState<number | null>(null)
  const [feeDigiDisplay, setFeeDigiDisplay] = useState<number | null>(null)
  const [feeDigiAudio, setFeeDigiAudio] = useState<number | null>(null)
  const [feeDigiVideo, setFeeDigiVideo] = useState<number | null>(null)
  const [feeBvod, setFeeBvod] = useState<number | null>(null)
  const [feeIntegration, setFeeIntegration] = useState<number | null>(null)
  const [feeConsulting, setFeeConsulting] = useState<number | null>(null)
  const [feeInfluencers, setFeeInfluencers] = useState<number | null>(null)
  const [feeprogdisplay, setFeeProgDisplay] = useState<number | null>(null)
  const [feeprogvideo, setFeeProgVideo] = useState<number | null>(null)
  const [feeprogbvod, setFeeProgBvod] = useState<number | null>(null)
  const [feeprogaudio, setFeeProgAudio] = useState<number | null>(null)
  const [feeprogooh, setFeeProgOoh] = useState<number | null>(null)
  const [feecontentcreator, setFeeContentCreator] = useState<number | null>(null)
  const [adservvideo, setAdServVideo] = useState<number | null>(null)
  const [adservimp, setAdServImp] = useState<number | null>(null)
  const [adservdisplay, setAdServDisplay] = useState<number | null>(null)
  const [adservaudio, setAdServAudio] = useState<number | null>(null)

  const applyClientFees = useCallback((clientData: any) => {
    if (!clientData) return

    const setIfDefined = <T,>(
      value: T | undefined,
      setter: (next: T | null) => void
    ) => {
      if (value !== undefined) {
        setter((value as any) ?? null)
      }
    }

    // Fees
    setIfDefined(clientData.feetelevision, setFeeTelevision)
    setIfDefined(clientData.feeradio, setFeeRadio)
    setIfDefined(clientData.feenewspapers, setFeeNewspapers)
    setIfDefined(clientData.feemagazines, setFeeMagazines)
    setIfDefined(clientData.feeooh, setFeeOoh)
    setIfDefined(clientData.feecinema, setFeeCinema)
    setIfDefined(clientData.feedigidisplay, setFeeDigiDisplay)
    setIfDefined(clientData.feedigiaudio, setFeeDigiAudio)
    setIfDefined(clientData.feedigivideo, setFeeDigiVideo)
    setIfDefined(clientData.feebvod, setFeeBvod)
    setIfDefined(clientData.feeintegration, setFeeIntegration)
    setIfDefined(clientData.feesearch, setFeeSearch)
    setIfDefined(clientData.feesocial, setFeeSocial)
    setIfDefined(clientData.feeprogdisplay, setFeeProgDisplay)
    setIfDefined(clientData.feeprogvideo, setFeeProgVideo)
    setIfDefined(clientData.feeprogbvod, setFeeProgBvod)
    setIfDefined(clientData.feeprogaudio, setFeeProgAudio)
    setIfDefined(clientData.feeprogooh, setFeeProgOoh)

    // Some client data uses feecontentcreator for production/consulting
    setIfDefined(clientData.feecontentcreator, setFeeConsulting)
    setIfDefined(clientData.feecontentcreator, setFeeContentCreator)

    // Influencers fee: prefer feeinfluencers, fallback to feecontentcreator
    if (clientData.feeinfluencers !== undefined) {
      setFeeInfluencers(clientData.feeinfluencers ?? null)
    } else if (clientData.feecontentcreator !== undefined) {
      setFeeInfluencers(clientData.feecontentcreator ?? null)
    }

    // Ad serving
    setIfDefined(clientData.adservvideo, setAdServVideo)
    setIfDefined(clientData.adservimp, setAdServImp)
    setIfDefined(clientData.adservdisplay, setAdServDisplay)
    setIfDefined(clientData.adservaudio, setAdServAudio)
  }, [])

  const refreshClientFeesFromApi = useCallback(async () => {
    const normalize = (name: string | undefined | null): string =>
      (name ?? "").trim().toLowerCase()

    const resolveClientId = (): string | null => {
      const directId = (selectedClient as any)?.id
      if (directId !== undefined && directId !== null && String(directId).length > 0) {
        return String(directId)
      }

      if (selectedClientId && /^\d+$/.test(selectedClientId)) {
        return selectedClientId
      }

      if (!selectedClientId) return null

      const normalizedSelected = normalize(selectedClientId)
      const found =
        clients.find((c: any) => String(c?.id ?? "") === String(selectedClientId)) ||
        clients.find((c: any) => c?.clientname_input === selectedClientId) ||
        clients.find((c: any) => c?.mp_client_name === selectedClientId) ||
        clients.find((c: any) => normalize(c?.clientname_input) === normalizedSelected) ||
        clients.find((c: any) => normalize(c?.mp_client_name) === normalizedSelected)

      if (!found?.id) return null
      return String(found.id)
    }

    const id = resolveClientId()
    if (!id) return null

    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { cache: "no-store" })
      if (!res.ok) {
        throw new Error(`Failed to fetch client ${id}: ${res.status}`)
      }
      const freshClient = await res.json()
      setSelectedClient(freshClient)
      applyClientFees(freshClient)
      return freshClient
    } catch (error) {
      console.error("[CLIENT FEES] Failed to refresh client fees:", error)
      return null
    }
  }, [applyClientFees, clients, selectedClient, selectedClientId])
  const [searchTotal, setSearchTotal] = useState(0)
  const [socialmediaTotal, setSocialMediaTotal] = useState<number>(0)
  // Total state variables for all media types (matching create page pattern)
  const [televisionTotal, setTelevisionTotal] = useState(0)
  const [radioTotal, setRadioTotal] = useState(0)
  const [newspaperTotal, setNewspaperTotal] = useState(0)
  const [magazinesTotal, setMagazinesTotal] = useState(0)
  const [oohTotal, setOohTotal] = useState(0)
  const [cinemaTotal, setCinemaTotal] = useState(0)
  const [digitalDisplayTotal, setDigitalDisplayTotal] = useState(0)
  const [digitalAudioTotal, setDigitalAudioTotal] = useState(0)
  const [digitalVideoTotal, setDigitalVideoTotal] = useState(0)
  const [bvodTotal, setBvodTotal] = useState(0)
  const [integrationTotal, setIntegrationTotal] = useState(0)
  const [consultingTotal, setConsultingTotal] = useState(0)
  const [progDisplayTotal, setProgDisplayTotal] = useState(0)
  const [progVideoTotal, setProgVideoTotal] = useState(0)
  const [progBvodTotal, setProgBvodTotal] = useState(0)
  const [progAudioTotal, setProgAudioTotal] = useState(0)
  const [progOohTotal, setProgOohTotal] = useState(0)
  const [influencersTotal, setInfluencersTotal] = useState(0)

  const grossMediaTotal = useMemo(
    () =>
      (searchTotal ?? 0) +
      (socialmediaTotal ?? 0) +
      (televisionTotal ?? 0) +
      (radioTotal ?? 0) +
      (newspaperTotal ?? 0) +
      (magazinesTotal ?? 0) +
      (oohTotal ?? 0) +
      (cinemaTotal ?? 0) +
      (digitalDisplayTotal ?? 0) +
      (digitalAudioTotal ?? 0) +
      (digitalVideoTotal ?? 0) +
      (bvodTotal ?? 0) +
      (integrationTotal ?? 0) +
      (consultingTotal ?? 0) +
      (progDisplayTotal ?? 0) +
      (progVideoTotal ?? 0) +
      (progBvodTotal ?? 0) +
      (progAudioTotal ?? 0) +
      (progOohTotal ?? 0) +
      (influencersTotal ?? 0),
    [
      searchTotal,
      socialmediaTotal,
      televisionTotal,
      radioTotal,
      newspaperTotal,
      magazinesTotal,
      oohTotal,
      cinemaTotal,
      digitalDisplayTotal,
      digitalAudioTotal,
      digitalVideoTotal,
      bvodTotal,
      integrationTotal,
      consultingTotal,
      progDisplayTotal,
      progVideoTotal,
      progBvodTotal,
      progAudioTotal,
      progOohTotal,
      influencersTotal,
    ],
  )

  /**
   * Billing preserved-state model:
   * - savedBillingMonths — last persisted baseline (media_plan_versions hydrate or last successful save).
   * - workingBillingMonths — live UI schedule; preserved; append-only on the main page (new months, media keys, line ids).
   * - autoReferenceBillingMonths — burst-derived reference; append template for new structure; Edit Billing resets; never wholesale-overwrites existing working rows without explicit reset.
   * - Existing line rows stay fixed until edited in Edit Billing, per-line reset there, or full reset there (container/burst edits alone do not refresh them — except in “follow auto” mode after a confirmed footer “Reset billing to auto”, until save or manual apply).
   * - manualBillingMonths — Edit Billing modal draft only.
   */
  const [savedBillingMonths, setSavedBillingMonths] = useState<BillingMonth[]>([])
  const savedBillingMonthsRef = useRef<BillingMonth[]>([])
  useEffect(() => {
    savedBillingMonthsRef.current = savedBillingMonths
  }, [savedBillingMonths])
  const [workingBillingMonths, setWorkingBillingMonths] = useState<BillingMonth[]>([])
  const [manualBillingMonths, setManualBillingMonths] = useState<BillingMonth[]>([])
  const [autoReferenceBillingMonths, setAutoReferenceBillingMonths] = useState<BillingMonth[]>([])
  const [burstsData, setBurstsData] = useState<any[]>([])
  const [investmentPerMonth, setInvestmentPerMonth] = useState<any[]>([])
  const [searchBursts, setSearchBursts] = useState<any[]>([])
  const [socialMediaBursts, setSocialMediaBursts] = useState<any[]>([])
  // Burst state variables for all media types (matching create page pattern)
  const [televisionBursts, setTelevisionBursts] = useState<any[]>([])
  const [radioBursts, setRadioBursts] = useState<any[]>([])
  const [newspaperBursts, setNewspaperBursts] = useState<any[]>([])
  const [magazinesBursts, setMagazinesBursts] = useState<any[]>([])
  const [oohBursts, setOohBursts] = useState<any[]>([])
  const [cinemaBursts, setCinemaBursts] = useState<any[]>([])
  const [digitalDisplayBursts, setDigitalDisplayBursts] = useState<any[]>([])
  const [digitalAudioBursts, setDigitalAudioBursts] = useState<any[]>([])
  const [digitalVideoBursts, setDigitalVideoBursts] = useState<any[]>([])
  const [bvodBursts, setBvodBursts] = useState<any[]>([])
  const [integrationBursts, setIntegrationBursts] = useState<any[]>([])
  const [consultingBursts, setConsultingBursts] = useState<any[]>([])
  const [progDisplayBursts, setProgDisplayBursts] = useState<any[]>([])
  const [progVideoBursts, setProgVideoBursts] = useState<any[]>([])
  const [progBvodBursts, setProgBvodBursts] = useState<any[]>([])
  const [progAudioBursts, setProgAudioBursts] = useState<any[]>([])
  const [progOohBursts, setProgOohBursts] = useState<any[]>([])
  const [influencersBursts, setInfluencersBursts] = useState<any[]>([])
  const [isManualBilling, setIsManualBilling] = useState(false)
  /** Synchronous read inside `calculateBillingSchedule` / billing append timeouts (state can lag one frame). */
  const isManualBillingRef = useRef(false)
  isManualBillingRef.current = isManualBilling
  /**
   * After Edit Billing “Reset all billing to auto” (confirmed), line items and fee buckets track burst-derived
   * auto until the next version save or until manual billing is applied from the modal.
   */
  const billingLineItemsFollowAutoRef = useRef(false)
  const [isManualBillingModalOpen, setIsManualBillingModalOpen] = useState(false)
  const [manualBillingCostPreBill, setManualBillingCostPreBill] = useState<{
    fee: boolean;
    adServing: boolean;
    production: boolean;
  }>({ fee: false, adServing: false, production: false })
  const manualBillingCostPreBillSnapshotRef = useRef<{
    fee?: string[];
    adServing?: string[];
    production?: string[];
  }>({})
  const autoReferenceBillingMonthsRef = useRef<BillingMonth[]>([])
  const [autoDeliveryMonths, setAutoDeliveryMonths] = useState<BillingMonth[]>([])
  const deliveryScheduleSnapshotRef = useRef<BillingMonth[] | null>(null)
  const [billingError, setBillingError] = useState<{
    show: boolean
    blockingErrors: string[]
    preservedOverrides: string[]
  }>({
    show: false,
    blockingErrors: [],
    preservedOverrides: [],
  })
  const [fullBillingResetConfirmOpen, setFullBillingResetConfirmOpen] = useState(false)
  const workingBillingMonthsRef = useRef<BillingMonth[]>([])
  /**
   * Assigned each render after `attachLineItemsToMonths` exists. Reset handlers use `.current` so they never
   * depend on a stale closure over the callback.
   */
  const attachLineItemsToMonthsRef = useRef<
    (months: BillingMonth[], mode: "billing" | "delivery") => BillingMonth[]
  >((months) => months)
  /**
   * Synchronous mirror of `hasPersistedBillingSchedule` so `calculateBillingSchedule` and other callbacks
   * respect persisted billing before the next paint (state alone can lag one tick behind fetch completion).
   */
  const hasPersistedBillingScheduleRef = useRef(false)
  /** True when a server-backed billing baseline exists (`savedBillingMonths` from version hydrate or after a successful save with months). */
  const [hasPersistedBillingSchedule, setHasPersistedBillingSchedule] = useState(false)

  useEffect(() => {
    hasPersistedBillingScheduleRef.current = hasPersistedBillingSchedule
  }, [hasPersistedBillingSchedule])

  const billingTotalDisplayFromWorking = useMemo(
    () =>
      formatGrandTotalFromBillingMonths(
        workingBillingMonths,
        new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: "AUD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      ),
    [workingBillingMonths]
  )

  const billingTotalDisplayFromManual = useMemo(
    () =>
      formatGrandTotalFromBillingMonths(
        manualBillingMonths,
        new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: "AUD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      ),
    [manualBillingMonths]
  )

  const [isPartialMBA, setIsPartialMBA] = useState(false)
  const [isPartialMBAModalOpen, setIsPartialMBAModalOpen] = useState(false)
  const [partialMBAError, setPartialMBAError] = useState<string | null>(null)
  const [partialMBAValues, setPartialMBAValues] = useState({
    mediaTotals: {} as Record<string, number>,
    grossMedia: 0,
    assembledFee: 0,
    adServing: 0,
    production: 0,
  })
  const [originalPartialMBAValues, setOriginalPartialMBAValues] = useState({
    mediaTotals: {} as Record<string, number>,
    grossMedia: 0,
    assembledFee: 0,
    adServing: 0,
    production: 0,
  })
  const [partialMBAMonthYears, setPartialMBAMonthYears] = useState<string[]>([])
  const [partialMBAMediaEnabled, setPartialMBAMediaEnabled] = useState<Record<string, boolean>>({})
  const [partialMBALineItemsByMedia, setPartialMBALineItemsByMedia] = useState<Record<string, PartialApprovalLineItem[]>>({})
  const [partialMBASelectedLineItemIds, setPartialMBASelectedLineItemIds] = useState<Record<string, string[]>>({})
  const [partialApprovalMetadata, setPartialApprovalMetadata] = useState<PartialApprovalMetadata | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatusItem[]>([])
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalOutcome, setModalOutcome] = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [searchFeeTotal, setSearchFeeTotal] = useState(0)
  const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0)
  // Fee total state variables for all media types (matching create page pattern)
  const [televisionFeeTotal, setTelevisionFeeTotal] = useState(0)
  const [radioFeeTotal, setRadioFeeTotal] = useState(0)
  const [newspaperFeeTotal, setNewspaperFeeTotal] = useState(0)
  const [magazinesFeeTotal, setMagazinesFeeTotal] = useState(0)
  const [oohFeeTotal, setOohFeeTotal] = useState(0)
  const [cinemaFeeTotal, setCinemaFeeTotal] = useState(0)
  const [digitalDisplayFeeTotal, setDigitalDisplayFeeTotal] = useState(0)
  const [digitalAudioFeeTotal, setDigitalAudioFeeTotal] = useState(0)
  const [digitalVideoFeeTotal, setDigitalVideoFeeTotal] = useState(0)
  const [bvodFeeTotal, setBvodFeeTotal] = useState(0)
  const [integrationFeeTotal, setIntegrationFeeTotal] = useState(0)
  const [consultingFeeTotal, setConsultingFeeTotal] = useState(0)
  const [progDisplayFeeTotal, setProgDisplayFeeTotal] = useState(0)
  const [progVideoFeeTotal, setProgVideoFeeTotal] = useState(0)
  const [progBvodFeeTotal, setProgBvodFeeTotal] = useState(0)
  const [progAudioFeeTotal, setProgAudioFeeTotal] = useState(0)
  const [progOohFeeTotal, setProgOohFeeTotal] = useState(0)
  const [influencersFeeTotal, setInfluencersFeeTotal] = useState(0)
  const [totalInvestment, setTotalInvestment] = useState(0)
  const mbaCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )
  const [error, setError] = useState<string | null>(null)
  const [mediaPlan, setMediaPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isNamingDownloading, setIsNamingDownloading] = useState(false)
  const [searchLineItems, setSearchLineItems] = useState<any[]>([])
  const [socialMediaLineItems, setSocialMediaLineItems] = useState<any[]>([])
  
  // State for all media type line items (for initialLineItems)
  const [televisionLineItems, setTelevisionLineItems] = useState<any[]>([])
  const [radioLineItems, setRadioLineItems] = useState<any[]>([])
  const [newspaperLineItems, setNewspaperLineItems] = useState<any[]>([])
  const [magazinesLineItems, setMagazinesLineItems] = useState<any[]>([])
  const [oohLineItems, setOohLineItems] = useState<any[]>([])
  const [cinemaLineItems, setCinemaLineItems] = useState<any[]>([])
  const [digitalDisplayLineItems, setDigitalDisplayLineItems] = useState<any[]>([])
  const [digitalAudioLineItems, setDigitalAudioLineItems] = useState<any[]>([])
  const [digitalVideoLineItems, setDigitalVideoLineItems] = useState<any[]>([])
  const [bvodLineItems, setBvodLineItems] = useState<any[]>([])
  const [integrationLineItems, setIntegrationLineItems] = useState<any[]>([])
  const [consultingLineItems, setConsultingLineItems] = useState<any[]>([])
  const [progDisplayLineItems, setProgDisplayLineItems] = useState<any[]>([])
  const [progVideoLineItems, setProgVideoLineItems] = useState<any[]>([])
  const [progBvodLineItems, setProgBvodLineItems] = useState<any[]>([])
  const [progAudioLineItems, setProgAudioLineItems] = useState<any[]>([])
  const [progOohLineItems, setProgOohLineItems] = useState<any[]>([])
  const [influencersLineItems, setInfluencersLineItems] = useState<any[]>([])

  // State for LineItem[] arrays (for Excel generation)
  const [searchItems, setSearchItems] = useState<LineItem[]>([])
  const [socialMediaItems, setSocialMediaItems] = useState<LineItem[]>([])
  const [televisionItems, setTelevisionItems] = useState<LineItem[]>([])
  const [radioItems, setRadioItems] = useState<LineItem[]>([])
  const [newspaperItems, setNewspaperItems] = useState<LineItem[]>([])
  const [magazinesItems, setMagazinesItems] = useState<LineItem[]>([])
  const [oohItems, setOohItems] = useState<LineItem[]>([])
  const [cinemaItems, setCinemaItems] = useState<LineItem[]>([])
  const [digitalDisplayItems, setDigitalDisplayItems] = useState<LineItem[]>([])
  const [digitalAudioItems, setDigitalAudioItems] = useState<LineItem[]>([])
  const [digitalVideoItems, setDigitalVideoItems] = useState<LineItem[]>([])
  const [bvodItems, setBvodItems] = useState<LineItem[]>([])
  const [integrationItems, setIntegrationItems] = useState<LineItem[]>([])
  const [influencersItems, setInfluencersItems] = useState<LineItem[]>([])
  const [consultingItems, setConsultingItems] = useState<LineItem[]>([])
  const [progDisplayItems, setProgDisplayItems] = useState<LineItem[]>([])
  const [progVideoItems, setProgVideoItems] = useState<LineItem[]>([])
  const [progBvodItems, setProgBvodItems] = useState<LineItem[]>([])
  const [progAudioItems, setProgAudioItems] = useState<LineItem[]>([])
  const [progOohItems, setProgOohItems] = useState<LineItem[]>([])
  
  // State for transformed line items (for onMediaLineItemsChange callbacks)
  const [televisionMediaLineItems, setTelevisionMediaLineItems] = useState<any[]>([])
  const [radioMediaLineItems, setRadioMediaLineItems] = useState<any[]>([])
  const [newspaperMediaLineItems, setNewspaperMediaLineItems] = useState<any[]>([])
  const [magazinesMediaLineItems, setMagazinesMediaLineItems] = useState<any[]>([])
  const [oohMediaLineItems, setOohMediaLineItems] = useState<any[]>([])
  const [cinemaMediaLineItems, setCinemaMediaLineItems] = useState<any[]>([])
  const [digitalDisplayMediaLineItems, setDigitalDisplayMediaLineItems] = useState<any[]>([])
  const [digitalAudioMediaLineItems, setDigitalAudioMediaLineItems] = useState<any[]>([])
  const [digitalVideoMediaLineItems, setDigitalVideoMediaLineItems] = useState<any[]>([])
  const [bvodMediaLineItems, setBvodMediaLineItems] = useState<any[]>([])
  const [integrationMediaLineItems, setIntegrationMediaLineItems] = useState<any[]>([])
  const [consultingMediaLineItems, setConsultingMediaLineItems] = useState<any[]>([])
  const [searchMediaLineItems, setSearchMediaLineItems] = useState<any[]>([])
  const [socialMediaMediaLineItems, setSocialMediaMediaLineItems] = useState<any[]>([])
  const [progDisplayMediaLineItems, setProgDisplayMediaLineItems] = useState<any[]>([])
  const [progVideoMediaLineItems, setProgVideoMediaLineItems] = useState<any[]>([])
  const [progBvodMediaLineItems, setProgBvodMediaLineItems] = useState<any[]>([])
  const [progAudioMediaLineItems, setProgAudioMediaLineItems] = useState<any[]>([])
  const [progOohMediaLineItems, setProgOohMediaLineItems] = useState<any[]>([])
  const [influencersMediaLineItems, setInfluencersMediaLineItems] = useState<any[]>([])

  const editLineItemCount = useMemo(() => {
    return (
      televisionLineItems.length +
      radioLineItems.length +
      newspaperLineItems.length +
      magazinesLineItems.length +
      oohLineItems.length +
      cinemaLineItems.length +
      digitalDisplayLineItems.length +
      digitalAudioLineItems.length +
      digitalVideoLineItems.length +
      bvodLineItems.length +
      integrationLineItems.length +
      consultingLineItems.length +
      searchLineItems.length +
      socialMediaLineItems.length +
      progDisplayLineItems.length +
      progVideoLineItems.length +
      progBvodLineItems.length +
      progAudioLineItems.length +
      progOohLineItems.length +
      influencersLineItems.length
    )
  }, [
    televisionLineItems,
    radioLineItems,
    newspaperLineItems,
    magazinesLineItems,
    oohLineItems,
    cinemaLineItems,
    digitalDisplayLineItems,
    digitalAudioLineItems,
    digitalVideoLineItems,
    bvodLineItems,
    integrationLineItems,
    consultingLineItems,
    searchLineItems,
    socialMediaLineItems,
    progDisplayLineItems,
    progVideoLineItems,
    progBvodLineItems,
    progAudioLineItems,
    progOohLineItems,
    influencersLineItems,
  ])

  const [billingPublishers, setBillingPublishers] = useState<Publisher[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/publishers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setBillingPublishers(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (!cancelled) setBillingPublishers([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** True when any included line item maps to a publisher billing via Advertising Associates (same inputs as save-time AA upload check). */
  const hasAdvertisingAssociatesBilling = useMemo(() => {
    const mediaItems: MediaItems = {
      search: searchItems,
      socialMedia: socialMediaItems,
      digiAudio: digitalAudioItems,
      digiDisplay: digitalDisplayItems,
      digiVideo: digitalVideoItems,
      bvod: bvodItems,
      progDisplay: progDisplayItems,
      progVideo: progVideoItems,
      progBvod: progBvodItems,
      progOoh: progOohItems,
      progAudio: progAudioItems,
      newspaper: newspaperItems,
      magazines: magazinesItems,
      television: televisionItems,
      radio: radioItems,
      ooh: oohItems,
      cinema: cinemaItems,
      integration: integrationItems,
      influencers: influencersItems,
      production: consultingItems,
    }
    return planHasAdvertisingAssociatesLineItem(
      mediaItems,
      billingPublishers,
      shouldIncludeMediaPlanLineItem,
    )
  }, [
    searchItems,
    socialMediaItems,
    digitalAudioItems,
    digitalDisplayItems,
    digitalVideoItems,
    bvodItems,
    progDisplayItems,
    progVideoItems,
    progBvodItems,
    progOohItems,
    progAudioItems,
    newspaperItems,
    magazinesItems,
    televisionItems,
    radioItems,
    oohItems,
    cinemaItems,
    integrationItems,
    influencersItems,
    consultingItems,
    billingPublishers,
  ])

  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const navigationHydratedRef = useRef(false)

  const form = useForm<MediaPlanFormValues>({
    resolver: zodResolver(mediaPlanSchema),
    defaultValues: {
      mp_clientname: "",
      mp_campaignstatus: "",
      mp_campaignname: "",
      mp_campaigndates_start: new Date(),
      mp_campaigndates_end: new Date(),
      mp_brand: "",
      mp_clientcontact: "",
      mp_ponumber: "",
      mp_campaignbudget: 0,
      mbaidentifier: "",
      mbanumber: "",
      mp_plannumber: "",
      ...Object.fromEntries(
        MEDIA_TYPE_KEYS.map(key => [key, false])
      ) as MediaFields,
      lineItems: [],
    },
  })

  const markUnsavedChanges = useCallback(() => {
    if (!navigationHydratedRef.current) return
    setHasUnsavedChanges(true)
  }, [])

  const shouldBlockNavigation = hasUnsavedChanges && !isSaving && !isLoading
  const { isOpen: isUnsavedPromptOpen, confirmNavigation, stayOnPage } = useUnsavedChangesPrompt(shouldBlockNavigation)
  const hasSaveErrors = saveStatus.some(item => item.status === 'error')
  const shouldShowSaveModal = isSaveModalOpen && (isSaving || hasSaveErrors || saveStatus.length > 0)

  useEffect(() => {
    if (!isSaving && isSaveModalOpen && saveStatus.length > 0 && !hasSaveErrors) {
      setIsSaveModalOpen(false)
      setSaveStatus([])
    }
  }, [hasSaveErrors, isSaveModalOpen, isSaving, saveStatus])

  const handleCloseSaveModal = useCallback(() => {
    if (isSaving) return
    setIsSaveModalOpen(false)
    setSaveStatus([])
  }, [isSaving])

  useEffect(() => {
    const subscription = form.watch(() => {
      markUnsavedChanges()
    })
    return () => subscription.unsubscribe()
  }, [form, markUnsavedChanges])

  useEffect(() => {
    if (!navigationHydratedRef.current) {
      navigationHydratedRef.current = true
    }
  }, [])

  // Use useWatch to prevent infinite re-renders from form.watch calls
  const mpSearch = useWatch({ control: form.control, name: 'mp_search' })
  const mpSocialMedia = useWatch({ control: form.control, name: 'mp_socialmedia' })
  const mpTelevision = useWatch({ control: form.control, name: 'mp_television' })
  const mpRadio = useWatch({ control: form.control, name: 'mp_radio' })
  const mpNewspaper = useWatch({ control: form.control, name: 'mp_newspaper' })
  const mpMagazines = useWatch({ control: form.control, name: 'mp_magazines' })
  const mpOoh = useWatch({ control: form.control, name: 'mp_ooh' })
  const mpCinema = useWatch({ control: form.control, name: 'mp_cinema' })
  const mpDigidisplay = useWatch({ control: form.control, name: 'mp_digidisplay' })
  const mpDigiaudio = useWatch({ control: form.control, name: 'mp_digiaudio' })
  const mpDigivideo = useWatch({ control: form.control, name: 'mp_digivideo' })
  const mpBvod = useWatch({ control: form.control, name: 'mp_bvod' })
  const mpIntegration = useWatch({ control: form.control, name: 'mp_integration' })
  const mpConsulting = useWatch({ control: form.control, name: 'mp_production' })
  const mpProgdisplay = useWatch({ control: form.control, name: 'mp_progdisplay' })
  const mpProgvideo = useWatch({ control: form.control, name: 'mp_progvideo' })
  const mpProgbvod = useWatch({ control: form.control, name: 'mp_progbvod' })
  const mpProgaudio = useWatch({ control: form.control, name: 'mp_progaudio' })
  const mpProgooh = useWatch({ control: form.control, name: 'mp_progooh' })
  const mpInfluencers = useWatch({ control: form.control, name: 'mp_influencers' })
  const campaignStartDate = useWatch({ control: form.control, name: 'mp_campaigndates_start' })
  const campaignEndDate = useWatch({ control: form.control, name: 'mp_campaigndates_end' })
  const campaignBudget = useWatch({ control: form.control, name: 'mp_campaignbudget' })

  /** When any media on/off toggles, line-item API load re-runs so newly enabled types are not stuck with []. */
  const enabledMediaFlagsFingerprint = useMemo(() => {
    return [
      mpSearch,
      mpSocialMedia,
      mpTelevision,
      mpRadio,
      mpNewspaper,
      mpMagazines,
      mpOoh,
      mpCinema,
      mpDigidisplay,
      mpDigiaudio,
      mpDigivideo,
      mpBvod,
      mpIntegration,
      mpConsulting,
      mpProgdisplay,
      mpProgvideo,
      mpProgbvod,
      mpProgaudio,
      mpProgooh,
      mpInfluencers,
    ]
      .map((on) => (on ? "1" : "0"))
      .join("")
  }, [
    mpSearch,
    mpSocialMedia,
    mpTelevision,
    mpRadio,
    mpNewspaper,
    mpMagazines,
    mpOoh,
    mpCinema,
    mpDigidisplay,
    mpDigiaudio,
    mpDigivideo,
    mpBvod,
    mpIntegration,
    mpConsulting,
    mpProgdisplay,
    mpProgvideo,
    mpProgbvod,
    mpProgaudio,
    mpProgooh,
    mpInfluencers,
  ])

  const enabledSections = useMemo(() => {
    const flagMap: Record<string, boolean> = {
      mp_television: !!mpTelevision,
      mp_radio: !!mpRadio,
      mp_newspaper: !!mpNewspaper,
      mp_magazines: !!mpMagazines,
      mp_ooh: !!mpOoh,
      mp_cinema: !!mpCinema,
      mp_digidisplay: !!mpDigidisplay,
      mp_digiaudio: !!mpDigiaudio,
      mp_digivideo: !!mpDigivideo,
      mp_bvod: !!mpBvod,
      mp_integration: !!mpIntegration,
      mp_production: !!mpConsulting,
      mp_search: !!mpSearch,
      mp_socialmedia: !!mpSocialMedia,
      mp_progdisplay: !!mpProgdisplay,
      mp_progvideo: !!mpProgvideo,
      mp_progbvod: !!mpProgbvod,
      mp_progaudio: !!mpProgaudio,
      mp_progooh: !!mpProgooh,
      mp_influencers: !!mpInfluencers,
    }
    return mediaTypes
      .filter((medium) => flagMap[medium.name])
      .map((medium) => ({
        id: `media-section-${medium.name}`,
        label: medium.label,
      }))
  }, [
    mpTelevision,
    mpRadio,
    mpNewspaper,
    mpMagazines,
    mpOoh,
    mpCinema,
    mpDigidisplay,
    mpDigiaudio,
    mpDigivideo,
    mpBvod,
    mpIntegration,
    mpConsulting,
    mpSearch,
    mpSocialMedia,
    mpProgdisplay,
    mpProgvideo,
    mpProgbvod,
    mpProgaudio,
    mpProgooh,
    mpInfluencers,
  ])

  const deepCloneBillingMonths = useCallback((months: BillingMonth[]): BillingMonth[] => {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(months) as BillingMonth[]
    }
    return JSON.parse(JSON.stringify(months)) as BillingMonth[]
  }, [])

  // Reset snapshot only when campaign dates change OR we switch to a new MBA/version context.
  const deliverySnapshotKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const startKey = campaignStartDate ? toDateOnlyString(campaignStartDate) : ""
    const endKey = campaignEndDate ? toDateOnlyString(campaignEndDate) : ""
    const key = `${startKey}|${endKey}|${mbaNumber ?? ""}|${selectedVersionNumber ?? ""}`
    if (deliverySnapshotKeyRef.current && deliverySnapshotKeyRef.current !== key) {
      deliveryScheduleSnapshotRef.current = null
    }
    deliverySnapshotKeyRef.current = key
  }, [campaignStartDate, campaignEndDate, mbaNumber, selectedVersionNumber])

  useEffect(() => {
    const v = selectedVersionNumber ?? mediaPlan?.version_number
    if (v != null && v !== undefined) {
      form.setValue("mp_plannumber", String(v), { shouldDirty: false })
    }
  }, [selectedVersionNumber, mediaPlan?.version_number, form])
  
  const getRateForMediaType = useCallback((mediaType: string): number => {
    switch (mediaType) {
      case "progVideo":
      case "progBvod":
      case "digiVideo":
      case "digi video":
      case "bvod":
      case "BVOD":
      case "Prog BVOD":
      case "Digi Video":
      case "Prog Video":
        return adservvideo ?? 0
      case "progAudio":
      case "digiAudio":
      case "digi audio":
        return adservaudio ?? 0
      case "progDisplay":
      case "digiDisplay":
      case "digi display":
        return adservdisplay ?? 0
      default:
        return adservimp ?? 0
    }
  }, [adservvideo, adservaudio, adservdisplay, adservimp])

  /**
   * Burst pipeline: updates `autoReferenceBillingMonths` + delivery only. Never mutates `workingBillingMonths`
   * (see preserved-state block above; working changes via hydrate, append-only merge, or Edit Billing).
   */
  const calculateBillingSchedule = useCallback((
    startOverride?: Date | string | null,
    endOverride?: Date | string | null
  ) => {
    const startRaw = startOverride ?? form.watch("mp_campaigndates_start");
    const endRaw = endOverride ?? form.watch("mp_campaigndates_end");
    if (!startRaw || !endRaw) return;

    const start = new Date(startRaw as any);
    const end = new Date(endRaw as any);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    type MonthEntry = {
      totalMedia: number;
      totalFee: number;
      adServing: number;
      productionTotal: number;
      mediaCosts: Record<string, number>;
    };

    // 1. Build month maps for billing and delivery schedules.
    // - billing: media is billable (can be $0 when clientPaysForMedia)
    // - delivery: media is delivered (should remain even when clientPaysForMedia)
    const billingMap: Record<string, MonthEntry> = {};
    const deliveryMap: Record<string, MonthEntry> = {};
  
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthInitEnd = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= monthInitEnd) {
      const key = format(cur, "MMMM yyyy");
      const base: MonthEntry = {
        totalMedia: 0,
        totalFee: 0,
        adServing: 0,
        productionTotal: 0,
        mediaCosts: { search: 0, socialMedia: 0, progAudio: 0, cinema: 0, digiAudio: 0, digiDisplay: 0, digiVideo: 0, progDisplay: 0, progVideo: 0, progBvod: 0, progOoh: 0, television: 0, radio: 0, newspaper: 0, magazines: 0, ooh: 0, bvod: 0, integration: 0, influencers: 0, production: 0 }
      };
      billingMap[key] = { ...base, mediaCosts: { ...base.mediaCosts } };
      deliveryMap[key] = { ...base, mediaCosts: { ...base.mediaCosts } };
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    // 2. Distribute a single burst and track its media type.
    function distribute(burst: BillingBurst, mediaType: 'search' | 'socialMedia' | 'progAudio' | 'cinema' | 'digiAudio' | 'digiDisplay' | 'digiVideo' | 'progDisplay' | 'progVideo' | 'progBvod' | 'progOoh' | 'television' | 'radio' | 'newspaper' | 'magazines' | 'ooh' | 'bvod' | 'integration' | 'influencers' | 'production') {
      const s = new Date(burst.startDate);
      const e = new Date(burst.endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return; // Guard against invalid dates

      // Normalise burst endpoints to local midnight so day counts don't drift
      // when bursts come from UTC ISO strings (e.g. "2026-05-30T14:00:00.000Z").
      const sLocalMidnight = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const eLocalMidnight = new Date(e.getFullYear(), e.getMonth(), e.getDate());

      const daysTotal =
        Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (daysTotal <= 0) return;

      // Walk months by constructing fresh first-of-month Dates instead of mutating
      // with setMonth/setDate, which has a rollover bug: e.g. setting month=June on
      // a Date whose day is 31 normalises to 1 July, silently skipping June.
      let d = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1);
      const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1);

      while (d <= lastMonthCursor) {
        const key = format(d, "MMMM yyyy");
        if (billingMap[key] && deliveryMap[key]) {
          const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
          const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime());
          const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime());
          const daysInMonth =
            Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1;

          if (daysInMonth > 0) {
            const ratio = daysInMonth / daysTotal;
            const billingMediaShare = burst.mediaAmount * ratio;
            const deliveryMediaShare = (burst.deliveryMediaAmount ?? burst.mediaAmount) * ratio;
            const feeShare = burst.feeAmount * ratio;

            billingMap[key].mediaCosts[mediaType] += billingMediaShare;
            deliveryMap[key].mediaCosts[mediaType] += deliveryMediaShare;
            if (mediaType === 'production') {
              billingMap[key].productionTotal += billingMediaShare;
              deliveryMap[key].productionTotal += deliveryMediaShare;
            } else {
              billingMap[key].totalMedia += billingMediaShare;
              deliveryMap[key].totalMedia += deliveryMediaShare;
            }
            billingMap[key].totalFee += feeShare;
            deliveryMap[key].totalFee += feeShare;
          }
        }
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }

    // 3. Distribute all bursts, passing their type.
    searchBursts.forEach(b => distribute(b, 'search'));
    socialMediaBursts.forEach(b => distribute(b, 'socialMedia'));
    progAudioBursts.forEach(b => distribute(b, 'progAudio'));
    cinemaBursts.forEach(b => distribute(b, 'cinema'));
    digitalAudioBursts.forEach(b => distribute(b, 'digiAudio'));
    digitalDisplayBursts.forEach(b => distribute(b, 'digiDisplay'));
    digitalVideoBursts.forEach(b => distribute(b, 'digiVideo'));
    progDisplayBursts.forEach(b => distribute(b, 'progDisplay'));
    progVideoBursts.forEach(b => distribute(b, 'progVideo'));
    progBvodBursts.forEach(b => distribute(b, 'progBvod'));
    progOohBursts.forEach(b => distribute(b, 'progOoh'));
    televisionBursts.forEach(b => distribute(b, 'television'));
    radioBursts.forEach(b => distribute(b, 'radio'));
    newspaperBursts.forEach(b => distribute(b, 'newspaper'));
    magazinesBursts.forEach(b => distribute(b, 'magazines'));
    oohBursts.forEach(b => distribute(b, 'ooh'));
    bvodBursts.forEach(b => distribute(b, 'bvod'));
    integrationBursts.forEach(b => distribute(b, 'integration'));
    consultingBursts.forEach(b => distribute(b, 'production'));
    influencersBursts.forEach(b => distribute(b, 'influencers'));

    // 4. Format into BillingMonth[]
    const formatter = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Distribute ad serving fees
    function distributeAdServing(burst: BillingBurst, mediaType: string) {
      const s = new Date(burst.startDate)
      const e = new Date(burst.endDate)
      if (burst.noAdserving) return;
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return

      const sLocalMidnight = new Date(s.getFullYear(), s.getMonth(), s.getDate())
      const eLocalMidnight = new Date(e.getFullYear(), e.getMonth(), e.getDate())

      const daysTotal =
        Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (daysTotal <= 0) return

      let d = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1)
      const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1)

      while (d <= lastMonthCursor) {
        const monthKey = format(d, "MMMM yyyy")
        if (billingMap[monthKey] && deliveryMap[monthKey]) {
          const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
          const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
          const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime())
          const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime())
          const daysInMonth =
            Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1

          if (daysInMonth > 0) {
            const share = burst.deliverables * (daysInMonth / daysTotal)

            const rate = getRateForMediaType(mediaType)
            const buyType = burst.buyType?.toLowerCase?.() || ""
            const isCpm = buyType === "cpm"
            const isBonus = buyType === "bonus"
            const isDigiAudio = typeof mediaType === "string" && mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio"
            const isCpmOrBonusForDigiAudio = isDigiAudio && (isCpm || isBonus)
            const effectiveRate = isCpmOrBonusForDigiAudio ? (adservaudio ?? rate) : rate
            const cost = isCpmOrBonusForDigiAudio
              ? (share / 1000) * effectiveRate
              : isCpm
                ? (share / 1000) * rate
                : (share * rate)

            billingMap[monthKey].adServing += cost
            deliveryMap[monthKey].adServing += cost
          }
        }
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      }
    }

    // 5. Distribute ad serving fees
    digitalAudioBursts.forEach(b => distributeAdServing(b, 'digiAudio'))
    digitalDisplayBursts.forEach(b => distributeAdServing(b, 'digiDisplay'))
    digitalVideoBursts.forEach(b => distributeAdServing(b, 'digiVideo'))
    bvodBursts.forEach(b => distributeAdServing(b, 'bvod'))
    progAudioBursts.forEach(b => distributeAdServing(b, 'progAudio'))
    progVideoBursts.forEach(b => distributeAdServing(b, 'progVideo'))
    progBvodBursts.forEach(b => distributeAdServing(b, 'progBvod'))
    progOohBursts.forEach(b => distributeAdServing(b, 'progOoh'))
    progDisplayBursts.forEach(b => distributeAdServing(b, 'progDisplay'))

    const billingMonthsCalculated: BillingMonth[] = Object.entries(billingMap).map(([monthYear, entry]) => {
      const productionTotal = entry.productionTotal || 0;
      return {
        monthYear,
        mediaTotal: formatter.format(entry.totalMedia),
        feeTotal: formatter.format(entry.totalFee),
        totalAmount: formatter.format(entry.totalMedia + entry.totalFee + entry.adServing + productionTotal),
        adservingTechFees: formatter.format(entry.adServing),
        production: formatter.format(productionTotal),
        mediaCosts: {
          search: formatter.format(entry.mediaCosts.search || 0),
          socialMedia: formatter.format(entry.mediaCosts.socialMedia || 0),
          digiAudio: formatter.format(entry.mediaCosts.digiAudio || 0),
          digiDisplay: formatter.format(entry.mediaCosts.digiDisplay || 0),
          digiVideo: formatter.format(entry.mediaCosts.digiVideo || 0),
          progAudio: formatter.format(entry.mediaCosts.progAudio || 0),
          cinema: formatter.format(entry.mediaCosts.cinema || 0),
          progDisplay: formatter.format(entry.mediaCosts.progDisplay || 0),
          progVideo: formatter.format(entry.mediaCosts.progVideo || 0),
          progBvod: formatter.format(entry.mediaCosts.progBvod || 0),
          progOoh: formatter.format(entry.mediaCosts.progOoh || 0),
          bvod: formatter.format(entry.mediaCosts.bvod || 0),
          television: formatter.format(entry.mediaCosts.television || 0),
          radio: formatter.format(entry.mediaCosts.radio || 0),
          newspaper: formatter.format(entry.mediaCosts.newspaper || 0),
          magazines: formatter.format(entry.mediaCosts.magazines || 0),
          ooh: formatter.format(entry.mediaCosts.ooh || 0),
          integration: formatter.format(entry.mediaCosts.integration || 0),
          influencers: formatter.format(entry.mediaCosts.influencers || 0),
          production: formatter.format(entry.mediaCosts.production || 0),
        }
      };
    });

    const deliveryMonthsCalculated: BillingMonth[] = Object.entries(deliveryMap).map(([monthYear, entry]) => {
      const productionTotal = entry.productionTotal || 0;
      return {
        monthYear,
        mediaTotal: formatter.format(entry.totalMedia),
        feeTotal: formatter.format(entry.totalFee),
        totalAmount: formatter.format(entry.totalMedia + entry.totalFee + entry.adServing + productionTotal),
        adservingTechFees: formatter.format(entry.adServing),
        production: formatter.format(productionTotal),
        mediaCosts: {
          search: formatter.format(entry.mediaCosts.search || 0),
          socialMedia: formatter.format(entry.mediaCosts.socialMedia || 0),
          digiAudio: formatter.format(entry.mediaCosts.digiAudio || 0),
          digiDisplay: formatter.format(entry.mediaCosts.digiDisplay || 0),
          digiVideo: formatter.format(entry.mediaCosts.digiVideo || 0),
          progAudio: formatter.format(entry.mediaCosts.progAudio || 0),
          cinema: formatter.format(entry.mediaCosts.cinema || 0),
          progDisplay: formatter.format(entry.mediaCosts.progDisplay || 0),
          progVideo: formatter.format(entry.mediaCosts.progVideo || 0),
          progBvod: formatter.format(entry.mediaCosts.progBvod || 0),
          progOoh: formatter.format(entry.mediaCosts.progOoh || 0),
          bvod: formatter.format(entry.mediaCosts.bvod || 0),
          television: formatter.format(entry.mediaCosts.television || 0),
          radio: formatter.format(entry.mediaCosts.radio || 0),
          newspaper: formatter.format(entry.mediaCosts.newspaper || 0),
          magazines: formatter.format(entry.mediaCosts.magazines || 0),
          ooh: formatter.format(entry.mediaCosts.ooh || 0),
          integration: formatter.format(entry.mediaCosts.integration || 0),
          influencers: formatter.format(entry.mediaCosts.influencers || 0),
          production: formatter.format(entry.mediaCosts.production || 0),
        }
      };
    });

    // Keep delivery snapshot in sync with latest auto-calculation (e.g. after fee % loads)
    if (deliveryMonthsCalculated.length > 0) {
      deliveryScheduleSnapshotRef.current = deepCloneBillingMonths(deliveryMonthsCalculated)
    }
  
    autoReferenceBillingMonthsRef.current = billingMonthsCalculated
    setAutoReferenceBillingMonths(billingMonthsCalculated)
    setAutoDeliveryMonths(deliveryMonthsCalculated)

    if (
      billingLineItemsFollowAutoRef.current &&
      !isManualBillingRef.current &&
      billingMonthsCalculated.length > 0
    ) {
      const fmt = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const merged = appendAutoReferenceIntoWorkingBilling(
        workingBillingMonthsRef.current,
        billingMonthsCalculated,
        fmt,
        attachLineItemsToMonthsRef.current,
        { resyncExistingFromTemplate: true }
      )
      setWorkingBillingMonths(merged)
      workingBillingMonthsRef.current = merged
    }
  }, [
    searchBursts,
    socialMediaBursts,
    progAudioBursts,
    cinemaBursts,
    digitalAudioBursts,
    digitalDisplayBursts,
    digitalVideoBursts,
    bvodBursts,
    integrationBursts,
    progDisplayBursts,
    progVideoBursts,
    progBvodBursts,
    progOohBursts,
    televisionBursts,
    radioBursts,
    newspaperBursts,
    magazinesBursts,
    oohBursts,
    consultingBursts,
    influencersBursts,
    adservaudio,
    getRateForMediaType,
    deepCloneBillingMonths,
    form,
  ]);

  // Fetch the media plan data
  useEffect(() => {
    let isCancelled = false
    
    const fetchMediaPlan = async () => {
      if (!mbaNumber || mbaNumber.trim() === '') {
        console.log("MBA number is empty, skipping fetch")
        setLoading(false)
        setIsLoading(false) // Also set isLoading to false
        return
      }
      
      console.log(`[FETCH] Starting fetch for MBA: "${mbaNumber}"`)
      
      // Reset state when MBA number changes to ensure fresh data
      setLoading(true)
      setError(null)
      setMediaPlan(null)
      
      // Reset all line items to prevent stale data
      setSearchLineItems([])
      setSocialMediaLineItems([])
      setTelevisionLineItems([])
      setRadioLineItems([])
      setNewspaperLineItems([])
      setMagazinesLineItems([])
      setOohLineItems([])
      setCinemaLineItems([])
      setDigitalDisplayLineItems([])
      setDigitalAudioLineItems([])
      setDigitalVideoLineItems([])
      setBvodLineItems([])
      setIntegrationLineItems([])
      setConsultingLineItems([])
      setProgDisplayLineItems([])
      setProgVideoLineItems([])
      setProgBvodLineItems([])
      setProgAudioLineItems([])
      setProgOohLineItems([])
      setInfluencersLineItems([])
      
      // Reset burst data to prevent stale burst information
      setSearchBursts([])
      setSocialMediaBursts([])
      setTelevisionBursts([])
      setRadioBursts([])
      setNewspaperBursts([])
      setMagazinesBursts([])
      setOohBursts([])
      setCinemaBursts([])
      setDigitalDisplayBursts([])
      setDigitalAudioBursts([])
      setDigitalVideoBursts([])
      setBvodBursts([])
      setIntegrationBursts([])
      setConsultingBursts([])
      setProgDisplayBursts([])
      setProgVideoBursts([])
      setProgBvodBursts([])
      setProgAudioBursts([])
      setProgOohBursts([])
      setInfluencersBursts([])
      setSavedBillingMonths([])
      savedBillingMonthsRef.current = []
      setWorkingBillingMonths([])
      setAutoReferenceBillingMonths([])
      autoReferenceBillingMonthsRef.current = []
      hasPersistedBillingScheduleRef.current = false
      setHasPersistedBillingSchedule(false)
      setIsManualBilling(false)
      workingBillingMonthsRef.current = []
      billingLineItemsFollowAutoRef.current = false
      setManualBillingMonths([])
      setIsManualBillingModalOpen(false)
      setFullBillingResetConfirmOpen(false)
      setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
      setManualBillingCostPreBill({ fee: false, adServing: false, production: false })
      manualBillingCostPreBillSnapshotRef.current = {}
      deliveryScheduleSnapshotRef.current = null
      setIsPartialMBA(false)
      setPartialApprovalMetadata(null)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialMBAMediaEnabled({})

      // Allow line-item fetch to run again for this MBA/version + enabled-media set
      lastLineItemsLoadKeyRef.current = ""

      try {
        // Add timestamp cache-busting parameter - load line items immediately
        const timestamp = Date.now()
        // Include version parameter if available
        const versionParam = versionNumber ? `&version=${encodeURIComponent(versionNumber)}` : ''
        const apiUrl = `/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}?t=${timestamp}&billingScheduleFull=1${versionParam}`
        console.log(`[FETCH] Calling API: ${apiUrl}`)
        
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        })
        
        console.log(`[FETCH] API Response status: ${response.status} for MBA: ${mbaNumber}`)
        
        if (isCancelled) return
        
        if (!response.ok) {
          // Initialize with a default error to prevent empty object
          const defaultError = `Failed to fetch media plan (${response.status}: ${response.statusText})`
          let errorData: { error?: string; message?: string; details?: any } = { error: defaultError }
          let errorMessage = defaultError
          
          try {
            // Check if response has content before parsing
            const contentType = response.headers.get("content-type")
            const contentLength = response.headers.get("content-length")
            
            // Read response as text first to inspect it
            const responseText = await response.text()
            
            console.log(`[FETCH] Error response details:`, {
              status: response.status,
              statusText: response.statusText,
              contentType,
              contentLength,
              hasText: !!responseText,
              textLength: responseText?.length || 0,
              textPreview: responseText?.substring(0, 200)
            })
            
            if (responseText && responseText.trim()) {
              try {
                const parsed = JSON.parse(responseText)
                
                // Check if parsed data is empty, null, or invalid
                const isEmptyObject = parsed !== null && 
                                     typeof parsed === 'object' && 
                                     !Array.isArray(parsed) && 
                                     Object.keys(parsed).length === 0
                
                if (!parsed || isEmptyObject || parsed === null) {
                  console.warn(`[FETCH] Parsed error data is empty/null, using fallback. Parsed:`, parsed)
                  errorData = { error: defaultError }
                  errorMessage = defaultError
                } else {
                  // Validate parsed data has error or message
                  if (parsed.error || parsed.message) {
                    errorData = parsed
                    errorMessage = parsed.error || parsed.message || defaultError
                  } else {
                    // Parsed object exists but has no error/message, use it but add error
                    errorData = { ...parsed, error: defaultError }
                    errorMessage = defaultError
                  }
                }
              } catch (jsonError) {
                console.error("[FETCH] Failed to parse error response as JSON:", jsonError)
                errorData = { error: responseText || defaultError }
                errorMessage = responseText || defaultError
              }
            } else {
              console.warn(`[FETCH] Error response body is empty, using fallback`)
              errorData = { error: defaultError }
              errorMessage = defaultError
            }
          } catch (parseError) {
            console.error("[FETCH] Failed to read error response:", parseError)
            errorData = { error: defaultError }
            errorMessage = defaultError
          }
          
          if (isCancelled) return
          
          // Final validation - ensure errorData always has an error property
          if (!errorData || typeof errorData !== 'object' || !errorData.error) {
            errorData = { error: errorMessage }
          }
          
          // Ensure errorMessage is never empty
          if (!errorMessage || errorMessage.trim() === '') {
            errorMessage = defaultError
            errorData = { error: errorMessage }
          }
          
          // Final safety check before logging
          if (!errorData.error) {
            errorData.error = errorMessage
          }
          
          console.error("[FETCH] Error response:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData.error || errorMessage,
            message: errorData.message,
            details: errorData.details,
            errorData: errorData,
            errorMessage: errorMessage
          })
          
          setModalTitle("Error")
          setModalOutcome(errorMessage)
          setModalOpen(true)
          setModalLoading(false)
          
          setError(errorMessage)
          setLoading(false)
          setIsLoading(false) // Also set isLoading to false
          return
        }

        const data = await response.json()
        
        if (isCancelled) return
        
        // Comprehensive logging to debug data structure
        console.log("[DATA LOAD] Full API response:", JSON.stringify(data, null, 2))
        console.log("[DATA LOAD] Key fields check:", {
          mba_number: data.mba_number,
          mp_client_name: data.mp_client_name,
          client_name: data.client_name,
          campaign_name: data.campaign_name,
          mp_campaignname: data.mp_campaignname,
          campaign_status: data.campaign_status,
          mp_campaignstatus: data.mp_campaignstatus,
          campaign_start_date: data.campaign_start_date,
          campaign_end_date: data.campaign_end_date,
          brand: data.brand,
          client_contact: data.client_contact,
          po_number: data.po_number,
          mp_campaignbudget: data.mp_campaignbudget,
          version_number: data.version_number,
          media_types: {
            mp_television: data.mp_television,
            mp_radio: data.mp_radio,
            mp_newspaper: data.mp_newspaper,
            mp_magazines: data.mp_magazines,
            mp_ooh: data.mp_ooh,
            mp_cinema: data.mp_cinema,
            mp_digidisplay: data.mp_digidisplay,
            mp_digiaudio: data.mp_digiaudio,
            mp_digivideo: data.mp_digivideo,
            mp_bvod: data.mp_bvod,
            mp_integration: data.mp_integration,
            mp_search: data.mp_search,
            mp_socialmedia: data.mp_socialmedia,
            mp_progdisplay: data.mp_progdisplay,
            mp_progvideo: data.mp_progvideo,
            mp_progbvod: data.mp_progbvod,
            mp_progaudio: data.mp_progaudio,
            mp_progooh: data.mp_progooh,
            mp_influencers: data.mp_influencers,
          }
        })
        console.log("[DATA LOAD] Media plan line items:", data.lineItems)
        console.log("[DATA LOAD] Billing schedule in response:", data.billingSchedule ? "Present" : "Missing")
        
        // Validate that the loaded version matches the requested version
        const loadedVersionNumber = data.version_number 
          ? (typeof data.version_number === 'string' ? parseInt(data.version_number, 10) : data.version_number)
          : null
        const requestedVersionNumber = versionNumber 
          ? (typeof versionNumber === 'string' ? parseInt(versionNumber, 10) : parseInt(versionNumber, 10))
          : null
        
        // Track current and available versions for rollback/support
        setSelectedVersionNumber(loadedVersionNumber)
        const versionsFromApi = Array.isArray(data.versions) ? data.versions.map((v: any) => ({
          id: v.id,
          version_number: typeof v.version_number === 'string' ? parseInt(v.version_number, 10) : v.version_number,
          created_at: v.created_at ?? null
        })) : []
        setAvailableVersions(versionsFromApi)

        // Derive latest version robustly (even when loading an older version)
        const versionCandidates = [
          data.latestVersionNumber,
          data.latest_version_number,
          data.currentVersionNumber,
          data.master_version_number,
          loadedVersionNumber,
          ...(versionsFromApi.length > 0 ? versionsFromApi.map(v => v.version_number || 0) : [])
        ].filter((v) => typeof v === 'number' && !Number.isNaN(v)) as number[]

        const latestFromApi = versionCandidates.length > 0 ? Math.max(...versionCandidates) : 1
        setLatestVersionNumber(latestFromApi)

        const nextFromApi = data.nextVersionNumber
          ?? data.next_version_number
          ?? (latestFromApi + 1)
        setNextSaveVersionNumber(nextFromApi)
        
        if (requestedVersionNumber !== null && loadedVersionNumber !== null && loadedVersionNumber !== requestedVersionNumber) {
          console.warn(`[DATA LOAD] Version mismatch! Requested: ${requestedVersionNumber}, Loaded: ${loadedVersionNumber}`)
          // Still set the data, but log the warning - the API should have handled this correctly
        } else if (requestedVersionNumber !== null && loadedVersionNumber === requestedVersionNumber) {
          console.log(`[DATA LOAD] Version match confirmed: ${loadedVersionNumber}`)
        }
        
        // Set the media plan data (needed for version number display)
        setMediaPlan(data)

        const rawBillingSchedule =
          data.billingSchedule ??
          (data as { billing_schedule?: unknown }).billing_schedule ??
          (data as { versionData?: { billingSchedule?: unknown; billing_schedule?: unknown } }).versionData
            ?.billingSchedule ??
          (data as { versionData?: { billing_schedule?: unknown } }).versionData?.billing_schedule

        const billingHydrated = parseSavedBillingSchedulePayload(rawBillingSchedule, {
          searchFee: feeSearchRef.current ?? 0,
          socialFee: feeSocialRef.current ?? 0,
        })
        if (billingHydrated) {
          console.log("[BILLING LOAD] Hydrating billing schedule from fetch (batched with media plan)")
          const persistedMonths = billingHydrated.months
          const deepSaved = JSON.parse(JSON.stringify(persistedMonths)) as BillingMonth[]
          const deepWorking = JSON.parse(JSON.stringify(persistedMonths)) as BillingMonth[]
          hasPersistedBillingScheduleRef.current = true
          setHasPersistedBillingSchedule(true)
          setIsManualBilling(true)
          setSavedBillingMonths(deepSaved)
          savedBillingMonthsRef.current = deepSaved
          setWorkingBillingMonths(deepWorking)
          workingBillingMonthsRef.current = deepWorking
          if (billingHydrated.partial) {
            const h = billingHydrated.partial.hydrate
            setPartialApprovalMetadata(billingHydrated.partial.metadata)
            setIsPartialMBA(true)
            setPartialMBAValues(h.partialMBAValues)
            setPartialMBAMonthYears(h.partialMBAMonthYears)
            setPartialMBASelectedLineItemIds(h.partialMBASelectedLineItemIds)
            setPartialMBAMediaEnabled(h.partialMBAMediaEnabled)
            setOriginalPartialMBAValues(JSON.parse(JSON.stringify(h.partialMBAValues)))
          }
        } else {
          hasPersistedBillingScheduleRef.current = false
          setSavedBillingMonths([])
          savedBillingMonthsRef.current = []
          setHasPersistedBillingSchedule(false)
          setIsManualBilling(false)
        }
        
        // Parse dates properly - handle both timestamp and date string formats
        const parseDate = (dateValue: any) => {
          if (!dateValue) {
            console.warn("[DATA LOAD] Date value is null/undefined")
            return new Date()
          }
          if (typeof dateValue === 'number') {
            const date = new Date(dateValue)
            console.log(`[DATA LOAD] Parsed numeric date ${dateValue} to:`, date)
            return date
          }
          if (typeof dateValue === 'string') {
            try {
              // Preserve exact day for plain YYYY-MM-DD without timezone shifts
              const parsed = parseDateOnlyString(dateValue)
              console.log(`[DATA LOAD] Parsed date-only string "${dateValue}" to:`, parsed)
              return parsed
            } catch {
              const parsed = new Date(dateValue)
              if (isNaN(parsed.getTime())) {
                console.warn(`[DATA LOAD] Invalid date string: ${dateValue}`)
                return new Date()
              }
              console.log(`[DATA LOAD] Parsed string date "${dateValue}" to:`, parsed)
              return parsed
            }
          }
          return new Date(dateValue)
        }
        
        if (isCancelled) return
        
        // Map API field names to form field names
        // The API returns combined data from masterData and versionData
        // Normalize campaign status to lowercase to match dropdown values
        const rawCampaignStatus = data.campaign_status || data.mp_campaignstatus || ""
        const normalizedCampaignStatus = rawCampaignStatus.toLowerCase() || "draft"
        
        const formData = {
          mp_clientname: data.mp_client_name || data.client_name || data.mp_clientname || "",
          mp_campaignstatus: normalizedCampaignStatus,
          mp_campaignname: data.campaign_name || data.mp_campaignname || "",
          mp_campaigndates_start: parseDate(data.campaign_start_date),
          mp_campaigndates_end: parseDate(data.campaign_end_date),
          mp_brand: data.brand || data.mp_brand || "",
          mp_clientcontact: data.client_contact || data.mp_clientcontact || "",
          mp_ponumber: data.po_number || data.mp_ponumber || "",
          mp_campaignbudget: Number(data.mp_campaignbudget) || Number(data.campaign_budget) || 0,
          mbaidentifier: data.mbaidentifier || "", // Will be set from client lookup if needed
          mbanumber: data.mba_number || data.mbanumber || mbaNumber || "",
          mp_plannumber: String(loadedVersionNumber ?? 1),
          mp_television: Boolean(data.mp_television),
          mp_radio: Boolean(data.mp_radio),
          mp_newspaper: Boolean(data.mp_newspaper),
          mp_magazines: Boolean(data.mp_magazines),
          mp_ooh: Boolean(data.mp_ooh),
          mp_cinema: Boolean(data.mp_cinema),
          mp_digidisplay: Boolean(data.mp_digidisplay),
          mp_digiaudio: Boolean(data.mp_digiaudio),
          mp_digivideo: Boolean(data.mp_digivideo),
          mp_bvod: Boolean(data.mp_bvod),
          mp_integration: Boolean(data.mp_integration),
          mp_production: Boolean(data.mp_production || data.mp_fixedfee),
          mp_search: Boolean(data.mp_search),
          mp_socialmedia: Boolean(data.mp_socialmedia),
          mp_progdisplay: Boolean(data.mp_progdisplay),
          mp_progvideo: Boolean(data.mp_progvideo),
          mp_progbvod: Boolean(data.mp_progbvod),
          mp_progaudio: Boolean(data.mp_progaudio),
          mp_progooh: Boolean(data.mp_progooh),
          mp_influencers: Boolean(data.mp_influencers),
          lineItems: [],
        }
        
        console.log("[DATA LOAD] Form data to be set:", formData)
        
        // Update form with the fetched data
        form.reset(formData)
        navigationHydratedRef.current = true
        setHasUnsavedChanges(false)
        
        console.log("[DATA LOAD] Form reset completed")
        
        // Set the MBA number in the context
        if (data.mba_number) {
          setContextMbaNumber(data.mba_number)
        }
        
        // Store client name for later client selection
        if (data.mp_client_name || data.client_name) {
          setSelectedClientId(data.mp_client_name || data.client_name) // Temporarily store client name
        }
        
        // Load client fees directly from API response if available
        // This ensures fees are available even if client lookup fails
        if (data.clientData || data.client) {
          const clientData = data.clientData || data.client
          console.log("[DATA LOAD] Loading client fees from API response:", clientData)
          applyClientFees(clientData)
        }
        
        // Load line items from API response if available, otherwise they'll be loaded in the useEffect
        if (data.lineItems && typeof data.lineItems === 'object' && !isCancelled) {
          console.log("[DATA LOAD] Loading line items from API response")
          try {
            // Use version from API response (which should match requested version), with fallbacks
            const versionForFiltering =
              data.version_number?.toString() ||
              versionNumber?.toString() ||
              (loadedVersionNumber ?? 1).toString()
            console.log(`[DATA LOAD] Filtering line items with version: ${versionForFiltering} (from ${data.version_number ? 'API response' : versionNumber ? 'query params' : 'fallback'})`)
            
            // Map API line items to state setters with filtering
            if (data.lineItems.television) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.television, mbaNumber, versionForFiltering, 'television')
              setTelevisionLineItems(filtered)
            }
            if (data.lineItems.radio) {
              // Only hydrate Radio state if Radio is enabled for this version.
              // This prevents loading/processing radio rows when mp_radio is false/missing.
              const radioEnabled =
                Boolean(formData?.mp_radio) ||
                Boolean(data?.mp_radio) ||
                Boolean((data as any)?.mpRadio)

              if (radioEnabled) {
                const filtered = filterLineItemsByPlanNumber(data.lineItems.radio, mbaNumber, versionForFiltering, 'radio')
                setRadioLineItems(filtered)
              } else {
                setRadioLineItems([])
              }
            }
            if (data.lineItems.newspaper) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.newspaper, mbaNumber, versionForFiltering, 'newspaper')
              setNewspaperLineItems(filtered)
            }
            if (data.lineItems.magazines) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.magazines, mbaNumber, versionForFiltering, 'magazines')
              setMagazinesLineItems(filtered)
            }
            if (data.lineItems.ooh) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.ooh, mbaNumber, versionForFiltering, 'ooh')
              setOohLineItems(filtered)
            }
            if (data.lineItems.cinema) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.cinema, mbaNumber, versionForFiltering, 'cinema')
              setCinemaLineItems(filtered)
            }
            if (data.lineItems.digitalDisplay) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.digitalDisplay, mbaNumber, versionForFiltering, 'digitalDisplay')
              setDigitalDisplayLineItems(filtered)
            }
            if (data.lineItems.digitalAudio) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.digitalAudio, mbaNumber, versionForFiltering, 'digitalAudio')
              setDigitalAudioLineItems(filtered)
            }
            if (data.lineItems.digitalVideo) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.digitalVideo, mbaNumber, versionForFiltering, 'digitalVideo')
              setDigitalVideoLineItems(filtered)
            }
            if (data.lineItems.bvod) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.bvod, mbaNumber, versionForFiltering, 'bvod')
              setBvodLineItems(filtered)
            }
            if (data.lineItems.integration) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.integration, mbaNumber, versionForFiltering, 'integration')
              setIntegrationLineItems(filtered)
            }
            const productionLineItems =
              data.lineItems.production ||
              data.lineItems.consulting ||
              data.lineItems.contentCreator ||
              data.lineItems.mp_production ||
              data.lineItems.fixedfee
            if (productionLineItems) {
              const filtered = filterLineItemsByPlanNumber(productionLineItems, mbaNumber, versionForFiltering, 'production')
              setConsultingLineItems(filtered)
              // Auto-enable Production toggle when saved items are present so the container renders
              if (filtered.length > 0 && !form.getValues('mp_production')) {
                form.setValue('mp_production', true, { shouldDirty: false })
              }
            }
            if (data.lineItems.search) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.search, mbaNumber, versionForFiltering, 'search')
              setSearchLineItems(filtered)
            }
            if (data.lineItems.socialMedia) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.socialMedia, mbaNumber, versionForFiltering, 'socialMedia')
              setSocialMediaLineItems(filtered)
            }
            if (data.lineItems.progDisplay) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.progDisplay, mbaNumber, versionForFiltering, 'progDisplay')
              setProgDisplayLineItems(filtered)
            }
            if (data.lineItems.progVideo) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.progVideo, mbaNumber, versionForFiltering, 'progVideo')
              setProgVideoLineItems(filtered)
            }
            if (data.lineItems.progBvod) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.progBvod, mbaNumber, versionForFiltering, 'progBvod')
              setProgBvodLineItems(filtered)
            }
            if (data.lineItems.progAudio) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.progAudio, mbaNumber, versionForFiltering, 'progAudio')
              setProgAudioLineItems(filtered)
            }
            if (data.lineItems.progOoh) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.progOoh, mbaNumber, versionForFiltering, 'progOoh')
              setProgOohLineItems(filtered)
            }
            if (data.lineItems.influencers) {
              const filtered = filterLineItemsByPlanNumber(data.lineItems.influencers, mbaNumber, versionForFiltering, 'influencers')
              setInfluencersLineItems(filtered)
            }
            console.log("[DATA LOAD] Line items loaded from API response and filtered")
          } catch (lineItemsError) {
            console.error("[DATA LOAD] Error loading line items from API:", lineItemsError)
          }
        }
        
        if (!isCancelled) {
          setLoading(false)
          setIsLoading(false) // Also set isLoading to false so buttons are enabled
        }
      } catch (error) {
        if (isCancelled) return
        console.error("Error fetching media plan:", error)
        setModalTitle("Error")
        setModalOutcome("Failed to fetch media plan")
        setModalOpen(true)
        setModalLoading(false)
        setError("Failed to fetch media plan")
        setLoading(false)
        setIsLoading(false) // Also set isLoading to false
      }
    }

    fetchMediaPlan()
    
    return () => {
      isCancelled = true
    }
  }, [applyClientFees, form, mbaNumber, versionNumber, setContextMbaNumber])

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients")
        if (!response.ok) {
          throw new Error("Failed to fetch clients")
        }
        const data = await response.json()
        setClients(data)
      } catch (error) {
        console.error("Error fetching clients:", error)
      }
    }

    fetchClients()
  }, [])

  // Handle client selection after clients are loaded
  useEffect(() => {
    if (clients.length > 0 && selectedClientId && mediaPlan) {
      console.log("[CLIENT LOOKUP] Looking for client with name:", selectedClientId)
      console.log("[CLIENT LOOKUP] Available clients:", clients.map(c => ({ id: c.id, name: c.clientname_input, mp_client_name: c.mp_client_name })))
      
      // Helper function to normalize names for comparison
      const normalizeName = (name: string | undefined | null): string => {
        if (!name) return ""
        return name.trim().toLowerCase()
      }
      
      const normalizedSelectedId = normalizeName(selectedClientId)
      
      // Try multiple matching strategies
      let client = clients.find(c => c.clientname_input === selectedClientId)
      
      if (!client) {
        client = clients.find(c => c.mp_client_name === selectedClientId)
      }
      
      if (!client) {
        client = clients.find(c => normalizeName(c.clientname_input) === normalizedSelectedId)
      }
      
      if (!client) {
        client = clients.find(c => normalizeName(c.mp_client_name) === normalizedSelectedId)
      }
      
      if (client) {
        console.log("[CLIENT LOOKUP] Found matching client:", client)
        if (!selectedClient || selectedClient.id !== client.id) {
          setSelectedClient(client)
          // Set all fees from client data (ensuring they're applied to state)
          applyClientFees(client)
          
          // Set client address fields
          setClientAddress(client.streetaddress || "")
          setClientSuburb(client.suburb || "")
          setClientState(client.state_dropdown || "")
          setClientPostcode(String(client.postcode || ""))
          
          // Update the MBA identifier in the form
          console.log("[CLIENT LOOKUP] Setting mbaidentifier:", client.mbaidentifier)
          form.setValue("mbaidentifier", client.mbaidentifier || "")
          
          console.log("[CLIENT LOOKUP] Client fees loaded:", {
            feesearch: client.feesearch,
            feesocial: client.feesocial,
            feetelevision: client.feetelevision,
            feeradio: client.feeradio,
            feenewspapers: client.feenewspapers,
            feemagazines: client.feemagazines,
            feeooh: client.feeooh,
            feecinema: client.feecinema,
            feedigidisplay: client.feedigidisplay,
            feedigiaudio: client.feedigiaudio,
            feedigivideo: client.feedigivideo,
            feebvod: client.feebvod,
            feeintegration: client.feeintegration,
            feeinfluencers: client.feeinfluencers,
            feeprogdisplay: client.feeprogdisplay,
            feeprogvideo: client.feeprogvideo,
            feeprogbvod: client.feeprogbvod,
            feeprogaudio: client.feeprogaudio,
            feeprogooh: client.feeprogooh,
            feecontentcreator: client.feecontentcreator
          })
        }
      } else {
        console.warn("[CLIENT LOOKUP] No matching client found for:", selectedClientId)
      }
    }
  }, [applyClientFees, clients, selectedClientId, mediaPlan, selectedClient, form])

  const lastLineItemsLoadKeyRef = useRef("")
  const lastCampaignDatesRef = useRef<{ start: string; end: string } | null>(null)

  // Load all line items immediately for enabled media types when media plan is loaded
  useEffect(() => {
    const loadAllLineItems = async () => {
      if (!mbaNumber || !mediaPlan?.version_number) {
        return
      }

      const versionToUseEarly =
        versionNumber != null && versionNumber !== ""
          ? typeof versionNumber === "string"
            ? parseInt(versionNumber, 10)
            : Number(versionNumber)
          : mediaPlan.version_number != null
            ? typeof mediaPlan.version_number === "string"
              ? parseInt(mediaPlan.version_number, 10)
              : Number(mediaPlan.version_number)
            : NaN

      if (!Number.isFinite(versionToUseEarly)) {
        return
      }

      const loadKey = `${mbaNumber}|${versionToUseEarly}|${enabledMediaFlagsFingerprint}`
      if (lastLineItemsLoadKeyRef.current === loadKey) {
        return
      }
      lastLineItemsLoadKeyRef.current = loadKey

      console.log("[DATA LOAD] Loading line items for all enabled media types")

      // Get enabled media types from form values directly (not form.watch which may not be reactive)
      const formValues = form.getValues()
      const enabledFlags = [
        { flag: 'mp_television', fetchFn: getTelevisionLineItemsByMBA, setter: setTelevisionLineItems, enabled: formValues.mp_television },
        { flag: 'mp_radio', fetchFn: getRadioLineItemsByMBA, setter: setRadioLineItems, enabled: formValues.mp_radio },
        { flag: 'mp_newspaper', fetchFn: getNewspaperLineItemsByMBA, setter: setNewspaperLineItems, enabled: formValues.mp_newspaper },
        { flag: 'mp_magazines', fetchFn: getMagazinesLineItemsByMBA, setter: setMagazinesLineItems, enabled: formValues.mp_magazines },
        { flag: 'mp_ooh', fetchFn: getOOHLineItemsByMBA, setter: setOohLineItems, enabled: formValues.mp_ooh },
        { flag: 'mp_cinema', fetchFn: getCinemaLineItemsByMBA, setter: setCinemaLineItems, enabled: formValues.mp_cinema },
        { flag: 'mp_digidisplay', fetchFn: getDigitalDisplayLineItemsByMBA, setter: setDigitalDisplayLineItems, enabled: formValues.mp_digidisplay },
        { flag: 'mp_digiaudio', fetchFn: getDigitalAudioLineItemsByMBA, setter: setDigitalAudioLineItems, enabled: formValues.mp_digiaudio },
        { flag: 'mp_digivideo', fetchFn: getDigitalVideoLineItemsByMBA, setter: setDigitalVideoLineItems, enabled: formValues.mp_digivideo },
        { flag: 'mp_bvod', fetchFn: getBVODLineItemsByMBA, setter: setBvodLineItems, enabled: formValues.mp_bvod },
        { flag: 'mp_integration', fetchFn: getIntegrationLineItemsByMBA, setter: setIntegrationLineItems, enabled: formValues.mp_integration },
        { flag: 'mp_production', fetchFn: getProductionLineItemsByMBA, setter: setConsultingLineItems, enabled: formValues.mp_production },
        { flag: 'mp_search', fetchFn: getSearchLineItemsByMBA, setter: setSearchLineItems, enabled: formValues.mp_search },
        { flag: 'mp_socialmedia', fetchFn: getSocialMediaLineItemsByMBA, setter: setSocialMediaLineItems, enabled: formValues.mp_socialmedia },
        { flag: 'mp_progdisplay', fetchFn: getProgDisplayLineItemsByMBA, setter: setProgDisplayLineItems, enabled: formValues.mp_progdisplay },
        { flag: 'mp_progvideo', fetchFn: getProgVideoLineItemsByMBA, setter: setProgVideoLineItems, enabled: formValues.mp_progvideo },
        { flag: 'mp_progbvod', fetchFn: getProgBVODLineItemsByMBA, setter: setProgBvodLineItems, enabled: formValues.mp_progbvod },
        { flag: 'mp_progaudio', fetchFn: getProgAudioLineItemsByMBA, setter: setProgAudioLineItems, enabled: formValues.mp_progaudio },
        { flag: 'mp_progooh', fetchFn: getProgOOHLineItemsByMBA, setter: setProgOohLineItems, enabled: formValues.mp_progooh },
        { flag: 'mp_influencers', fetchFn: getInfluencersLineItemsByMBA, setter: setInfluencersLineItems, enabled: formValues.mp_influencers },
      ].filter(({ enabled }) => enabled)

      if (enabledFlags.length === 0) {
        console.log("[DATA LOAD] No enabled media types to load")
        return
      }

      try {
        const versionToUse = versionToUseEarly
        
        console.log(`[DATA LOAD] Loading line items with version: ${versionToUse} (from ${versionNumber ? 'query params' : 'mediaPlan'})`)
        
        const fetchPromises = enabledFlags.map(async ({ fetchFn, setter, flag }) => {
          try {
            const items = await fetchFn(mbaNumber, versionToUse)
            console.log(`[DATA LOAD] ${flag} line items loaded:`, items.length, items)
            
            // Filter items to ensure they match both mba_number and version_number/mp_plannumber
            const filteredItems = filterLineItemsByPlanNumber(
              items,
              mbaNumber,
              versionToUse.toString(),
              flag
            )
            
            // Ensure all non-calculated fields are properly set
            const processedItems = filteredItems.map((item: any) => {
              // Ensure bursts_json is preserved for container parsing
              // Containers will parse and populate bursts correctly
              return {
                ...item,
                // Keep all original fields including bursts_json
                bursts_json: item.bursts_json || item.bursts || null
              }
            })
            setter(processedItems)
            return { flag, success: true, count: processedItems.length }
          } catch (error) {
            console.warn(`[DATA LOAD] Error loading ${flag} line items:`, error)
            setter([])
            return { flag, success: false, error }
          }
        })

        const results = await Promise.all(fetchPromises)
        console.log("[DATA LOAD] All line items loaded:", results)
      } catch (error) {
        console.error("[DATA LOAD] Error loading line items:", error)
      }
    }

    loadAllLineItems()
  }, [mbaNumber, mediaPlan?.version_number, versionNumber, form, enabledMediaFlagsFingerprint])

  const handleClientSelect = (client: Client | null) => {
    if (client) {
      setSelectedClientId(client.id.toString());
      setSelectedClient(client);
      setIsClientModalOpen(false);
    }
  };

  const handleSearchBurstsChange = useCallback((bursts) => {
    setSearchBursts(bursts)
  }, [])

  const handleSocialMediaBurstsChange = useCallback((bursts) => {
    setSocialMediaBursts(bursts)
  }, [])

  // Burst change handlers for all media types (matching create page pattern)
  const handleTelevisionBurstsChange = useCallback((bursts: any[]) => {
    setTelevisionBursts(bursts)
  }, [])

  const handleRadioBurstsChange = useCallback((bursts: any[]) => {
    setRadioBursts(bursts)
  }, [])

  const handleNewspaperBurstsChange = useCallback((bursts: any[]) => {
    setNewspaperBursts(bursts)
  }, [])

  const handleMagazinesBurstsChange = useCallback((bursts: any[]) => {
    setMagazinesBursts(bursts)
  }, [])

  const handleOohBurstsChange = useCallback((bursts: any[]) => {
    setOohBursts(bursts)
  }, [])

  const handleCinemaBurstsChange = useCallback((bursts: any[]) => {
    setCinemaBursts(bursts)
  }, [])

  const handleDigitalDisplayBurstsChange = useCallback((bursts: any[]) => {
    setDigitalDisplayBursts(bursts)
  }, [])

  const handleDigitalAudioBurstsChange = useCallback((bursts: any[]) => {
    setDigitalAudioBursts(bursts)
  }, [])

  const handleDigitalVideoBurstsChange = useCallback((bursts: any[]) => {
    setDigitalVideoBursts(bursts)
  }, [])

  const handleBvodBurstsChange = useCallback((bursts: any[]) => {
    setBvodBursts(bursts)
  }, [])

  const handleIntegrationBurstsChange = useCallback((bursts: any[]) => {
    setIntegrationBursts(bursts)
  }, [])

  const handleConsultingBurstsChange = useCallback((bursts: any[]) => {
    setConsultingBursts(bursts)
  }, [])

  const handleProgDisplayBurstsChange = useCallback((bursts: any[]) => {
    setProgDisplayBursts(bursts)
  }, [])

  const handleProgVideoBurstsChange = useCallback((bursts: any[]) => {
    setProgVideoBursts(bursts)
  }, [])

  const handleProgBvodBurstsChange = useCallback((bursts: any[]) => {
    setProgBvodBursts(bursts)
  }, [])

  const handleProgAudioBurstsChange = useCallback((bursts: any[]) => {
    setProgAudioBursts(bursts)
  }, [])

  const handleProgOohBurstsChange = useCallback((bursts: any[]) => {
    setProgOohBursts(bursts)
  }, [])

  const handleInfluencersBurstsChange = useCallback((bursts: any[]) => {
    setInfluencersBursts(bursts)
  }, [])

  const handleInvestmentChange = useCallback((investmentByMonth) => {
    markUnsavedChanges()
    setInvestmentPerMonth(investmentByMonth)
    // Billing rows are not regenerated from investment on the main page — use Edit Billing for any reset/rebuild.
  }, [markUnsavedChanges])

  const handleBurstsChange = useCallback(() => {
    // Add burst handling if needed
  }, []);

  // Manual Billing Functions (matching create page)
  function handleManualBillingOpen() {
    // Clone `workingBillingMonths` into modal-local state; working stays unchanged until explicit save.
    // After load from `media_plan_versions`, only append missing line-item IDs from auto; do not rebuild from containers or re-total months here.
    const sourceMonths = workingBillingMonths
    const deepCopiedMonths = JSON.parse(JSON.stringify(sourceMonths)) as BillingMonth[]

    // Generate line items for each media type
    const mediaTypeMap: Record<string, { lineItems: any[], key: string }> = {
      'mp_television': { lineItems: televisionMediaLineItems, key: 'television' },
      'mp_radio': { lineItems: radioMediaLineItems, key: 'radio' },
      'mp_newspaper': { lineItems: newspaperMediaLineItems, key: 'newspaper' },
      'mp_magazines': { lineItems: magazinesMediaLineItems, key: 'magazines' },
      'mp_ooh': { lineItems: oohMediaLineItems, key: 'ooh' },
      'mp_cinema': { lineItems: cinemaMediaLineItems, key: 'cinema' },
      'mp_digidisplay': { lineItems: digitalDisplayMediaLineItems, key: 'digiDisplay' },
      'mp_digiaudio': { lineItems: digitalAudioMediaLineItems, key: 'digiAudio' },
      'mp_digivideo': { lineItems: digitalVideoMediaLineItems, key: 'digiVideo' },
      'mp_bvod': { lineItems: bvodMediaLineItems, key: 'bvod' },
      'mp_search': { lineItems: searchMediaLineItems, key: 'search' },
      'mp_socialmedia': { lineItems: socialMediaMediaLineItems, key: 'socialMedia' },
      'mp_progdisplay': { lineItems: progDisplayMediaLineItems, key: 'progDisplay' },
      'mp_progvideo': { lineItems: progVideoMediaLineItems, key: 'progVideo' },
      'mp_progbvod': { lineItems: progBvodMediaLineItems, key: 'progBvod' },
      'mp_progaudio': { lineItems: progAudioMediaLineItems, key: 'progAudio' },
      'mp_progooh': { lineItems: progOohMediaLineItems, key: 'progOoh' },
      'mp_influencers': { lineItems: influencersMediaLineItems, key: 'influencers' },
      'mp_integration': { lineItems: integrationMediaLineItems, key: 'integration' },
      'mp_production': { lineItems: consultingMediaLineItems, key: 'production' },
    };

    // Generate line items once and attach to all months (per–line-item reset uses `autoReferenceBillingMonths` + attach, not modal-open snapshots).
    const allLineItems: Record<string, BillingLineItemType[]> = {};

    Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
      if (form.getValues(mediaTypeKey as any) && lineItems) {
        const billingLineItems = generateBillingLineItems(lineItems, key, deepCopiedMonths, "billing");
        if (billingLineItems.length > 0) {
          allLineItems[key] = billingLineItems;
        }
      }
    });

    // Attach the same line items structure to each month and ensure mediaCosts is initialized
    const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    deepCopiedMonths.forEach((month: BillingMonth) => {
      if (!month.lineItems) month.lineItems = {};
      if (!month.mediaCosts) {
        month.mediaCosts = {
          search: currencyFormatter.format(0),
          socialMedia: currencyFormatter.format(0),
          television: currencyFormatter.format(0),
          radio: currencyFormatter.format(0),
          newspaper: currencyFormatter.format(0),
          magazines: currencyFormatter.format(0),
          ooh: currencyFormatter.format(0),
          cinema: currencyFormatter.format(0),
          digiDisplay: currencyFormatter.format(0),
          digiAudio: currencyFormatter.format(0),
          digiVideo: currencyFormatter.format(0),
          bvod: currencyFormatter.format(0),
          integration: currencyFormatter.format(0),
          progDisplay: currencyFormatter.format(0),
          progVideo: currencyFormatter.format(0),
          progBvod: currencyFormatter.format(0),
          progAudio: currencyFormatter.format(0),
          progOoh: currencyFormatter.format(0),
          influencers: currencyFormatter.format(0),
          production: currencyFormatter.format(0),
        };
      }
      if (month.production === undefined) {
        month.production = currencyFormatter.format(0);
      }
    });

    // Inject auto-generated line items: for media keys with no existing items, add all.
    // For media keys that already have items, add only NEW items (by ID) without replacing existing.
    Object.entries(allLineItems).forEach(([mediaKey, generatedList]) => {
      deepCopiedMonths.forEach((m) => {
        if (!m.lineItems) m.lineItems = {}
        const li = m.lineItems as Record<string, BillingLineItemType[]>
        const existing = li[mediaKey]

        if (!existing || existing.length === 0) {
          // No existing items for this media type — inject all generated
          li[mediaKey] = generatedList
        } else {
          const existingIds = new Set(existing.map((item) => billingLineItemIdKey(item.id)))
          const newItems = generatedList.filter((item) => {
            const kid = billingLineItemIdKey(item.id)
            return Boolean(kid) && !existingIds.has(kid)
          })
          if (newItems.length > 0) {
            li[mediaKey] = [...existing, ...newItems]
          }
        }
      })
    })

    if (!hasPersistedBillingScheduleRef.current) {
      // Second pass: for months that have mediaCosts > $0 for a media type but no lineItems,
      // generate line items from media containers so they appear as editable rows in the modal.
      // This handles saved billing that only had month-level mediaCosts without line item breakdown.
      // Skipped after version hydration: container-derived rows would overwrite authoritative saved amounts.
      deepCopiedMonths.forEach((m) => {
        if (!m.lineItems) m.lineItems = {}
        const li = m.lineItems as Record<string, BillingLineItemType[]>

        Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems: containerItems, key }]) => {
          if (!form.getValues(mediaTypeKey as any) || !containerItems?.length) return
          // Already has line items for this key — skip
          if (li[key] && li[key].length > 0) return
          // Check if mediaCosts has a non-zero value for this key
          const mediaCostVal =
            parseFloat(String((m.mediaCosts as any)?.[key] ?? "$0").replace(/[^0-9.-]/g, "")) || 0
          if (mediaCostVal <= 0) return

          // Generate from container data so user can see and edit individual line items
          const generated = generateBillingLineItems(containerItems, key, deepCopiedMonths, "billing")
          if (generated.length > 0) {
            li[key] = generated
          }
        })
      })

      // Recalculate mediaCosts from line items for months where we just generated them,
      // so the modal subtotals match the line item amounts (not the old mediaCosts strings).
      const currFmt = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      deepCopiedMonths.forEach((m) => {
        if (!m.lineItems) return
        let mediaTotalNum = 0
        Object.entries(m.lineItems).forEach(([mk, items]) => {
          const arr = items as BillingLineItemType[]
          if (!arr?.length) return
          const sum = arr.reduce((s, item) => s + (item.monthlyAmounts?.[m.monthYear] || 0), 0)
          if (m.mediaCosts && mk in m.mediaCosts) {
            ;(m.mediaCosts as Record<string, string>)[mk] = currFmt.format(sum)
          }
          if (mk !== "production") mediaTotalNum += sum
        })
        m.mediaTotal = currFmt.format(mediaTotalNum)
        const fee = parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0
        const adserv = parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0
        const prod = parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0
        m.totalAmount = currFmt.format(mediaTotalNum + fee + adserv + prod)
      })
    }

    setManualBillingMonths(deepCopiedMonths)
    // UI-only state: reset pre-bill toggles for cost rows on open
    setManualBillingCostPreBill({ fee: false, adServing: false, production: false })
    manualBillingCostPreBillSnapshotRef.current = {}
    setIsManualBillingModalOpen(true)
  }

  async function handleDownloadBillingScheduleExcel() {
    if (!workingBillingMonths.length) {
      toast({
        title: "Nothing to export",
        description: "No billing schedule available. Select campaign dates to generate.",
        variant: "destructive",
      })
      return
    }
    try {
      let monthsForExport = workingBillingMonths
      if (!billingMonthsHaveDetailedLineItems(workingBillingMonths)) {
        const fv = form.getValues()
        const mediaTypeMap = {
          mp_television: { lineItems: televisionMediaLineItems, key: "television" },
          mp_radio: { lineItems: radioMediaLineItems, key: "radio" },
          mp_newspaper: { lineItems: newspaperMediaLineItems, key: "newspaper" },
          mp_magazines: { lineItems: magazinesMediaLineItems, key: "magazines" },
          mp_ooh: { lineItems: oohMediaLineItems, key: "ooh" },
          mp_cinema: { lineItems: cinemaMediaLineItems, key: "cinema" },
          mp_digidisplay: { lineItems: digitalDisplayMediaLineItems, key: "digiDisplay" },
          mp_digiaudio: { lineItems: digitalAudioMediaLineItems, key: "digiAudio" },
          mp_digivideo: { lineItems: digitalVideoMediaLineItems, key: "digiVideo" },
          mp_bvod: { lineItems: bvodMediaLineItems, key: "bvod" },
          mp_search: { lineItems: searchMediaLineItems, key: "search" },
          mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
          mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
          mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
          mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
          mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
          mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
          mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
          mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
          mp_production: { lineItems: consultingMediaLineItems, key: "production" },
        }
        monthsForExport = prepareBillingMonthsForLineItemExport(
          workingBillingMonths,
          mediaTypeMap,
          (mpKey) => Boolean(fv[mpKey as keyof typeof fv])
        )
      }
      const fv = form.getValues()
      const start = fv.mp_campaigndates_start
      const end = fv.mp_campaigndates_end
      const blob = await buildBillingScheduleExcelBlob(monthsForExport, {
        client: fv.mp_clientname || "",
        brand: fv.mp_brand || "",
        campaignName: fv.mp_campaignname || "",
        mbaNumber: fv.mbanumber || mbaNumber || "",
        planVersion: fv.mp_plannumber || "",
        campaignStartLabel: start ? format(start, "dd/MM/yyyy") : "",
        campaignEndLabel: end ? format(end, "dd/MM/yyyy") : "",
      })
      const stem = `BillingSchedule_${sanitizeFilenamePart(fv.mp_clientname)}_${sanitizeFilenamePart(fv.mbanumber || mbaNumber)}_${format(new Date(), "yyyyMMdd")}`
      saveAs(blob, `${stem}.xlsx`)
      toast({ title: "Downloaded", description: "Billing schedule Excel export is ready." })
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not generate Excel file.",
        variant: "destructive",
      })
    }
  }

  function handleManualBillingChange(
    index: number,
    type: 'media' | 'fee' | 'adServing' | 'production' | 'lineItem',
    rawValue: string,
    mediaKey?: string,
    lineItemId?: string,
    monthYear?: string
  ) {
    const copy = [...manualBillingMonths]
    const numericValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0;
    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    const formattedValue = formatter.format(numericValue);

    // Handle line item changes (grid reads from month[0]; saved state may clone line items per month, so sync all)
    if (type === 'lineItem' && mediaKey && lineItemId && monthYear) {
      const monthIndex = copy.findIndex((m) => m.monthYear === monthYear);
      if (monthIndex >= 0) {
        syncLineItemMonthlyAmountAcrossAllMonthRows(
          copy,
          mediaKey,
          lineItemId,
          monthYear,
          numericValue
        );
        const liKey = mediaKey as keyof NonNullable<BillingMonth["lineItems"]>
        const lineItemsForTotals =
          (copy[0]?.lineItems?.[liKey] as BillingLineItemType[] | undefined) ??
          copy
            .map((m) => m.lineItems?.[liKey] as BillingLineItemType[] | undefined)
            .find((a) => a && a.length > 0);
        if (lineItemsForTotals?.length) {
            const mediaTypeTotal = lineItemsForTotals.reduce(
              (sum, li) => sum + (li.monthlyAmounts[monthYear] || 0),
              0
            );
            if (!copy[monthIndex].mediaCosts) {
              copy[monthIndex].mediaCosts = {
                search: formatter.format(0),
                socialMedia: formatter.format(0),
                television: formatter.format(0),
                radio: formatter.format(0),
                newspaper: formatter.format(0),
                magazines: formatter.format(0),
                ooh: formatter.format(0),
                cinema: formatter.format(0),
                digiDisplay: formatter.format(0),
                digiAudio: formatter.format(0),
                digiVideo: formatter.format(0),
                bvod: formatter.format(0),
                integration: formatter.format(0),
                progDisplay: formatter.format(0),
                progVideo: formatter.format(0),
                progBvod: formatter.format(0),
                progAudio: formatter.format(0),
                progOoh: formatter.format(0),
                influencers: formatter.format(0),
                production: formatter.format(0),
              }
            }
            const mediaCosts = copy[monthIndex].mediaCosts;
            if (mediaCosts) {
              (mediaCosts as any)[mediaKey] = formatter.format(mediaTypeTotal);
            }
        }
      }
    }

    // Initialize mediaCosts if it doesn't exist
    if (!copy[index].mediaCosts) {
      copy[index].mediaCosts = {
        search: formatter.format(0),
        socialMedia: formatter.format(0),
        television: formatter.format(0),
        radio: formatter.format(0),
        newspaper: formatter.format(0),
        magazines: formatter.format(0),
        ooh: formatter.format(0),
        cinema: formatter.format(0),
        digiDisplay: formatter.format(0),
        digiAudio: formatter.format(0),
        digiVideo: formatter.format(0),
        bvod: formatter.format(0),
        integration: formatter.format(0),
        progDisplay: formatter.format(0),
        progVideo: formatter.format(0),
        progBvod: formatter.format(0),
        progAudio: formatter.format(0),
        progOoh: formatter.format(0),
      influencers: formatter.format(0),
      production: formatter.format(0),
      };
    }

    // Dynamically update the correct value
    if (type === 'media' && mediaKey && copy[index].mediaCosts.hasOwnProperty(mediaKey)) {
      copy[index].mediaCosts[mediaKey] = formattedValue;
      if (mediaKey === 'production') {
        copy[index].production = formattedValue;
      }
    } else if (type === 'fee') {
      copy[index].feeTotal = formattedValue;
    } else if (type === 'adServing') {
      copy[index].adservingTechFees = formattedValue;
    } else if (type === 'production') {
      copy[index].production = formattedValue;
      if (copy[index].mediaCosts.hasOwnProperty('production')) {
        copy[index].mediaCosts.production = formattedValue;
      }
    }

    if (copy[index].production === undefined) {
      copy[index].production = formatter.format(0);
    }

    // Recalculate totals for the affected month
    const mediaTotal = Object.entries(copy[index].mediaCosts).reduce((sum, [key, current]) => {
      if (key === 'production') return sum;
      return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, '')) || 0);
    }, 0);
    
    const feeTotal = parseFloat(copy[index].feeTotal.replace(/[^0-9.-]/g, '')) || 0;
    const adServingTotal = parseFloat(copy[index].adservingTechFees.replace(/[^0-9.-]/g, '')) || 0;
    const productionTotal = parseFloat((copy[index].production || copy[index].mediaCosts.production || '0').replace(/[^0-9.-]/g, '')) || 0;

    copy[index].mediaTotal = formatter.format(mediaTotal);
    copy[index].totalAmount = formatter.format(mediaTotal + feeTotal + adServingTotal + productionTotal);

    setManualBillingMonths(copy)
  }

  const recalculateManualBillingTotals = (months: BillingMonth[], formatter: Intl.NumberFormat) => {
    months.forEach((m) => {
      const mediaTotalNumber = Object.entries(m.mediaCosts || {}).reduce((sum, [key, current]) => {
        if (key === "production") return sum
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, "")) || 0)
      }, 0)

      const feeTotal = parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0
      const adServingTotal = parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0
      const productionTotal = parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0

      m.mediaTotal = formatter.format(mediaTotalNumber)
      m.totalAmount = formatter.format(mediaTotalNumber + feeTotal + adServingTotal + productionTotal)
    })

    return months.reduce(
      (acc, m) => acc + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0),
      0
    )
  }

  function handleManualBillingLineItemPreBillToggle(mediaKey: string, lineItemId: string, nextChecked: boolean) {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
    const monthYears = copy.map((m) => m.monthYear)

    // Determine the desired distribution (robust even if line items are not shared by reference across months)
    const firstMonthLineItems = copy[0]?.lineItems?.[mediaKey as any] as BillingLineItemType[] | undefined
    if (!firstMonthLineItems) return
    const firstLineItem = firstMonthLineItems.find((li) => li.id === lineItemId)
    if (!firstLineItem) return

    const desired: Record<string, number> = {}
    if (nextChecked) {
      const total = monthYears.reduce((sum, monthYear) => sum + (firstLineItem.monthlyAmounts?.[monthYear] || 0), 0)
      monthYears.forEach((monthYear, idx) => {
        desired[monthYear] = idx === 0 ? total : 0
      })
    } else if (firstLineItem.preBillSnapshot) {
      monthYears.forEach((monthYear) => {
        desired[monthYear] = firstLineItem.preBillSnapshot?.[monthYear] || 0
      })
    } else {
      return
    }

    // Apply to this line item across all months
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as any] as BillingLineItemType[] | undefined
      if (!monthLineItems) return
      const li = monthLineItems.find((x) => x.id === lineItemId)
      if (!li) return

      if (nextChecked) {
        li.preBillSnapshot = li.preBillSnapshot ?? { ...li.monthlyAmounts }
      }
      monthYears.forEach((monthYear) => {
        li.monthlyAmounts[monthYear] = desired[monthYear] || 0
      })
      li.totalAmount = monthYears.reduce((sum, monthYear) => sum + (li.monthlyAmounts?.[monthYear] || 0), 0)
      li.preBill = nextChecked
    })

    // Recalculate this media type total for every month
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as any] as BillingLineItemType[] | undefined
      if (!monthLineItems) return
      const mediaTypeTotal = monthLineItems.reduce((sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0), 0)
      ;(month.mediaCosts as any)[mediaKey] = formatter.format(mediaTypeTotal)
    })

    recalculateManualBillingTotals(copy, formatter)
    setManualBillingMonths(copy)
  }

  function handleManualBillingCostPreBillToggle(costKey: "fee" | "adServing" | "production", nextChecked: boolean) {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })

    const getValue = (m: BillingMonth) => {
      if (costKey === "fee") return m.feeTotal || "$0.00"
      if (costKey === "adServing") return m.adservingTechFees || "$0.00"
      return m.production || "$0.00"
    }

    const setValue = (m: BillingMonth, v: string) => {
      if (costKey === "fee") m.feeTotal = v
      else if (costKey === "adServing") m.adservingTechFees = v
      else {
        m.production = v
        if (m.mediaCosts?.production !== undefined) {
          m.mediaCosts.production = v
        }
      }
    }

    if (nextChecked) {
      manualBillingCostPreBillSnapshotRef.current[costKey] = copy.map((m) => getValue(m))
      const total = copy.reduce((acc, m) => acc + (parseFloat(getValue(m).replace(/[^0-9.-]/g, "")) || 0), 0)
      copy.forEach((m, idx) => setValue(m, formatter.format(idx === 0 ? total : 0)))
    } else {
      const snapshot = manualBillingCostPreBillSnapshotRef.current[costKey]
      if (snapshot && snapshot.length === copy.length) {
        copy.forEach((m, idx) => setValue(m, snapshot[idx] ?? formatter.format(0)))
      }
      manualBillingCostPreBillSnapshotRef.current[costKey] = undefined
    }

    recalculateManualBillingTotals(copy, formatter)
    setManualBillingMonths(copy)
    setManualBillingCostPreBill((prev) => ({ ...prev, [costKey]: nextChecked }))
  }

  /**
   * Level 1 — cost-bucket reset (modal draft): copy fee / tech fee / production strings from **auto reference**
   * aggregates only (`autoReferenceBillingMonthsRef` mirrors burst-derived `autoReferenceBillingMonths`).
   */
  function handleManualBillingCostResetToAuto(costKey: "fee" | "adServing" | "production") {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    applyCostBucketFromAutoReferenceAggregates(copy, autoReferenceBillingMonthsRef.current, costKey, formatter)

    // Clear pre-bill state for this cost key
    setManualBillingCostPreBill((prev) => ({ ...prev, [costKey]: false }))
    manualBillingCostPreBillSnapshotRef.current[costKey] = undefined

    recalculateManualBillingTotals(copy, formatter)
    setManualBillingMonths(copy)
  }

  const generateMBANumber = async (mbaidentifier: string) => {
    try {
      const response = await fetch(`/api/mediaplans/mbanumber?mbaidentifier=${mbaidentifier}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate MBA number")
      }
      const data = await response.json()
      if (data.mbanumber) {
        form.setValue("mbanumber", data.mbanumber)
        setContextMbaNumber(data.mbanumber)
      } else {
        throw new Error("MBA number not found in response")
      }
    } catch (error) {
      console.error("Error generating MBA number:", error)
      form.setValue("mbanumber", "Error generating MBA number")
      setContextMbaNumber("")
    }
  }

  // Helper function to get media type headers for line items display
  const getMediaTypeHeaders = useCallback((mediaType: string): { header1: string; header2: string } => {
    switch (mediaType) {
      case 'television':
        return { header1: 'Network', header2: 'Station' };
      case 'radio':
        return { header1: 'Network', header2: 'Station' };
      case 'newspaper':
      case 'magazines':
        return { header1: 'Publisher', header2: 'Title' };
      case 'digiDisplay':
      case 'digiAudio':
      case 'digiVideo':
      case 'bvod':
        return { header1: 'Publisher', header2: 'Site' };
      case 'search':
      case 'socialMedia':
      case 'progDisplay':
      case 'progVideo':
      case 'progBvod':
      case 'progAudio':
      case 'progOoh':
        return { header1: 'Platform', header2: 'Targeting' };
      case 'ooh':
        return { header1: 'Network', header2: 'Format' };
      case 'cinema':
        return { header1: 'Network', header2: 'Format' };
      case 'production':
        return { header1: 'Production', header2: 'Item' };
      default:
        return { header1: 'Item', header2: 'Details' };
    }
  }, []);

  // Helper function to generate billing line items from media line items (similar to create page)
  const generateBillingLineItems = useCallback((
    mediaLineItems: any[],
    mediaType: string,
    months: { monthYear: string }[],
    mode: "billing" | "delivery" = "billing"
  ): BillingLineItemType[] => {
    if (!mediaLineItems || mediaLineItems.length === 0) return [];

    const lineItemsMap = new Map<string, BillingLineItemType>();
    const monthKeys = months.map(m => m.monthYear);

    mediaLineItems.forEach((lineItem, index) => {
      const { header1, header2 } = getScheduleHeaders(mediaType, lineItem);
      const itemId = billingStableLineItemId(mediaType, lineItem, index);
      const clientPaysForMedia = Boolean(
        (lineItem as any)?.client_pays_for_media ?? (lineItem as any)?.clientPaysForMedia
      );

      // Initialize monthly amounts
      const monthlyAmounts: Record<string, number> = {};
      monthKeys.forEach(key => monthlyAmounts[key] = 0);

      // Parse bursts and distribute across months
      let bursts = [];
      if (typeof lineItem.bursts_json === 'string') {
        try {
          bursts = JSON.parse(lineItem.bursts_json);
        } catch (e) {
          // Error parsing bursts_json - continue with empty bursts
        }
      } else if (Array.isArray(lineItem.bursts_json)) {
        bursts = lineItem.bursts_json;
      } else if (Array.isArray(lineItem.bursts)) {
        bursts = lineItem.bursts;
      }

      const inferredLineItemFeePct = (() => {
        // Some containers (e.g. Social Media) store `budget_includes_fees` on the LINE ITEM, not per-burst,
        // and do not include fee % in `bursts_json`. In those cases we infer fee% from totalMedia vs raw budgets.
        const budgetIncludesFees = Boolean(
          (lineItem as any)?.budget_includes_fees ?? (lineItem as any)?.budgetIncludesFees
        );
        if (!budgetIncludesFees) return 0;

        const parseMoney = (v: any) =>
          parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

        const sumRawBudgets = (bursts || []).reduce((sum: number, b: any) => {
          const raw = parseMoney(b?.budget) || parseMoney(b?.buyAmount);
          return sum + raw;
        }, 0);

        const totalMediaRaw =
          (lineItem as any)?.totalMedia ?? (lineItem as any)?.total_media ?? 0;
        const totalMedia = typeof totalMediaRaw === "number" ? totalMediaRaw : parseMoney(totalMediaRaw);

        if (sumRawBudgets <= 0) return 0;
        const pct = (1 - totalMedia / sumRawBudgets) * 100;
        return Math.max(0, Math.min(100, pct));
      })();

      // Distribute each burst across months.
      // IMPORTANT: line item amounts should reflect *media* only (net of fees when budget includes fees),
      // and should be $0 in billing mode when the client pays for media.
      bursts.forEach((burst: any) => {
          const startDate = new Date(burst.startDate);
          const endDate = new Date(burst.endDate);
          const budget = parseFloat(burst.budget?.replace(/[^0-9.-]/g, '') || '0') || 
                        parseFloat(burst.buyAmount?.replace(/[^0-9.-]/g, '') || '0') || 0;

          const feePctRaw =
            (burst.feePercentage ?? burst.fee_percentage ??
              (lineItem as any)?.feePercentage ?? (lineItem as any)?.fee_percentage) as any;
          const feePctCandidate = Number(feePctRaw);
          const feePct = Number.isFinite(feePctCandidate)
            ? Math.max(0, Math.min(100, feePctCandidate))
            : inferredLineItemFeePct;

          const budgetIncludesFees = Boolean(
            burst.budgetIncludesFees ??
              burst.budget_includes_fees ??
              (lineItem as any)?.budgetIncludesFees ??
              (lineItem as any)?.budget_includes_fees
          );
          const burstClientPaysForMedia = Boolean(
            burst.clientPaysForMedia ??
              burst.client_pays_for_media ??
              (lineItem as any)?.clientPaysForMedia ??
              (lineItem as any)?.client_pays_for_media ??
              clientPaysForMedia
          );

          // Convert "budget" into the net media amount used for schedule line items
          const netMedia = budgetIncludesFees ? (budget * (100 - feePct)) / 100 : budget;
          const effectiveBudget =
            mode === "billing"
              ? (burstClientPaysForMedia ? 0 : netMedia)
              : netMedia; // delivery schedule should always reflect delivered media

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || effectiveBudget === 0) return;

          // Normalise burst endpoints to local midnight so day counts don't drift
          // when bursts come from UTC ISO strings (e.g. "2026-05-30T14:00:00.000Z").
          const sLocalMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const eLocalMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

          const daysTotal =
            Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (daysTotal <= 0) return;

          // Walk months by constructing fresh first-of-month Dates instead of mutating
          // with setMonth/setDate, which has a rollover bug: e.g. setting month=June on
          // a Date whose day is 31 normalises to 1 July, silently skipping June.
          let currentDate = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1);
          const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1);

          while (currentDate <= lastMonthCursor) {
            const monthKey = format(currentDate, "MMMM yyyy");
            if (monthlyAmounts.hasOwnProperty(monthKey)) {
              const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
              const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
              const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime());
              const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime());
              const daysInMonth =
                Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1;
              if (daysInMonth > 0) {
                const share = effectiveBudget * (daysInMonth / daysTotal);
                monthlyAmounts[monthKey] += share;
              }
            }
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
          }
        });

      // Calculate fee amounts per month for this line item
      const feeMonthlyAmounts: Record<string, number> = {}
      const adServingMonthlyAmounts: Record<string, number> = {}
      monthKeys.forEach((key) => {
        feeMonthlyAmounts[key] = 0
        adServingMonthlyAmounts[key] = 0
      })

      bursts.forEach((burst: any) => {
        const startDate = new Date(burst.startDate)
        const endDate = new Date(burst.endDate)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return

        const sLocalMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const eLocalMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

        const budget =
          parseFloat(burst.budget?.replace?.(/[^0-9.-]/g, "") || String(burst.budget || "0")) ||
          parseFloat(burst.buyAmount?.replace?.(/[^0-9.-]/g, "") || String(burst.buyAmount || "0")) ||
          0

        const feePctRaw = (burst.feePercentage ??
          burst.fee_percentage ??
          (lineItem as any)?.feePercentage ??
          (lineItem as any)?.fee_percentage) as any
        const feePctCandidate = Number(feePctRaw)
        const feePct = Number.isFinite(feePctCandidate)
          ? Math.max(0, Math.min(100, feePctCandidate))
          : inferredLineItemFeePct

        const budgetIncludesFees = Boolean(
          burst.budgetIncludesFees ??
            burst.budget_includes_fees ??
            (lineItem as any)?.budgetIncludesFees ??
            (lineItem as any)?.budget_includes_fees
        )
        const burstClientPaysForMedia = Boolean(
          burst.clientPaysForMedia ??
            burst.client_pays_for_media ??
            (lineItem as any)?.clientPaysForMedia ??
            (lineItem as any)?.client_pays_for_media ??
            clientPaysForMedia
        )

        // Fee calculation
        let feeForBurst = 0
        if (budget > 0 && feePct > 0) {
          if (budgetIncludesFees) {
            feeForBurst = (budget * feePct) / 100
          } else if (feePct < 100) {
            feeForBurst = burstClientPaysForMedia
              ? (budget / (100 - feePct)) * feePct
              : (budget * feePct) / (100 - feePct)
          }
        }
        if (mode === "billing" && burstClientPaysForMedia) feeForBurst = 0

        // Ad serving calculation
        const deliverables = Number(burst.deliverables || 0)
        const noAdserving = Boolean(burst.noAdserving)
        let adServingForBurst = 0
        if (!noAdserving && deliverables > 0) {
          const buyType = burst.buyType?.toLowerCase?.() || ""
          const isCpm = buyType === "cpm"
          const rate = getRateForMediaType(mediaType)
          adServingForBurst = isCpm ? (deliverables / 1000) * rate : deliverables * rate
        }

        const daysTotal =
          Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (daysTotal <= 0) return

        let currentDate = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1)
        const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1)

        while (currentDate <= lastMonthCursor) {
          const monthKey = format(currentDate, "MMMM yyyy")
          if (feeMonthlyAmounts.hasOwnProperty(monthKey)) {
            const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
            const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
            const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime())
            const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime())
            const daysInMonth =
              Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1
            if (daysInMonth > 0) {
              const ratio = daysInMonth / daysTotal
              feeMonthlyAmounts[monthKey] += feeForBurst * ratio
              adServingMonthlyAmounts[monthKey] += adServingForBurst * ratio
            }
          }
          currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        }
      })

      const totalFeeAmount = Object.values(feeMonthlyAmounts).reduce((sum, val) => sum + val, 0)
      const totalAdServingAmount = Object.values(adServingMonthlyAmounts).reduce((sum, val) => sum + val, 0)

      // Create or update line item
      const totalAmount = Object.values(monthlyAmounts).reduce((sum, val) => sum + val, 0);
      lineItemsMap.set(itemId, {
        id: itemId,
        header1,
        header2,
        monthlyAmounts,
        totalAmount,
        feeMonthlyAmounts,
        totalFeeAmount,
        adServingMonthlyAmounts,
        totalAdServingAmount,
        ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
      });
    });

    return Array.from(lineItemsMap.values());
  }, [getRateForMediaType]);

  /**
   * Level 2 — per–line-item reset (modal draft): copy that row from the auto template built as
   * `attachLineItemsToMonths(deepClone(autoReferenceBillingMonths), "billing")` — same source as append-merge,
   * not ad-hoc container regen during the click handler.
   */
  const handleManualBillingLineItemResetToAuto = useCallback((mediaKey: string, lineItemId: string) => {
    const autoAgg = autoReferenceBillingMonthsRef.current
    if (!autoAgg.length) {
      toast({
        variant: "destructive",
        title: "Cannot reset this line",
        description:
          "No auto billing reference. Set campaign dates and bursts, or open Edit Billing and use Reset billing to auto there.",
      })
      return
    }

    const template = attachLineItemsToMonthsRef.current(
      deepCloneBillingMonthsState(autoAgg),
      "billing"
    )
    const copy = deepCloneBillingMonthsState(manualBillingMonths)
    const ok = copySingleLineItemFromAutoTemplate(copy, template, mediaKey, lineItemId)
    if (!ok) {
      toast({
        variant: "destructive",
        title: "Cannot reset this line",
        description: "This row is not present on the auto template for these months.",
      })
      return
    }

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItemType[]
        | undefined
      if (!monthLineItems) return
      const mediaTypeTotal = monthLineItems.reduce((sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0), 0)
      if (month.mediaCosts && mediaKey in month.mediaCosts) {
        ;(month.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal)
      }
    })

    recalculateManualBillingTotals(copy, formatter)
    setManualBillingMonths(copy)
  }, [manualBillingMonths])

  const attachLineItemsToMonths = useCallback((
    months: BillingMonth[],
    mode: "billing" | "delivery"
  ): BillingMonth[] => {
    if (!months || months.length === 0) return [];

    let monthsWithLineItems = [...months];

    const mediaTypeMap: Record<string, { lineItems: any[], key: string }> = {
      'mp_television': { lineItems: televisionMediaLineItems, key: 'television' },
      'mp_radio': { lineItems: radioMediaLineItems, key: 'radio' },
      'mp_newspaper': { lineItems: newspaperMediaLineItems, key: 'newspaper' },
      'mp_magazines': { lineItems: magazinesMediaLineItems, key: 'magazines' },
      'mp_ooh': { lineItems: oohMediaLineItems, key: 'ooh' },
      'mp_cinema': { lineItems: cinemaMediaLineItems, key: 'cinema' },
      'mp_digidisplay': { lineItems: digitalDisplayMediaLineItems, key: 'digiDisplay' },
      'mp_digiaudio': { lineItems: digitalAudioMediaLineItems, key: 'digiAudio' },
      'mp_digivideo': { lineItems: digitalVideoMediaLineItems, key: 'digiVideo' },
      'mp_bvod': { lineItems: bvodMediaLineItems, key: 'bvod' },
      'mp_integration': { lineItems: integrationMediaLineItems, key: 'integration' },
      'mp_production': { lineItems: consultingMediaLineItems, key: 'production' },
      'mp_search': { lineItems: searchMediaLineItems, key: 'search' },
      'mp_socialmedia': { lineItems: socialMediaMediaLineItems, key: 'socialMedia' },
      'mp_progdisplay': { lineItems: progDisplayMediaLineItems, key: 'progDisplay' },
      'mp_progvideo': { lineItems: progVideoMediaLineItems, key: 'progVideo' },
      'mp_progbvod': { lineItems: progBvodMediaLineItems, key: 'progBvod' },
      'mp_progaudio': { lineItems: progAudioMediaLineItems, key: 'progAudio' },
      'mp_progooh': { lineItems: progOohMediaLineItems, key: 'progOoh' },
      'mp_influencers': { lineItems: influencersMediaLineItems, key: 'influencers' },
    };

    const allLineItems: Record<string, BillingLineItemType[]> = {};
    const formValues = form.getValues();

    Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
      const isEnabled = formValues[mediaTypeKey as keyof typeof formValues];
      if (isEnabled && lineItems && lineItems.length > 0) {
        const billingLineItems = generateBillingLineItems(lineItems, key, monthsWithLineItems, mode);
        if (billingLineItems.length > 0) {
          allLineItems[key] = billingLineItems;
        }
      }
    });

    Object.entries(allLineItems).forEach(([key, generatedList]) => {
      monthsWithLineItems = monthsWithLineItems.map((month) => {
        const monthCopy = { ...month }
        if (!monthCopy.lineItems) {
          monthCopy.lineItems = {}
        } else {
          monthCopy.lineItems = { ...monthCopy.lineItems }
        }
        const li = monthCopy.lineItems as Record<string, BillingLineItemType[]>
        const existing = li[key]

        if (!existing || existing.length === 0) {
          li[key] = generatedList
        } else {
          const existingIds = new Set(existing.map((lineItem) => billingLineItemIdKey(lineItem.id)))
          const newItems = generatedList.filter((lineItem) => {
            const kid = billingLineItemIdKey(lineItem.id)
            return Boolean(kid) && !existingIds.has(kid)
          })
          if (newItems.length > 0) {
            li[key] = [...existing, ...newItems]
          }
        }
        return monthCopy
      })
    })

    return monthsWithLineItems
  }, [
    form,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
    consultingMediaLineItems,
    generateBillingLineItems
  ]);

  // Keep ref always current — assigned during render so timeouts / handlers never read a stale `attachLineItemsToMonths`.
  attachLineItemsToMonthsRef.current = attachLineItemsToMonths

  /**
   * Full billing reset — **Edit Billing modal only** (confirmed in dialog). Refreshes auto ref, then replaces
   * **workingBillingMonths** from `autoReferenceBillingMonths` + attached line items. Does not update `savedBillingMonths`
   * until campaign save succeeds.
   */
  const handleResetBillingScheduleToAuto = useCallback(() => {
    if (campaignStartDate && campaignEndDate) {
      calculateBillingSchedule(campaignStartDate, campaignEndDate)
    } else {
      calculateBillingSchedule(null, null)
    }

    const autoRows = autoReferenceBillingMonthsRef.current
    if (!autoRows.length) {
      toast({
        variant: "destructive",
        title: "Cannot reset billing",
        description: "No auto billing schedule yet. Set campaign dates and media bursts first.",
      })
      return
    }

    const next = buildWorkingMonthsFromAutoReference(autoRows, attachLineItemsToMonthsRef.current)
    setWorkingBillingMonths(next)
    workingBillingMonthsRef.current = next
    billingLineItemsFollowAutoRef.current = true
    setIsManualBilling(false)
    setManualBillingMonths([])
    setManualBillingCostPreBill({ fee: false, adServing: false, production: false })
    manualBillingCostPreBillSnapshotRef.current = {}
  }, [calculateBillingSchedule, campaignStartDate, campaignEndDate])

  const runConfirmedFullBillingResetToAuto = useCallback(() => {
    setFullBillingResetConfirmOpen(false)
    setIsManualBillingModalOpen(false)
    setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
    handleResetBillingScheduleToAuto()
    toast({
      title: "Billing reset",
      description: "Schedule replaced from auto reference (bursts + line items). Save the plan to update the stored baseline.",
    })
  }, [handleResetBillingScheduleToAuto])

  const mediaFlagsForBillingStructure = useWatch({
    control: form.control,
    name: [...MEDIA_TYPE_KEYS],
  })

  const billingPlanStructureKey = useMemo(() => {
    const watched = mediaFlagsForBillingStructure
    const flagValues = MEDIA_TYPE_KEYS.reduce<Partial<Record<MediaTypeKey, boolean>>>(
      (acc, key, i) => {
        acc[key] = Array.isArray(watched) ? watched[i] : undefined
        return acc
      },
      {}
    )
    const parts: string[] = []
    const seg = (flag: MediaTypeKey, key: string, items: any[]) => {
      if (!flagValues[flag]) return
      const ids = (items ?? [])
        .map((li: any, i: number) => {
          const id = billingStableLineItemId(key, li, i)
          // Include burst count so the key changes when bursts are added/removed
          let burstCount = 0
          if (typeof li?.bursts_json === 'string') {
            try { burstCount = JSON.parse(li.bursts_json).length } catch {}
          } else if (Array.isArray(li?.bursts_json)) {
            burstCount = li.bursts_json.length
          } else if (Array.isArray(li?.bursts)) {
            burstCount = li.bursts.length
          }
          return `${id}(${burstCount})`
        })
        .slice()
        .sort()
      parts.push(`${flag}#${ids.join(",")}`)
    }
    seg("mp_television", "television", televisionMediaLineItems)
    seg("mp_radio", "radio", radioMediaLineItems)
    seg("mp_newspaper", "newspaper", newspaperMediaLineItems)
    seg("mp_magazines", "magazines", magazinesMediaLineItems)
    seg("mp_ooh", "ooh", oohMediaLineItems)
    seg("mp_cinema", "cinema", cinemaMediaLineItems)
    seg("mp_digidisplay", "digiDisplay", digitalDisplayMediaLineItems)
    seg("mp_digiaudio", "digiAudio", digitalAudioMediaLineItems)
    seg("mp_digivideo", "digiVideo", digitalVideoMediaLineItems)
    seg("mp_bvod", "bvod", bvodMediaLineItems)
    seg("mp_integration", "integration", integrationMediaLineItems)
    seg("mp_production", "production", consultingMediaLineItems)
    seg("mp_search", "search", searchMediaLineItems)
    seg("mp_socialmedia", "socialMedia", socialMediaMediaLineItems)
    seg("mp_progdisplay", "progDisplay", progDisplayMediaLineItems)
    seg("mp_progvideo", "progVideo", progVideoMediaLineItems)
    seg("mp_progbvod", "progBvod", progBvodMediaLineItems)
    seg("mp_progaudio", "progAudio", progAudioMediaLineItems)
    seg("mp_progooh", "progOoh", progOohMediaLineItems)
    seg("mp_influencers", "influencers", influencersMediaLineItems)
    return parts.join("|")
  }, [
    mediaFlagsForBillingStructure,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    consultingMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
  ])

  /** Changes when any *MediaLineItems array gains/loses rows so append re-runs after containers/API hydrate (not only id/burst edits). */
  const billingLineItemsLengthFingerprint = useMemo(() => {
    const n = (a: any[] | undefined) => (Array.isArray(a) ? a.length : 0)
    return [
      n(televisionMediaLineItems),
      n(radioMediaLineItems),
      n(newspaperMediaLineItems),
      n(magazinesMediaLineItems),
      n(oohMediaLineItems),
      n(cinemaMediaLineItems),
      n(digitalDisplayMediaLineItems),
      n(digitalAudioMediaLineItems),
      n(digitalVideoMediaLineItems),
      n(bvodMediaLineItems),
      n(integrationMediaLineItems),
      n(consultingMediaLineItems),
      n(searchMediaLineItems),
      n(socialMediaMediaLineItems),
      n(progDisplayMediaLineItems),
      n(progVideoMediaLineItems),
      n(progBvodMediaLineItems),
      n(progAudioMediaLineItems),
      n(progOohMediaLineItems),
      n(influencersMediaLineItems),
    ].join(",")
  }, [
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    consultingMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
  ])

  useEffect(() => {
    workingBillingMonthsRef.current = workingBillingMonths
  }, [workingBillingMonths])

  /** Version PUT: serialize **workingBillingMonths** (attach line items to a clone only when months lack detail). */
  const buildBillingScheduleForSave = useCallback((): Record<string, any> => {
    const months = workingBillingMonths
    if (!months?.length) {
      return {}
    }

    const typedMonths = months as unknown as import("@/lib/billing/types").BillingMonth[]

    const monthsForJson: import("@/lib/billing/types").BillingMonth[] = billingMonthsHaveDetailedLineItems(months)
      ? typedMonths
      : attachLineItemsToMonths(deepCloneBillingMonths(months), "billing")

    return appendPartialApprovalToBillingSchedule({
      billingSchedule: buildBillingScheduleJSON(monthsForJson),
      metadata: isPartialMBA ? partialApprovalMetadata : null,
    })
  }, [
    workingBillingMonths,
    attachLineItemsToMonths,
    deepCloneBillingMonths,
    isPartialMBA,
    partialApprovalMetadata,
  ])

  const buildDeliveryScheduleForSave = useCallback((): Record<string, any> => {
    const snapshot = deliveryScheduleSnapshotRef.current
    const deliveryMonths =
      snapshot && snapshot.length > 0
        ? deepCloneBillingMonths(snapshot)
        : (autoDeliveryMonths.length > 0
          ? deepCloneBillingMonths(autoDeliveryMonths)
          : deepCloneBillingMonths(workingBillingMonths))

    if (!deliveryMonths || deliveryMonths.length === 0) {
      return {};
    }
    const monthsWithLineItems = attachLineItemsToMonths(deliveryMonths as BillingMonth[], "delivery");
    return buildBillingScheduleJSON(monthsWithLineItems as import("@/lib/billing/types").BillingMonth[]);
  }, [
    attachLineItemsToMonths,
    deepCloneBillingMonths,
    deliveryScheduleSnapshotRef,
    autoDeliveryMonths,
    workingBillingMonths,
  ]);

  /**
   * Single entry point for billing integrity before modal save or campaign save.
   * - blockingErrors: broken rollups, orphan stable-id rows, impossible arithmetic.
   * - preservedManualOverrides: drift from bursts/fees when you intentionally kept manual billing (non-blocking on campaign save).
   */
  const validateBillingBeforeSave = useCallback(
    (months: BillingMonth[], options?: { feeCheck?: boolean }): BillingSaveValidationResult => {
      const feeCheck = options?.feeCheck !== false
      const fmt = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const blockingErrors: string[] = [...collectBillingMonthStructuralBlockingIssues(months, fmt)]
      const preservedManualOverrides: string[] = []

      const first = months[0]
      if (!first?.lineItems || Object.keys(first.lineItems).length === 0) {
        return {
          blockingErrors,
          preservedManualOverrides,
          hasAnyIssue: blockingErrors.length > 0,
        }
      }

      const mediaTypeMap: Record<string, { lineItems: any[]; key: string }> = {
        mp_television: { lineItems: televisionMediaLineItems, key: "television" },
        mp_radio: { lineItems: radioMediaLineItems, key: "radio" },
        mp_newspaper: { lineItems: newspaperMediaLineItems, key: "newspaper" },
        mp_magazines: { lineItems: magazinesMediaLineItems, key: "magazines" },
        mp_ooh: { lineItems: oohMediaLineItems, key: "ooh" },
        mp_cinema: { lineItems: cinemaMediaLineItems, key: "cinema" },
        mp_digidisplay: { lineItems: digitalDisplayMediaLineItems, key: "digiDisplay" },
        mp_digiaudio: { lineItems: digitalAudioMediaLineItems, key: "digiAudio" },
        mp_digivideo: { lineItems: digitalVideoMediaLineItems, key: "digiVideo" },
        mp_bvod: { lineItems: bvodMediaLineItems, key: "bvod" },
        mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
        mp_production: { lineItems: consultingMediaLineItems, key: "production" },
        mp_search: { lineItems: searchMediaLineItems, key: "search" },
        mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
        mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
        mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
        mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
        mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
        mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
        mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
      }

      Object.entries(mediaTypeMap).forEach(([formKey, { lineItems, key }]) => {
        if (!form.getValues(formKey as any) || !lineItems?.length) return
        const expected = generateBillingLineItems(lineItems, key, months, "billing")
        const actualGroup =
          ((first.lineItems as Record<string, BillingLineItemType[]>)?.[key] as BillingLineItemType[]) ?? []
        const unmatchedActual = new Map(actualGroup.map((li) => [li.id, li] as const))

        for (const exp of expected) {
          const act =
            actualGroup.find((li) => li.id === exp.id) ??
            actualGroup.find((li) => billingHeadersMatch(li, exp))
          if (act) unmatchedActual.delete(act.id)

          const currentMediaTotal = act
            ? Object.values(act.monthlyAmounts || {}).reduce((sum, v) => sum + (v || 0), 0)
            : 0
          const mediaDiff = currentMediaTotal - exp.totalAmount
          if (Math.abs(mediaDiff) > 0.01) {
            preservedManualOverrides.push(
              `${key} · "${exp.header1}" / "${exp.header2}": Manual billing total is ${fmt.format(
                currentMediaTotal
              )}; burst-derived media is ${fmt.format(exp.totalAmount)} — OK if you are preserving edited billing.`
            )
          }

          if (feeCheck && act) {
            const sourceLineItem = lineItems.find(
              (item, idx) => billingStableLineItemId(key, item, idx) === exp.id
            )
            const expectedFeeTotal = sourceLineItem ? calculateExpectedLineItemFeeTotal(sourceLineItem) : 0
            const currentFeeEstimate =
              exp.totalAmount > 0
                ? (currentMediaTotal / exp.totalAmount) * expectedFeeTotal
                : expectedFeeTotal
            const feeDiff = currentFeeEstimate - expectedFeeTotal
            if (Math.abs(feeDiff) > 0.01) {
              preservedManualOverrides.push(
                `${key} · "${exp.header1}" / "${exp.header2}": Fee scaling vs bursts differs by ${feeDiff >= 0 ? "+" : "-"}${fmt.format(
                  Math.abs(feeDiff)
                )} (burst-implied ${fmt.format(expectedFeeTotal)}, scaled to your media ${fmt.format(
                  currentFeeEstimate
                )}) — OK if agency fee was edited manually.`
              )
            }
          }
        }

        for (const act of unmatchedActual.values()) {
          const rowTotal = Object.values(act.monthlyAmounts || {}).reduce((s, v) => s + (v || 0), 0)
          const legacy =
            Boolean((act as BillingLineItemType & { legacySaved?: boolean }).legacySaved) ||
            !isStableBillingLineItemId(act.id)
          if (legacy) {
            if (Math.abs(rowTotal) > 0.01) {
              preservedManualOverrides.push(
                `${key} · "${act.header1}" / "${act.header2}": Kept as legacy / unlinked row (${fmt.format(
                  rowTotal
                )}) — not matched to current media containers.`
              )
            }
            continue
          }
          if (Math.abs(rowTotal) <= 0.01) continue
          blockingErrors.push(
            `${key} · "${act.header1}" / "${act.header2}": Billing row uses a current media id but that line item no longer exists (${fmt.format(
              rowTotal
            )} still in billing). Remove the row or set legacySaved on the line item.`
          )
        }
      })

      return {
        blockingErrors,
        preservedManualOverrides,
        hasAnyIssue: blockingErrors.length > 0 || preservedManualOverrides.length > 0,
      }
    },
    [
      form,
      generateBillingLineItems,
      televisionMediaLineItems,
      radioMediaLineItems,
      newspaperMediaLineItems,
      magazinesMediaLineItems,
      oohMediaLineItems,
      cinemaMediaLineItems,
      digitalDisplayMediaLineItems,
      digitalAudioMediaLineItems,
      digitalVideoMediaLineItems,
      bvodMediaLineItems,
      integrationMediaLineItems,
      consultingMediaLineItems,
      searchMediaLineItems,
      socialMediaMediaLineItems,
      progDisplayMediaLineItems,
      progVideoMediaLineItems,
      progBvodMediaLineItems,
      progAudioMediaLineItems,
      progOohMediaLineItems,
      influencersMediaLineItems,
    ]
  )

  const hasBillingMismatch = useMemo(() => {
    if (!isManualBilling) return false
    const source = workingBillingMonths
    if (!source.length) return false
    if (!billingMonthsHaveDetailedLineItems(source)) return false
    const v = validateBillingBeforeSave(source, { feeCheck: false })
    return v.hasAnyIssue
  }, [isManualBilling, workingBillingMonths, validateBillingBeforeSave])

  function handleManualBillingSave(forceIgnoreMismatch?: boolean) {
    if (!forceIgnoreMismatch) {
      const v = validateBillingBeforeSave(manualBillingMonths, { feeCheck: true })
      if (v.blockingErrors.length > 0 || v.preservedManualOverrides.length > 0) {
        setBillingError({
          show: true,
          blockingErrors: v.blockingErrors,
          preservedOverrides: v.preservedManualOverrides,
        })
        return
      }
    }

    const applied = JSON.parse(JSON.stringify(manualBillingMonths)) as BillingMonth[]
    setWorkingBillingMonths(applied)
    workingBillingMonthsRef.current = applied
    // `savedBillingMonths` updates only after a successful campaign/version save — not from modal commit.
    setIsManualBilling(true)
    billingLineItemsFollowAutoRef.current = false
    setIsManualBillingModalOpen(false)
    setManualBillingMonths([])
    setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
    toast({
      title: "Billing applied",
      description: "Working billing schedule updated. Save the plan to persist the new baseline in the version store.",
    })
  }

  // Media type display names mapping
  const mediaTypeDisplayNames: Record<string, string> = {
    mp_television: 'Television',
    mp_radio: 'Radio',
    mp_newspaper: 'Newspaper',
    mp_magazines: 'Magazines',
    mp_ooh: 'OOH',
    mp_cinema: 'Cinema',
    mp_digidisplay: 'Digital Display',
    mp_digiaudio: 'Digital Audio',
    mp_digivideo: 'Digital Video',
    mp_bvod: 'BVOD',
    mp_integration: 'Integration',
  mp_production: 'Production',
    mp_search: 'Search',
    mp_socialmedia: 'Social Media',
    mp_progdisplay: 'Programmatic Display',
    mp_progvideo: 'Programmatic Video',
    mp_progbvod: 'Programmatic BVOD',
    mp_progaudio: 'Programmatic Audio',
    mp_progooh: 'Programmatic OOH',
    mp_influencers: 'Influencers'
  };

  // Helper function to update save status
  const updateSaveStatus = (name: string, status: 'pending' | 'success' | 'error', error?: string) => {
    setSaveStatus(prev => {
      const existing = prev.find(item => item.name === name)
      if (!existing) {
        return [...prev, { name, status, error }]
      }
      return prev.map(item => 
        item.name === name 
          ? { ...item, status, error }
          : item
      )
    })
  }

  const handleSaveAll = async () => {
    setIsSaveModalOpen(true)
    setIsSaving(true)
    
    // Initialize save status
    setSaveStatus([
      { name: 'Media Plan Master', status: 'pending' },
      { name: 'Media Plan Version', status: 'pending' }
    ])
    
    try {
      const formValues = form.getValues()
      let billingOverrideNotices: string[] = []
      const inferredLatest = typeof latestVersionNumber === 'number' ? latestVersionNumber : (typeof mediaPlan?.version_number === 'number' ? mediaPlan.version_number : 0)
      const targetSaveVersion = nextSaveVersionNumber ?? (inferredLatest + 1)
      
      if (!mbaNumber || !mediaPlan?.id) {
        throw new Error("MBA number and media plan ID are required")
      }

      if (
        isManualBilling &&
        workingBillingMonths.length > 0 &&
        !isPartialMBA &&
        workingBillingMonths[0]?.lineItems &&
        Object.keys(workingBillingMonths[0].lineItems).length > 0
      ) {
        const billingValidation = validateBillingBeforeSave(workingBillingMonths, { feeCheck: true })
        billingOverrideNotices = billingValidation.preservedManualOverrides
        if (billingValidation.blockingErrors.length > 0) {
          const list = billingValidation.blockingErrors
          const head = list.slice(0, 4).join(" • ")
          const tail = list.length > 4 ? ` (+${list.length - 4} more in toast)` : ""
          setSaveStatus([
            { name: "Media Plan Master", status: "error", error: "Not run — billing checks failed." },
            { name: "Media Plan Version", status: "error", error: "Not run — billing checks failed." },
            { name: "Billing integrity", status: "error", error: `${head}${tail}` },
          ])
          toast({
            variant: "destructive",
            title: "Cannot save campaign — billing integrity",
            description:
              list.slice(0, 8).join("\n") + (list.length > 8 ? `\n… and ${list.length - 8} more issue(s).` : ""),
          })
          setIsSaving(false)
          return
        }
      }

      // 1. Update media_plan_master (campaign fields only, NOT version_number)
      updateSaveStatus('Media Plan Master', 'pending')
      let masterUpdateResponse: Response
      try {
        masterUpdateResponse = await fetch(`/api/mediaplans/mba/${mbaNumber}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mp_campaignname: formValues.mp_campaignname,
            campaign_status: formValues.mp_campaignstatus,
            campaign_start_date: toDateOnlyString(formValues.mp_campaigndates_start),
            campaign_end_date: toDateOnlyString(formValues.mp_campaigndates_end),
            mp_campaignbudget: formValues.mp_campaignbudget,
          })
        })
      } catch (fetchError) {
        console.error("Network error during master update:", fetchError)
        updateSaveStatus('Media Plan Master', 'error', fetchError instanceof Error ? fetchError.message : String(fetchError))
        throw new Error(`Network error: Failed to connect to API. ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`)
      }
      
      if (!masterUpdateResponse.ok) {
        let errorMessage = "Failed to update media plan master"
        try {
          const error = await masterUpdateResponse.json()
          errorMessage = error.error || error.message || error.details?.message || errorMessage
          console.error("Master update error:", {
            status: masterUpdateResponse.status,
            statusText: masterUpdateResponse.statusText,
            error: error,
            details: error.details
          })
        } catch (e) {
          const text = await masterUpdateResponse.text().catch(() => "")
          console.error("Master update error (non-JSON):", {
            status: masterUpdateResponse.status,
            statusText: masterUpdateResponse.statusText,
            body: text
          })
          errorMessage = `Failed to update media plan master (${masterUpdateResponse.status}: ${masterUpdateResponse.statusText})${text ? ` - ${text}` : ''}`
        }
        updateSaveStatus('Media Plan Master', 'error', errorMessage)
        throw new Error(errorMessage)
      }
      
      updateSaveStatus('Media Plan Master', 'success')
      
      // 2. Billing / delivery JSON — billing always from **workingBillingMonths** (see `buildBillingScheduleForSave`).
      const billingScheduleJSON = buildBillingScheduleForSave();
      const deliveryScheduleJSON = buildDeliveryScheduleForSave();

      // Dev-only logs right before save (required)
      const hasWorkingBillingPayload = workingBillingMonths.length > 0
      const billingScheduleSource = hasWorkingBillingPayload ? "working" : "empty"

      const snapshot = deliveryScheduleSnapshotRef.current
      const deliveryScheduleSource =
        snapshot && snapshot.length > 0
          ? "snapshot"
          : (autoReferenceBillingMonths.length > 0 ? "auto" : "billing")
      const deliveryMonthsSource =
        snapshot && snapshot.length > 0
          ? snapshot
          : (autoReferenceBillingMonths.length > 0 ? autoReferenceBillingMonths : workingBillingMonths)

      if (process.env.NODE_ENV !== "production") {
        console.log(`delivery schedule source = ${deliveryScheduleSource}`, {
          monthCount: deliveryMonthsSource.length,
          firstMonthYear: deliveryMonthsSource[0]?.monthYear,
        })
        console.log(`billing schedule source = ${billingScheduleSource}`, {
          monthCount: workingBillingMonths.length,
          firstMonthYear: workingBillingMonths[0]?.monthYear,
        })
      }

      const shouldEnableProduction = Boolean(
        formValues.mp_production || (consultingMediaLineItems?.length ?? 0) > 0
      )

      // 3. Create new media_plan_versions record using PUT (which creates new version and increments version_number)
      updateSaveStatus('Media Plan Version', 'pending')
      const versionResponse = await fetch(`/api/mediaplans/mba/${mbaNumber}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formValues,
          mp_production: shouldEnableProduction,
          search_bursts: searchBursts,
          social_media_bursts: socialMediaBursts,
          investment_by_month: investmentPerMonth,
          billingSchedule: billingScheduleJSON,
          deliverySchedule: deliveryScheduleJSON,
          // Xano alias safeguard (some environments use snake_case column/input)
          delivery_schedule: deliveryScheduleJSON,
        }),
      })
      
      if (!versionResponse.ok) {
        const error = await versionResponse.json()
        updateSaveStatus('Media Plan Version', 'error', error.error || "Failed to create new version")
        throw new Error(error.error || "Failed to create new version")
      }
      
      const versionData = await versionResponse.json()
      updateSaveStatus('Media Plan Version', 'success')

      /**
       * Persisted billing model (post–campaign save):
       * - **workingBillingMonths** — unchanged; remains the live editor state.
       * - **savedBillingMonths** — deep copy of working; new baseline for “last successful save” / guards.
       * - **autoReferenceBillingMonths** — untouched here; still the calculated reference for resets.
       */
      const snapshotAfterSave = deepCloneBillingMonthsState(workingBillingMonths)
      setSavedBillingMonths(snapshotAfterSave)
      savedBillingMonthsRef.current = snapshotAfterSave
      billingLineItemsFollowAutoRef.current = false
      if (snapshotAfterSave.length > 0) {
        hasPersistedBillingScheduleRef.current = true
        setHasPersistedBillingSchedule(true)
      }

      // Get the version number from the response (PUT endpoint increments it)
      const savedVersionNumber = versionData.nextVersionNumber 
        ?? versionData.version?.version_number 
        ?? versionData.master?.version_number 
        ?? targetSaveVersion
      const nextVersion = savedVersionNumber
      const updatedLatest = Math.max(latestVersionNumber || 0, typeof savedVersionNumber === 'string' ? parseInt(savedVersionNumber, 10) : savedVersionNumber || 0)
      setLatestVersionNumber(updatedLatest)
      setNextSaveVersionNumber(updatedLatest + 1)
      setSelectedVersionNumber(typeof savedVersionNumber === 'string' ? parseInt(savedVersionNumber, 10) : savedVersionNumber)
      const numericSavedVersion = typeof savedVersionNumber === 'string' ? parseInt(savedVersionNumber, 10) : savedVersionNumber
      setAvailableVersions(prev => {
        const existing = prev.some(v => v.version_number === numericSavedVersion)
        const newEntry = {
          id: versionData.version?.id,
          version_number: numericSavedVersion,
          created_at: versionData.version?.created_at ?? Date.now()
        }
        if (existing) {
          return prev.map(v => v.version_number === numericSavedVersion ? { ...v, ...newEntry } : v)
        }
        return [...prev, newEntry]
      })
      
      // 4. Save all line items with new version number
      const savePromises: Promise<any>[] = []
      const clientName = formValues.mp_clientname || selectedClient?.clientname_input || ""
      
      // Need to get the version ID from the created version
      const versionId = versionData.version?.id || versionData.id

      // 4a. Generate + upload documents to Xano (no downloads)
      updateSaveStatus("MBA PDF Upload", "pending")
      updateSaveStatus("Media Plan Upload", "pending")
      const documentUploadPromise = (async () => {
        if (!versionId) {
          throw new Error("Missing media plan version ID for document upload")
        }

        const planVersionForDocs = String(numericSavedVersion || nextVersion || targetSaveVersion)

        const [{ blob: mbaBlob, fileName: mbaFileName }, { blob: mpBlob, fileName: mpFileName }] = await Promise.all([
          generateMbaPdfBlob({ planVersion: planVersionForDocs }),
          generateMediaPlanXlsxBlob({ planVersion: planVersionForDocs }),
        ])

        const mbaPdfFile = new File([mbaBlob], mbaFileName, { type: "application/pdf" })
        const mediaPlanFile = new File([mpBlob], mpFileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })

        const mediaItemsForAaCheck: MediaItems = {
          search: searchItems,
          socialMedia: socialMediaItems,
          digiAudio: digitalAudioItems,
          digiDisplay: digitalDisplayItems,
          digiVideo: digitalVideoItems,
          bvod: bvodItems,
          progDisplay: progDisplayItems,
          progVideo: progVideoItems,
          progBvod: progBvodItems,
          progOoh: progOohItems,
          progAudio: progAudioItems,
          newspaper: newspaperItems,
          magazines: magazinesItems,
          television: televisionItems,
          radio: radioItems,
          ooh: oohItems,
          cinema: cinemaItems,
          integration: integrationItems,
          influencers: influencersItems,
          production: consultingItems,
        }

        let aaMediaPlanFile: File | undefined
        try {
          const pubRes = await fetch("/api/publishers")
          if (pubRes.ok) {
            const publishersForAa = (await pubRes.json()) as Publisher[]
            if (
              planHasAdvertisingAssociatesLineItem(
                mediaItemsForAaCheck,
                publishersForAa,
                shouldIncludeMediaPlanLineItem,
              )
            ) {
              updateSaveStatus("AA Media Plan Upload", "pending")
              try {
                const { blob: aaBlob, fileName: aaFileName } = await generateMediaPlanXlsxBlob({
                  planVersion: planVersionForDocs,
                  variant: "aa",
                })
                aaMediaPlanFile = new File([aaBlob], aaFileName, {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                })
              } catch (genErr: any) {
                console.warn("AA media plan generation failed:", genErr)
                updateSaveStatus(
                  "AA Media Plan Upload",
                  "error",
                  genErr?.message || "Failed to generate AA media plan",
                )
              }
            }
          }
        } catch (aaErr) {
          console.warn("AA media plan generation skipped or failed:", aaErr)
        }

        try {
          await uploadMediaPlanVersionDocuments(versionId, {
            mbaPdf: mbaPdfFile,
            mediaPlan: mediaPlanFile,
            aaMediaPlan: aaMediaPlanFile,
            mpClientName: formValues.mp_clientname || selectedClient?.clientname_input || "",
          })

          updateSaveStatus("MBA PDF Upload", "success")
          updateSaveStatus("Media Plan Upload", "success")
          if (aaMediaPlanFile) {
            updateSaveStatus("AA Media Plan Upload", "success")
          }
        } catch (err: any) {
          const message = err?.message || String(err)
          console.error("Document upload failed:", err)
          updateSaveStatus("MBA PDF Upload", "error", message)
          updateSaveStatus("Media Plan Upload", "error", message)
          if (aaMediaPlanFile) {
            updateSaveStatus("AA Media Plan Upload", "error", message)
          }
        }
      })().catch((err: any) => {
        const message = err?.message || String(err)
        console.error("Document upload failed:", err)
        updateSaveStatus("MBA PDF Upload", "error", message)
        updateSaveStatus("Media Plan Upload", "error", message)
      })
      
      // Initialize save status for enabled media types
      if (formValues.mp_search && searchMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_search, 'pending')
        savePromises.push(
          saveSearchLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), searchMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_search, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_search, 'error', error.message || String(error))
              return { type: 'search', error }
            })
        )
      }
      if (formValues.mp_socialmedia && socialMediaMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_socialmedia, 'pending')
        savePromises.push(
          saveSocialMediaLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), socialMediaMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_socialmedia, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_socialmedia, 'error', error.message || String(error))
              return { type: 'socialmedia', error }
            })
        )
      }
      if (formValues.mp_television && televisionMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_television, 'pending')
        savePromises.push(
          saveTelevisionLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), televisionMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_television, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_television, 'error', error.message || String(error))
              return { type: 'television', error }
            })
        )
      }
      if (formValues.mp_radio && radioMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_radio, 'pending')
        savePromises.push(
          saveRadioLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), radioMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_radio, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_radio, 'error', error.message || String(error))
              return { type: 'radio', error }
            })
        )
      }
      if (formValues.mp_newspaper && newspaperMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_newspaper, 'pending')
        savePromises.push(
          saveNewspaperLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), newspaperMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_newspaper, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_newspaper, 'error', error.message || String(error))
              return { type: 'newspaper', error }
            })
        )
      }
      if (formValues.mp_magazines && magazinesMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_magazines, 'pending')
        savePromises.push(
          saveMagazinesLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), magazinesMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_magazines, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_magazines, 'error', error.message || String(error))
              return { type: 'magazines', error }
            })
        )
      }
      if (formValues.mp_ooh && oohMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_ooh, 'pending')
        savePromises.push(
          saveOOHLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), oohMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_ooh, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_ooh, 'error', error.message || String(error))
              return { type: 'ooh', error }
            })
        )
      }
      if (formValues.mp_cinema && cinemaMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_cinema, 'pending')
        savePromises.push(
          saveCinemaLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), cinemaMediaLineItems, nextVersion)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_cinema, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_cinema, 'error', error.message || String(error))
              return { type: 'cinema', error }
            })
        )
      }
      if (formValues.mp_digidisplay && digitalDisplayMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_digidisplay, 'pending')
        savePromises.push(
          saveDigitalDisplayLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), digitalDisplayMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_digidisplay, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_digidisplay, 'error', error.message || String(error))
              return { type: 'digidisplay', error }
            })
        )
      }
      if (formValues.mp_digiaudio && digitalAudioMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_digiaudio, 'pending')
        savePromises.push(
          saveDigitalAudioLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), digitalAudioMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_digiaudio, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_digiaudio, 'error', error.message || String(error))
              return { type: 'digiaudio', error }
            })
        )
      }
      if (formValues.mp_digivideo && digitalVideoMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_digivideo, 'pending')
        savePromises.push(
          saveDigitalVideoLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), digitalVideoMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_digivideo, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_digivideo, 'error', error.message || String(error))
              return { type: 'digivideo', error }
            })
        )
      }
      if (formValues.mp_bvod && bvodMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_bvod, 'pending')
        savePromises.push(
          saveBVODLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), bvodMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_bvod, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_bvod, 'error', error.message || String(error))
              return { type: 'bvod', error }
            })
        )
      }
      if (formValues.mp_integration && integrationMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_integration, 'pending')
        savePromises.push(
          saveIntegrationLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), integrationMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_integration, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_integration, 'error', error.message || String(error))
              return { type: 'integration', error }
            })
        )
      }
      if (shouldEnableProduction && consultingMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_production, 'pending')
        savePromises.push(
          saveProductionLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), consultingMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_production, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_production, 'error', error.message || String(error))
              return { type: 'consulting', error }
            })
        )
      }
      const progDisplayPayload = buildProgDisplayPayload(progDisplayMediaLineItems);
      if (formValues.mp_progdisplay && progDisplayPayload.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_progdisplay, 'pending')
        savePromises.push(
          saveProgDisplayLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), progDisplayPayload)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_progdisplay, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_progdisplay, 'error', error.message || String(error))
              return { type: 'progdisplay', error }
            })
        )
      }
      if (formValues.mp_progvideo && progVideoMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_progvideo, 'pending')
        savePromises.push(
          saveProgVideoLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), progVideoMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_progvideo, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_progvideo, 'error', error.message || String(error))
              return { type: 'progvideo', error }
            })
        )
      }
      if (formValues.mp_progbvod && progBvodMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_progbvod, 'pending')
        savePromises.push(
          saveProgBVODLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), progBvodMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_progbvod, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_progbvod, 'error', error.message || String(error))
              return { type: 'progbvod', error }
            })
        )
      }
      if (formValues.mp_progaudio && progAudioMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_progaudio, 'pending')
        savePromises.push(
          saveProgAudioLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), progAudioMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_progaudio, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_progaudio, 'error', error.message || String(error))
              return { type: 'progaudio', error }
            })
        )
      }
      if (formValues.mp_progooh && progOohMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_progooh, 'pending')
        savePromises.push(
          saveProgOOHLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), progOohMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_progooh, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_progooh, 'error', error.message || String(error))
              return { type: 'progooh', error }
            })
        )
      }
      if (formValues.mp_influencers && influencersMediaLineItems.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_influencers, 'pending')
        savePromises.push(
          saveInfluencersLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), influencersMediaLineItems)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_influencers, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_influencers, 'error', error.message || String(error))
              return { type: 'influencers', error }
            })
        )
      }
      
      // Execute all saves in parallel
      if (savePromises.length > 0) {
        const results = await Promise.all(savePromises)
        const errors = results.filter(result => result && result.error)
        
        if (errors.length > 0) {
          console.warn('Some media types failed to save:', errors)
        }
      }

      // Wait for document generation+upload (do not throw; errors already handled above)
      await documentUploadPromise
      
      // Refresh media plan data to show updated version
      const refreshResponse = await fetch(`/api/mediaplans/mba/${mbaNumber}?skipLineItems=true`)
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json()
        setMediaPlan(refreshedData)
      }
      
      toast({ 
        title: "Success", 
        description: `Saved as version ${nextVersion}` 
      })

      if (billingOverrideNotices.length > 0) {
        toast({
          title: "Billing — manual differences kept",
          description: `${billingOverrideNotices.length} note(s): your billing differs from burst-based auto (fees/media/legacy rows). This is allowed. Open Manual Billing to review details.`,
        })
      }
      
      // Navigate to mediaplans page after successful save
      setHasUnsavedChanges(false)
      router.push('/mediaplans')
    } catch (error: any) {
      console.error("Error saving:", error)
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save", 
        variant: "destructive" 
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCampaign = async () => {
    setIsSaveModalOpen(true)
    setIsSaving(true)
    try {
      const formData = form.getValues()
      
      const shouldEnableProduction = Boolean(
        formData.mp_production || (consultingMediaLineItems?.length ?? 0) > 0
      )

      // Create new version in media_plan_versions table
      const response = await fetch(`/api/mediaplans/mba/${mbaNumber}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          mp_production: shouldEnableProduction,
          search_bursts: searchBursts,
          social_media_bursts: socialMediaBursts,
          investment_by_month: investmentPerMonth,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save campaign")
      }

      const data = await response.json()
      
      // Then, save search data if search is enabled
      if (formData.mp_search && formData.mbanumber) {
        try {
          // @ts-ignore - Accessing the saveSearchData function from the window object
          if (window.saveSearchData) {
            // @ts-ignore - Calling the saveSearchData function
            await window.saveSearchData(formData.mbanumber)
            console.log("Search data saved successfully")
          } else {
            console.warn("saveSearchData function not found")
          }
        } catch (error) {
          console.error("Failed to save search data:", error)
          // Continue with the media plan update even if search data saving fails
        }
      }

      // Save all media line items for enabled media types
      const mediaTypeSavePromises: Promise<any>[] = [];

      // Television
      if (formData.mp_television && televisionMediaLineItems && televisionMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveTelevisionLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            televisionMediaLineItems
          ).catch(error => {
            console.error('Error saving television data:', error);
            return { type: 'television', error };
          })
        );
      }

      // Radio
      if (formData.mp_radio && radioMediaLineItems && radioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveRadioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            radioMediaLineItems
          ).catch(error => {
            console.error('Error saving radio data:', error);
            return { type: 'radio', error };
          })
        );
      }

      // Newspaper
      if (formData.mp_newspaper && newspaperMediaLineItems && newspaperMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveNewspaperLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            newspaperMediaLineItems
          ).catch(error => {
            console.error('Error saving newspaper data:', error);
            return { type: 'newspaper', error };
          })
        );
      }

      // Magazines
      if (formData.mp_magazines && magazinesMediaLineItems && magazinesMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveMagazinesLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            magazinesMediaLineItems
          ).catch(error => {
            console.error('Error saving magazines data:', error);
            return { type: 'magazines', error };
          })
        );
      }

      // OOH
      if (formData.mp_ooh && oohMediaLineItems && oohMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveOOHLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            oohMediaLineItems
          ).catch(error => {
            console.error('Error saving OOH data:', error);
            return { type: 'ooh', error };
          })
        );
      }

      // Cinema
      if (formData.mp_cinema && cinemaMediaLineItems && cinemaMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveCinemaLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            cinemaMediaLineItems
          ).catch(error => {
            console.error('Error saving cinema data:', error);
            return { type: 'cinema', error };
          })
        );
      }

      // Digital Display
      if (formData.mp_digidisplay && digitalDisplayMediaLineItems && digitalDisplayMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalDisplayLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            digitalDisplayMediaLineItems
          ).catch(error => {
            console.error('Error saving digital display data:', error);
            return { type: 'digidisplay', error };
          })
        );
      }

      // Digital Audio
      if (formData.mp_digiaudio && digitalAudioMediaLineItems && digitalAudioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalAudioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            digitalAudioMediaLineItems
          ).catch(error => {
            console.error('Error saving digital audio data:', error);
            return { type: 'digiaudio', error };
          })
        );
      }

      // Digital Video
      if (formData.mp_digivideo && digitalVideoMediaLineItems && digitalVideoMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalVideoLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            digitalVideoMediaLineItems
          ).catch(error => {
            console.error('Error saving digital video data:', error);
            return { type: 'digivideo', error };
          })
        );
      }

      // BVOD
      if (formData.mp_bvod && bvodMediaLineItems && bvodMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveBVODLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            bvodMediaLineItems
          ).catch(error => {
            console.error('Error saving BVOD data:', error);
            return { type: 'bvod', error };
          })
        );
      }

      // Integration
      if (formData.mp_integration && integrationMediaLineItems && integrationMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveIntegrationLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            integrationMediaLineItems
          ).catch(error => {
            console.error('Error saving integration data:', error);
            return { type: 'integration', error };
          })
        );
      }

      // Production / Consulting
      if (shouldEnableProduction && consultingMediaLineItems && consultingMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProductionLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            consultingMediaLineItems
          ).catch(error => {
            console.error('Error saving production data:', error);
            return { type: 'consulting', error };
          })
        );
      }

      // Search
      if (formData.mp_search && searchMediaLineItems && searchMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveSearchLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            searchMediaLineItems
          ).catch(error => {
            console.error('Error saving search data:', error);
            return { type: 'search', error };
          })
        );
      }

      // Social Media
      if (formData.mp_socialmedia && socialMediaMediaLineItems && socialMediaMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveSocialMediaLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            socialMediaMediaLineItems
          ).catch(error => {
            console.error('Error saving social media data:', error);
            return { type: 'socialmedia', error };
          })
        );
      }

      // Programmatic Display
      const progDisplayPayload = buildProgDisplayPayload(progDisplayMediaLineItems);
      if (formData.mp_progdisplay && progDisplayPayload && progDisplayPayload.length > 0) {
        mediaTypeSavePromises.push(
          saveProgDisplayLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            progDisplayPayload
          ).catch(error => {
            console.error('Error saving programmatic display data:', error);
            return { type: 'progdisplay', error };
          })
        );
      }

      // Programmatic Video
      if (formData.mp_progvideo && progVideoMediaLineItems && progVideoMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgVideoLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            progVideoMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic video data:', error);
            return { type: 'progvideo', error };
          })
        );
      }

      // Programmatic BVOD
      if (formData.mp_progbvod && progBvodMediaLineItems && progBvodMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgBVODLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            progBvodMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic BVOD data:', error);
            return { type: 'progbvod', error };
          })
        );
      }

      // Programmatic Audio
      if (formData.mp_progaudio && progAudioMediaLineItems && progAudioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgAudioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            progAudioMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic audio data:', error);
            return { type: 'progaudio', error };
          })
        );
      }

      // Programmatic OOH
      if (formData.mp_progooh && progOohMediaLineItems && progOohMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgOOHLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            progOohMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic OOH data:', error);
            return { type: 'progooh', error };
          })
        );
      }

      // Influencers
      if (formData.mp_influencers && influencersMediaLineItems && influencersMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveInfluencersLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            influencersMediaLineItems
          ).catch(error => {
            console.error('Error saving influencers data:', error);
            return { type: 'influencers', error };
          })
        );
      }

      // Execute all media type saves in parallel
      if (mediaTypeSavePromises.length > 0) {
        try {
          const results = await Promise.all(mediaTypeSavePromises);
          const errors = results.filter(result => result && result.error);
          
          if (errors.length > 0) {
            console.warn('Some media types failed to save:', errors);
            toast({
              title: 'Partial Success',
              description: `Campaign saved but some media types failed to save. Please check the console for details.`,
              variant: 'destructive'
            });
          } else {
            console.log('All media line items saved successfully');
          }
        } catch (error) {
          console.error('Error saving media line items:', error);
          toast({
            title: 'Warning',
            description: 'Campaign saved but some media data could not be saved. Please try again.',
            variant: 'destructive'
          });
        }
      }
      
      setHasUnsavedChanges(false)
      toast({
        title: "Success",
        description: `Campaign saved successfully as Version ${mediaPlan.version_number + 1}`
      })
    } catch (error: any) {
      console.error("Error saving campaign:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save campaign",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const generateMbaPdfBlob = async (opts?: { planVersion?: string }) => {
    await waitForStateFlush()

    const fv = form.getValues()
    const mbaNum = fv.mbanumber || mbaNumber

    if (!mbaNum) {
      throw new Error("MBA number is required to generate MBA")
    }

    // Build media data from enabled media types
    let finalVisibleMedia: { media_type: string; gross_amount: number }[]
    let totalExGst: number
    let finalTotals: {
      gross_media: number
      service_fee: number
      production: number
      adserving: number
      totals_ex_gst: number
      total_inc_gst: number
    }

    if (isPartialMBA) {
      finalVisibleMedia = Object.entries(partialMBAValues.mediaTotals)
        .map(([mediaKey, amount]) => {
          const medium = mediaTypes.find(m => mediaKeyMap[m.name] === mediaKey)
          return medium
            ? { media_type: medium.label, gross_amount: amount }
            : null
        })
        .filter((item): item is { media_type: string; gross_amount: number } => item !== null)

      totalExGst =
        partialMBAValues.grossMedia +
        partialMBAValues.assembledFee +
        partialMBAValues.adServing +
        partialMBAValues.production

      finalTotals = {
        gross_media: partialMBAValues.grossMedia,
        service_fee: partialMBAValues.assembledFee,
        production: partialMBAValues.production,
        adserving: partialMBAValues.adServing,
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      }
    } else {
      const deliveryTotals = getDeliveryMbaTotals()

      finalVisibleMedia = mediaTypes
        .filter(medium => medium.name !== "mp_production")
        .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
        .map(medium => {
          const billingKey = mediaKeyMap[medium.name]
          const gross_amount =
            billingKey !== undefined ? (deliveryTotals.mediaCostsByKey[billingKey] ?? 0) : 0
          return {
            media_type: medium.label,
            gross_amount,
          }
        })

      totalExGst =
        deliveryTotals.grossMedia +
        deliveryTotals.assembledFee +
        deliveryTotals.adServing +
        deliveryTotals.production

      finalTotals = {
        gross_media: deliveryTotals.grossMedia,
        service_fee: deliveryTotals.assembledFee,
        production: deliveryTotals.production,
        adserving: deliveryTotals.adServing,
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      }
    }

    const billingMonthsExGST = workingBillingMonths.map((month) => ({
      monthYear: month.monthYear,
      totalAmount: month.totalAmount, // already ex GST
    }))

    const resolvedPlanVersion = String(
      opts?.planVersion ||
        fv.mp_plannumber ||
        selectedVersionNumber ||
        (versionNumber ? Number(versionNumber) : null) ||
        mediaPlan?.version_number ||
        latestVersionNumber ||
        1
    )

    const apiData = {
      mba_number: mbaNum,
      mp_client_name: fv.mp_clientname,
      mp_campaignname: fv.mp_campaignname,
      mp_brand: fv.mp_brand,
      mp_ponumber: fv.mp_ponumber,
      mp_plannumber: resolvedPlanVersion,
      mp_campaigndates_start: toDateOnlyString(fv.mp_campaigndates_start),
      mp_campaigndates_end: toDateOnlyString(fv.mp_campaigndates_end),
      clientAddress: clientAddress,
      clientSuburb: clientSuburb,
      clientState: clientState,
      clientPostcode: clientPostcode,
      gross_media: finalVisibleMedia,
      grossMediaTotal: finalTotals.gross_media,
      calculateAssembledFee: finalTotals.service_fee,
      calculateProductionCosts: finalTotals.production,
      calculateAdServingFees: finalTotals.adserving,
      totalInvestment: finalTotals.totals_ex_gst,
      billingMonths: billingMonthsExGST,
    }

    const response = await fetch("/api/mba/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiData),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({} as any))
      throw new Error(errorData.error || errorData.details || "Failed to generate MBA")
    }

    const blob = await response.blob()
    const clientName = fv.mp_clientname || "client"
    const campaignName = fv.mp_campaignname || "campaign"
    const mbaBase = `MBA_${campaignName}`
    const fileName = `${clientName}-${mbaBase}-v${resolvedPlanVersion}.pdf`

    return { blob, fileName, planVersion: resolvedPlanVersion }
  }

  const generateMediaPlanXlsxBlob = async (opts?: { planVersion?: string; variant?: "standard" | "aa" }) => {
    await waitForStateFlush()

    const variant = opts?.variant ?? "standard"

    // fetch and encode logo
    const logoBuf = await fetch("/assembled-logo.png").then(r => r.arrayBuffer())
    const logoBase64 = bufferToBase64(logoBuf)

    const fv = form.getValues()

    const resolvedPlanVersion = String(
      opts?.planVersion ||
        fv.mp_plannumber ||
        selectedVersionNumber ||
        (versionNumber ? Number(versionNumber) : null) ||
        mediaPlan?.version_number ||
        latestVersionNumber ||
        1
    )

    const header: MediaPlanHeader = {
      logoBase64,
      logoWidth: 457,
      logoHeight: 71,
      client: fv.mp_clientname,
      brand: fv.mp_brand,
      campaignName: fv.mp_campaignname,
      mbaNumber: fv.mbanumber || mbaNumber,
      clientContact: fv.mp_clientcontact,
      planVersion: resolvedPlanVersion,
      poNumber: fv.mp_ponumber,
      campaignBudget: new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(fv.mp_campaignbudget),
      campaignStatus: fv.mp_campaignstatus,
      campaignStart: format(fv.mp_campaigndates_start, "dd/MM/yyyy"),
      campaignEnd: format(fv.mp_campaigndates_end, "dd/MM/yyyy"),
    }

    const mediaItems: MediaItems = {
      search: searchItems.filter(shouldIncludeMediaPlanLineItem),
      socialMedia: socialMediaItems.filter(shouldIncludeMediaPlanLineItem),
      digiAudio: digitalAudioItems.filter(shouldIncludeMediaPlanLineItem),
      digiDisplay: digitalDisplayItems.filter(shouldIncludeMediaPlanLineItem),
      digiVideo: digitalVideoItems.filter(shouldIncludeMediaPlanLineItem),
      bvod: bvodItems.filter(shouldIncludeMediaPlanLineItem),
      progDisplay: progDisplayItems.filter(shouldIncludeMediaPlanLineItem),
      progVideo: progVideoItems.filter(shouldIncludeMediaPlanLineItem),
      progBvod: progBvodItems.filter(shouldIncludeMediaPlanLineItem),
      progOoh: progOohItems.filter(shouldIncludeMediaPlanLineItem),
      progAudio: progAudioItems.filter(shouldIncludeMediaPlanLineItem),
      newspaper: newspaperItems.filter(shouldIncludeMediaPlanLineItem),
      magazines: magazinesItems.filter(shouldIncludeMediaPlanLineItem),
      television: televisionItems.filter(shouldIncludeMediaPlanLineItem),
      radio: radioItems.filter(shouldIncludeMediaPlanLineItem),
      ooh: oohItems.filter(shouldIncludeMediaPlanLineItem),
      cinema: cinemaItems.filter(shouldIncludeMediaPlanLineItem),
      integration: integrationItems.filter(shouldIncludeMediaPlanLineItem),
      influencers: influencersItems.filter(shouldIncludeMediaPlanLineItem),
      production: consultingItems.filter(shouldIncludeMediaPlanLineItem),
    }

    // MBA totals for Excel
    const mbaDataGrossMedia = isPartialMBA
      ? Object.entries(partialMBAValues.mediaTotals)
          .map(([mediaKey, amount]) => {
            const medium = mediaTypes.find(m => mediaKeyMap[m.name] === mediaKey)
            return medium ? { media_type: medium.label, gross_amount: amount } : null
          })
          .filter((item): item is { media_type: string; gross_amount: number } => item !== null)
      : mediaTypes
          .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
          .map(medium => ({
            media_type: medium.label,
            gross_amount: calculateMediaTotal(medium.name),
          }))

    const grossForTotals = isPartialMBA ? partialMBAValues.grossMedia : grossMediaTotal
    const productionForTotals = isPartialMBA ? partialMBAValues.production : calculateProductionCosts()

    const totalExGstStandard = isPartialMBA
      ? partialMBAValues.grossMedia +
        partialMBAValues.assembledFee +
        partialMBAValues.adServing +
        partialMBAValues.production
      : calculateTotalInvestment()

    let mediaItemsForWorkbook: MediaItems = mediaItems
    let mbaData: Parameters<typeof generateMediaPlan>[2]

    if (variant === "aa") {
      const pubRes = await fetch("/api/publishers")
      if (!pubRes.ok) {
        throw new Error("Failed to load publishers for Advertising Associates export")
      }
      const publishersList = (await pubRes.json()) as Publisher[]
      const aaFiltered = filterMediaItemsForAdvertisingAssociates(mediaItems, publishersList)
      if (!advertisingAssociatesFilteredPlanHasLineItems(aaFiltered)) {
        throw new Error(
          "No Advertising Associates–billed line items to include in this export after applying publisher filter",
        )
      }
      mediaItemsForWorkbook = aaFiltered
      mbaData = buildAdvertisingAssociatesMbaDataFromMediaItems(aaFiltered)
    } else {
      mbaData = {
        gross_media: mbaDataGrossMedia,
        totals: {
          gross_media: grossForTotals,
          service_fee: isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee(),
          production: productionForTotals,
          adserving: isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees(),
          totals_ex_gst: totalExGstStandard,
          total_inc_gst: totalExGstStandard * 1.1,
        },
      }
    }

    const workbook = await generateMediaPlan(header, mediaItemsForWorkbook, mbaData, {
      mbaTotalsLayout: variant === "aa" ? "aa" : "standard",
    })
    const arrayBuffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    const mediaPlanBase = `MediaPlan_${header.campaignName || "campaign"}`
    const baseFileName = `${header.client || "client"}-${mediaPlanBase}-v${resolvedPlanVersion}.xlsx`
    const fileName = variant === "aa" ? `AA - ${baseFileName}` : baseFileName

    return { blob, fileName, planVersion: resolvedPlanVersion }
  }

  const handleGenerateMBA = async () => {
    setIsLoading(true)
    try {
      const { blob: pdfBlob, fileName } = await generateMbaPdfBlob()

      // Create a URL for the blob
      const url = window.URL.createObjectURL(pdfBlob)

      // Create a temporary link element
      const link = document.createElement("a")
      link.href = url
      link.download = fileName

      // Append the link to the body, click it, and remove it
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Revoke the URL to free up memory
      window.URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: "MBA generated successfully",
      })
    } catch (e: any) {
      console.error("MBA Generation Error:", e)
      toast({ 
        title: "Error", 
        description: e.message || "Failed to generate MBA", 
        variant: "destructive" 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadMediaPlan = async () => {
    setIsDownloading(true)
    try {
      const { blob, fileName } = await generateMediaPlanXlsxBlob()
      saveAs(blob, fileName)

      toast({ title: 'Success', description: 'Media plan generated successfully' })
    } catch (error: any) {
      console.error(error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate media plan',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadAdvertisingAssociatesMediaPlan = async () => {
    if (!hasAdvertisingAssociatesBilling) return
    setIsDownloadingAa(true)
    try {
      const { blob, fileName } = await generateMediaPlanXlsxBlob({ variant: "aa" })
      saveAs(blob, fileName)
      toast({
        title: "Success",
        description: "Advertising Associates media plan downloaded",
      })
    } catch (error: any) {
      console.error(error)
      toast({
        title: "Error",
        description: error.message || "Failed to generate media plan",
        variant: "destructive",
      })
    } finally {
      setIsDownloadingAa(false)
    }
  }

  const handleDownloadNamingConventions = async () => {
    setIsNamingDownloading(true);
    try {
      const { blob, fileName } = await generateNamingConventionsXlsxBlob();
      saveAs(blob, fileName);
      toast({ title: "Success", description: "Naming conventions Excel downloaded" });
    } catch (error: any) {
      console.error("Naming download error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to download naming conventions",
        variant: "destructive",
      });
    } finally {
      setIsNamingDownloading(false);
    }
  };

  const generateNamingConventionsXlsxBlob = async (opts?: { planVersion?: string }) => {
    const fv = form.getValues();
    const namingVersion =
      opts?.planVersion ??
      (fv.mp_plannumber ||
        (selectedVersionNumber ??
          (versionNumber ? Number(versionNumber) : null) ??
          mediaPlan?.version_number ??
          latestVersionNumber ??
          "1"));

    const mediaFlags = Object.fromEntries(
      mediaTypes.map(medium => [medium.name, !!fv[medium.name as keyof MediaPlanFormValues]])
    ) as Record<string, boolean>;

    const workbook = await generateNamingWorkbook({
      advertiser: fv.mp_clientname || "",
      brand: fv.mp_brand || "",
      campaignName: fv.mp_campaignname || "",
      mbaNumber: fv.mbanumber || fv.mbaidentifier || mbaNumber || "",
      startDate: fv.mp_campaigndates_start,
      endDate: fv.mp_campaigndates_end,
      version: String(namingVersion ?? "1"),
      mediaFlags,
      items: {
        search: searchItems,
        socialMedia: socialMediaItems,
        digiAudio: digitalAudioItems,
        digiDisplay: digitalDisplayItems,
        digiVideo: digitalVideoItems,
        bvod: bvodItems,
        integration: integrationItems,
        progDisplay: progDisplayItems,
        progVideo: progVideoItems,
        progBvod: progBvodItems,
        progAudio: progAudioItems,
        progOoh: progOohItems,
      },
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const clientName = fv.mp_clientname || "client";
    const campaignName = fv.mp_campaignname || "mediaPlan";
    const namingBase = `NamingConventions_${campaignName}`;
    const fileName = `${clientName}-${namingBase}-v${String(namingVersion ?? "1")}.xlsx`;
    return { blob, fileName };
  };

  const handleSaveAndDownloadAll = async () => {
    const fv = form.getValues();

    setIsDownloading(true);
    setModalOpen(true);
    setModalLoading(true);
    setModalTitle("Downloading Media Plan");
    setModalOutcome("Preparing your media plan for download...");

    try {
      const [{ blob: mbaBlob, fileName: mbaFileName }, { blob: mediaPlanBlob, fileName: mediaPlanFileName }, { blob: namingBlob, fileName: namingFileName }] = await Promise.all([
        generateMbaPdfBlob(),
        generateMediaPlanXlsxBlob(),
        generateNamingConventionsXlsxBlob(),
      ]);

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(mbaFileName, mbaBlob);
      zip.file(mediaPlanFileName, mediaPlanBlob);
      zip.file(namingFileName, namingBlob);
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const campaignNameSafe = (fv.mp_campaignname || "campaign")
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "-");
      const zipFileName = `${fv.mp_clientname || "client"}-${campaignNameSafe || "campaign"}-all-files.zip`;
      saveAs(zipBlob, zipFileName);

      setModalLoading(false);
      setModalOpen(false);

      await handleSaveAll();
    } catch (error: any) {
      console.error("Error in save and download all:", error);
      setModalLoading(false);
      setModalTitle("Error");
      setModalOutcome(error?.message || "Failed to save and download all files");
      toast({
        title: "Error",
        description: error?.message || "Failed to save and download all files",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  const handleSearchTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setSearchTotal(totalMedia)
    setSearchFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleSocialMediaTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setSocialMediaTotal(totalMedia)
    setSocialMediaFeeTotal(totalFee)
  }, [markUnsavedChanges])

  // Callback handlers for all media type totals (matching create page pattern)
  const handleTelevisionTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setTelevisionTotal(totalMedia)
    setTelevisionFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleRadioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setRadioTotal(totalMedia)
    setRadioFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleNewspaperTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setNewspaperTotal(totalMedia)
    setNewspaperFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleMagazinesTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setMagazinesTotal(totalMedia)
    setMagazinesFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleOohTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setOohTotal(totalMedia)
    setOohFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleCinemaTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setCinemaTotal(totalMedia)
    setCinemaFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleDigitalDisplayTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setDigitalDisplayTotal(totalMedia)
    setDigitalDisplayFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleDigitalAudioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setDigitalAudioTotal(totalMedia)
    setDigitalAudioFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleDigitalVideoTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setDigitalVideoTotal(totalMedia)
    setDigitalVideoFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleBvodTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setBvodTotal(totalMedia)
    setBvodFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleIntegrationTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setIntegrationTotal(totalMedia)
    setIntegrationFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleConsultingTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setConsultingTotal(totalMedia)
    setConsultingFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleProgDisplayTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgDisplayTotal(totalMedia)
    setProgDisplayFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleProgVideoTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgVideoTotal(totalMedia)
    setProgVideoFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleProgBvodTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgBvodTotal(totalMedia)
    setProgBvodFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleProgAudioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgAudioTotal(totalMedia)
    setProgAudioFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleProgOohTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgOohTotal(totalMedia)
    setProgOohFeeTotal(totalFee)
  }, [markUnsavedChanges])

  const handleInfluencersTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setInfluencersTotal(totalMedia)
    setInfluencersFeeTotal(totalFee)
  }, [markUnsavedChanges])

  // Callback handlers for media line items
  const handleTelevisionMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setTelevisionMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleRadioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setRadioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleNewspaperMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setNewspaperMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleMagazinesMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setMagazinesMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setOohMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleCinemaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setCinemaMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigitalDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigitalDisplayMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigitalAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigitalAudioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigitalVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigitalVideoMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setBvodMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleIntegrationMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setIntegrationMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleConsultingMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setConsultingMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleSearchMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setSearchMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleSocialMediaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setSocialMediaMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgDisplayMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  // Ensure Programmatic Display payload always contains the full set of fields
  const buildProgDisplayPayload = useCallback(
    (items: any[]) =>
      (items || []).map((item, idx) => ({
        id: item.id ?? item.line_item_id ?? `${mbaNumber || "PD"}${idx + 1}`,
        media_plan_version: item.media_plan_version ?? 0,
        mba_number: item.mba_number ?? mbaNumber ?? "",
        mp_client_name: item.mp_client_name ?? "",
        mp_plannumber: item.mp_plannumber ?? "",
        platform: item.platform ?? item.publisher ?? "",
        bid_strategy: item.bid_strategy ?? item.bidStrategy ?? "",
        buy_type: item.buy_type ?? item.buyType ?? "",
        creative_targeting: item.creative_targeting ?? item.targeting ?? item.targeting_attribute ?? "",
        creative: item.creative ?? "",
        buying_demo: item.buying_demo ?? "",
        market: item.market ?? "",
        site: item.site ?? "",
        placement: item.placement ?? "",
        size: item.size ?? "",
        targeting_attribute: item.targeting_attribute ?? "",
        fixed_cost_media: item.fixed_cost_media ?? item.fixedCostMedia ?? false,
        client_pays_for_media: item.client_pays_for_media ?? item.clientPaysForMedia ?? false,
        budget_includes_fees: item.budget_includes_fees ?? item.budgetIncludesFees ?? false,
        no_adserving: item.noadserving ?? item.no_adserving ?? false,
        line_item_id: item.line_item_id ?? `${mbaNumber || "PD"}${idx + 1}`,
        bursts_json:
          typeof item.bursts_json === "string"
            ? item.bursts_json
            : JSON.stringify(item.bursts_json ?? item.bursts ?? []),
        line_item: item.line_item ?? idx + 1,
        totalMedia: item.totalMedia ?? item.total_media ?? undefined,
      })),
    [mbaNumber]
  );

  const handleProgVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgVideoMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgBvodMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgAudioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgOohMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleInfluencersMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setInfluencersMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  // Callback handlers for LineItem[] arrays (for Excel generation)
  const handleSearchItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setSearchItems(items);
  }, [markUnsavedChanges]);

  const handleSocialMediaItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setSocialMediaItems(items);
  }, [markUnsavedChanges]);

  const handleTelevisionItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setTelevisionItems(items);
  }, [markUnsavedChanges]);

  const handleRadioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setRadioItems(items);
  }, [markUnsavedChanges]);

  const handleNewspaperItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setNewspaperItems(items);
  }, [markUnsavedChanges]);

  const handleMagazinesItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setMagazinesItems(items);
  }, [markUnsavedChanges]);

  const handleOohItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setOohItems(items);
  }, [markUnsavedChanges]);

  const handleCinemaItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setCinemaItems(items);
  }, [markUnsavedChanges]);

  const handleDigitalDisplayItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigitalDisplayItems(items);
  }, [markUnsavedChanges]);

  const handleDigitalAudioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigitalAudioItems(items);
  }, [markUnsavedChanges]);

  const handleDigitalVideoItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigitalVideoItems(items);
  }, [markUnsavedChanges]);

  const handleBvodItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setBvodItems(items);
  }, [markUnsavedChanges]);

  const handleIntegrationItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setIntegrationItems(items);
  }, [markUnsavedChanges]);

  const handleInfluencersItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setInfluencersItems(items);
  }, [markUnsavedChanges]);

  const handleConsultingItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setConsultingItems(items);
  }, [markUnsavedChanges]);

  const handleProgDisplayItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgDisplayItems(items);
  }, [markUnsavedChanges]);

  const handleProgVideoItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgVideoItems(items);
  }, [markUnsavedChanges]);

  const handleProgBvodItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgBvodItems(items);
  }, [markUnsavedChanges]);

  const handleProgAudioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgAudioItems(items);
  }, [markUnsavedChanges]);

  const handleProgOohItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgOohItems(items);
  }, [markUnsavedChanges]);

  const calculateAssembledFee = useCallback((): number => {
    if (workingBillingMonths.length > 0) {
      return workingBillingMonths.reduce((sum, month) => {
        const monthFeeTotal = parseFloat(month.feeTotal.replace(/[^0-9.-]/g, ""))
        return sum + (monthFeeTotal || 0)
      }, 0)
    }

    return (
      (searchFeeTotal ?? 0) +
      (socialMediaFeeTotal ?? 0) +
      (progAudioFeeTotal ?? 0) +
      (cinemaFeeTotal ?? 0) +
      (digitalAudioFeeTotal ?? 0) +
      (digitalDisplayFeeTotal ?? 0) +
      (digitalVideoFeeTotal ?? 0) +
      (bvodFeeTotal ?? 0) +
      (integrationFeeTotal ?? 0) +
      (progDisplayFeeTotal ?? 0) +
      (progVideoFeeTotal ?? 0) +
      (progBvodFeeTotal ?? 0) +
      (progOohFeeTotal ?? 0) +
      (influencersFeeTotal ?? 0) +
      (televisionFeeTotal ?? 0) +
      (radioFeeTotal ?? 0) +
      (newspaperFeeTotal ?? 0) +
      (magazinesFeeTotal ?? 0) +
      (oohFeeTotal ?? 0)
    )
  }, [
    workingBillingMonths,
    searchFeeTotal,
    socialMediaFeeTotal,
    progAudioFeeTotal,
    cinemaFeeTotal,
    digitalAudioFeeTotal,
    digitalDisplayFeeTotal,
    digitalVideoFeeTotal,
    bvodFeeTotal,
    integrationFeeTotal,
    progDisplayFeeTotal,
    progVideoFeeTotal,
    progBvodFeeTotal,
    progOohFeeTotal,
    influencersFeeTotal,
    televisionFeeTotal,
    radioFeeTotal,
    newspaperFeeTotal,
    magazinesFeeTotal,
    oohFeeTotal,
  ])

  const calculateAdServingFees = useCallback(() => {
    if (workingBillingMonths.length > 0) {
      return workingBillingMonths.reduce((sum, month) => {
        const monthAdServingTotal = parseFloat(month.adservingTechFees.replace(/[^0-9.-]/g, ""))
        return sum + (monthAdServingTotal || 0)
      }, 0)
    }
    const allBursts = [
      ...progDisplayBursts,
      ...progVideoBursts,
      ...progBvodBursts,
      ...progAudioBursts,
      ...digitalAudioBursts,
      ...digitalDisplayBursts,
      ...digitalVideoBursts,
      ...bvodBursts,
    ]
    return allBursts.reduce((sum, b) => {
      if (b.noAdserving) return sum
      const rate = getRateForMediaType(b.mediaType)
      const buyType = b.buyType?.toLowerCase?.() || ""
      const isCPM = buyType === "cpm"
      const isBonus = buyType === "bonus"
      const isDigiAudio =
        typeof b.mediaType === "string" && b.mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio"
      const isCpmOrBonusForDigiAudio = isDigiAudio && (isCPM || isBonus)
      const effectiveRate = isCpmOrBonusForDigiAudio ? (adservaudio ?? rate) : rate
      const cost = isCpmOrBonusForDigiAudio
        ? (b.deliverables / 1000) * effectiveRate
        : isCPM
          ? (b.deliverables / 1000) * rate
          : b.deliverables * rate
      return sum + cost
    }, 0)
  }, [
    workingBillingMonths,
    progDisplayBursts,
    progVideoBursts,
    progBvodBursts,
    progAudioBursts,
    digitalAudioBursts,
    digitalDisplayBursts,
    digitalVideoBursts,
    bvodBursts,
    getRateForMediaType,
    adservaudio,
  ])

  const calculateProductionCosts = useCallback(() => {
    if (workingBillingMonths && workingBillingMonths.length > 0) {
      return workingBillingMonths.reduce((sum, month) => {
        const monthProduction = parseFloat((month.production || "0").toString().replace(/[^0-9.-]/g, ""))
        return sum + (monthProduction || 0)
      }, 0)
    }
    return 0
  }, [workingBillingMonths])

  const getDeliveryMbaTotals = useCallback(() => {
    const source =
      deliveryScheduleSnapshotRef.current && deliveryScheduleSnapshotRef.current.length > 0
        ? deliveryScheduleSnapshotRef.current
        : autoDeliveryMonths

    const parseMoney = (v: unknown) =>
      parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0

    const mediaCostsByKey: Record<string, number> = {}
    let assembledFee = 0
    let adServing = 0
    let production = 0

    for (const month of source) {
      assembledFee += parseMoney(month.feeTotal)
      adServing += parseMoney(month.adservingTechFees)
      production += parseMoney(month.production)

      if (month.mediaCosts) {
        for (const [k, raw] of Object.entries(month.mediaCosts)) {
          if (k === "production") continue
          mediaCostsByKey[k] = (mediaCostsByKey[k] || 0) + parseMoney(raw)
        }
      }
    }

    const grossMedia = Object.values(mediaCostsByKey).reduce((s, v) => s + v, 0)

    return { grossMedia, assembledFee, adServing, production, mediaCostsByKey }
  }, [autoDeliveryMonths])

  const calculateTotalInvestment = () => {
    return grossMediaTotal + calculateAssembledFee() + calculateAdServingFees() + calculateProductionCosts()
  }

  // Calculate the total for each media type for MBA generation (matching create page pattern)
  const calculateMediaTotal = (mediaName: string) => {
    switch (mediaName) {
      case "mp_search":
        return searchTotal ?? 0;
      case "mp_cinema":
        return cinemaTotal ?? 0;
      case "mp_digiaudio":
        return digitalAudioTotal ?? 0;
      case "mp_digidisplay":
        return digitalDisplayTotal ?? 0;
      case "mp_digivideo":
        return digitalVideoTotal ?? 0;
      case "mp_socialmedia":
        return socialmediaTotal ?? 0;
      case "mp_progaudio":
        return progAudioTotal ?? 0;
      case "mp_progdisplay":
        return progDisplayTotal ?? 0;
      case "mp_progvideo":
        return progVideoTotal ?? 0;
      case "mp_progbvod":
        return progBvodTotal ?? 0;
      case "mp_progooh":
        return progOohTotal ?? 0;
      case "mp_influencers":
        return influencersTotal ?? 0;
      case "mp_television":
        return televisionTotal ?? 0;
      case "mp_radio":
        return radioTotal ?? 0;
      case "mp_newspaper":
        return newspaperTotal ?? 0;
      case "mp_magazines":
        return magazinesTotal ?? 0;
      case "mp_ooh":
        return oohTotal ?? 0;
      case "mp_integration":
        return integrationTotal ?? 0;
      case "mp_bvod":
        return bvodTotal ?? 0;
      case "mp_production":
        return consultingTotal ?? 0;
      default:
        return 0;
    }
  }

  // --- Partial MBA Handlers ---

  function getPartialMbaPrimaryBillingMonths(): BillingMonth[] {
    return workingBillingMonths
  }

  function getPartialMbaRawMonthsForBaseline(): BillingMonth[] {
    const primary = getPartialMbaPrimaryBillingMonths()
    if (billingMonthsHaveDetailedLineItems(primary)) return primary
    return autoDeliveryMonths.length > 0 ? autoDeliveryMonths : workingBillingMonths
  }

  function getPartialMbaLineItemMonths(): BillingMonth[] {
    const primary = getPartialMbaPrimaryBillingMonths()
    if (billingMonthsHaveDetailedLineItems(primary)) {
      return deepCloneBillingMonths(primary)
    }
    const base = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : workingBillingMonths
    return attachLineItemsToMonths(deepCloneBillingMonths(base), "delivery")
  }

  function recomputePartialMBAFromLineItems(
    nextMonthYears: string[],
    nextSelectedIds: Record<string, string[]>,
    nextEnabledMedia?: Record<string, boolean>
  ): PartialMbaValues | null {
    const deliveryMonthsRaw = getPartialMbaRawMonthsForBaseline()
    if (!deliveryMonthsRaw.length) return null

    const deliveryMonthsWithLineItems = getPartialMbaLineItemMonths()

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const mediaLabelByKey = Object.fromEntries(
      mediaTypes
        .filter((m) => m.name !== "mp_production")
        .map((m) => [mediaKeyMap[m.name], m.label])
    ) as Record<string, string>

    const enabledMedia = nextEnabledMedia ?? partialMBAMediaEnabled

    const fmt = (n: number) =>
      formatMoney(n, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const { values, lineItemsByMedia, metadata } = recomputePartialMbaFromSelections({
      deliveryMonthsForBaseline: deliveryMonthsRaw,
      deliveryMonthsForLineItems: deliveryMonthsWithLineItems,
      selectedMonthYears: nextMonthYears,
      selectedLineItemIdsByMedia: nextSelectedIds,
      mediaKeys,
      enabledMedia,
      mediaLabelByKey,
      formatCurrency: fmt,
    })

    setPartialMBAValues(values)
    setPartialMBALineItemsByMedia(lineItemsByMedia)
    setPartialApprovalMetadata(metadata)
    return values
  }

  function handlePartialMBAOpen() {
    if (isPartialMBA) {
      recomputePartialMBAFromLineItems(partialMBAMonthYears, partialMBASelectedLineItemIds, partialMBAMediaEnabled)
      setIsPartialMBAModalOpen(true)
      return
    }

    const deliveryMonthsRaw = getPartialMbaRawMonthsForBaseline()

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const enabledMap = Object.fromEntries(mediaKeys.map((k) => [k, true])) as Record<string, boolean>
    const monthYears = deliveryMonthsRaw.map((m) => m.monthYear)

    setPartialMBAMediaEnabled(enabledMap)
    setPartialMBAMonthYears(monthYears)

    if (!deliveryMonthsRaw.length) {
      const currentMediaTotals: Record<string, number> = {}
      enabledMediaRows.forEach((m) => {
        const mediaKey = (m as any).mediaKey as string
        currentMediaTotals[mediaKey] = calculateMediaTotal(m.name)
      })
      const fallback = {
        mediaTotals: currentMediaTotals,
        grossMedia: grossMediaTotal,
        assembledFee: calculateAssembledFee(),
        adServing: calculateAdServingFees(),
        production: calculateProductionCosts(),
      }
      setPartialMBAValues(fallback)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialApprovalMetadata(null)
      setOriginalPartialMBAValues(JSON.parse(JSON.stringify(fallback)))
      setIsPartialMBAModalOpen(true)
      return
    }

    const deliveryMonthsWithLineItems = getPartialMbaLineItemMonths()
    const lineItemsMap = computeLineItemTotalsFromDeliveryMonths({
      deliveryMonths: deliveryMonthsWithLineItems,
      selectedMonthYears: monthYears,
    })
    const selectedIds = Object.fromEntries(
      Object.entries(lineItemsMap).map(([mediaKey, items]) => [mediaKey, Object.keys(items)])
    ) as Record<string, string[]>
    setPartialMBASelectedLineItemIds(selectedIds)
    const initialValues = recomputePartialMBAFromLineItems(monthYears, selectedIds, enabledMap)
    if (initialValues) {
      setOriginalPartialMBAValues(JSON.parse(JSON.stringify(initialValues)))
    }
    setIsPartialMBAModalOpen(true)
  }

  function handlePartialMBAMonthsChange(nextMonthYears: string[]) {
    const deliveryMonthsRaw = getPartialMbaRawMonthsForBaseline()

    setPartialMBAMonthYears(nextMonthYears)
    if (!deliveryMonthsRaw.length) return

    recomputePartialMBAFromLineItems(nextMonthYears, partialMBASelectedLineItemIds)
  }

  function handlePartialMBAToggleMedia(mediaKey: string, enabled: boolean) {
    const nextEnabled = { ...partialMBAMediaEnabled, [mediaKey]: enabled }
    setPartialMBAMediaEnabled(nextEnabled)
    const allIds = (partialMBALineItemsByMedia[mediaKey] || []).map((item) => item.lineItemId)
    const nextSelected = {
      ...partialMBASelectedLineItemIds,
      [mediaKey]: enabled ? allIds : [],
    }
    setPartialMBASelectedLineItemIds(nextSelected)
    recomputePartialMBAFromLineItems(partialMBAMonthYears, nextSelected, nextEnabled)
  }

  function handlePartialMBAToggleLineItem(mediaKey: string, lineItemId: string, enabled: boolean) {
    const existing = new Set(partialMBASelectedLineItemIds[mediaKey] || [])
    if (enabled) existing.add(lineItemId)
    else existing.delete(lineItemId)
    const nextSelected = { ...partialMBASelectedLineItemIds, [mediaKey]: Array.from(existing) }
    setPartialMBASelectedLineItemIds(nextSelected)
    const nextEnabled = { ...partialMBAMediaEnabled, [mediaKey]: nextSelected[mediaKey].length > 0 }
    setPartialMBAMediaEnabled(nextEnabled)
    recomputePartialMBAFromLineItems(partialMBAMonthYears, nextSelected, nextEnabled)
  }

  function handlePartialMBAChange(
    field: 'mediaTotal' | 'assembledFee' | 'adServing' | 'production',
    value: string,
    mediaKey?: string
  ) {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;

    setPartialMBAValues(prev => {
      const newValues = { ...prev };
      
      // Update the specific field that was changed
      if (field === 'mediaTotal' && mediaKey) {
        newValues.mediaTotals[mediaKey] = numericValue;
      } else if (field !== 'mediaTotal') {
        newValues[field] = numericValue;
      }

      // Recalculate Gross Media as the sum of all individual media items
      newValues.grossMedia = Object.values(newValues.mediaTotals).reduce((sum, total) => sum + total, 0);

      return newValues;
    });
  }

  function handlePartialMBASave() {
    const campaignBudget = form.getValues("mp_campaignbudget") || 0;
    const { grossMedia, assembledFee, adServing, production } = partialMBAValues;
    const newTotalInvestment = grossMedia + assembledFee + adServing + production;

    // Warn-only if outside $2.00 tolerance (still allow saving)
    const diff = newTotalInvestment - campaignBudget
    if (campaignBudget > 0 && Math.abs(diff) > 2) {
      toast({
        title: "Saved with budget mismatch",
        description: `Total differs from Campaign Budget by ${formatMoney(Math.abs(diff), {
          locale: "en-US",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} (${diff > 0 ? "over" : "under"}).`,
      })
    }

    setPartialMBAError(null)
    setIsPartialMBA(true);
    setIsPartialMBAModalOpen(false);
    if (partialApprovalMetadata) {
      setPartialApprovalMetadata({
        ...partialApprovalMetadata,
        totals: {
          grossMedia: formatMoney(grossMedia, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          assembledFee: formatMoney(assembledFee, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          adServing: formatMoney(adServing, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          production: formatMoney(production, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          totalInvestment: formatMoney(newTotalInvestment, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        },
        updatedAt: new Date().toISOString(),
      })
    }
    toast({ title: "Success", description: "Partial MBA details have been saved." });
  }

  function handlePartialMBAReset() {
    const deliveryMonthsRaw = getPartialMbaRawMonthsForBaseline()

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const enabledMap = Object.fromEntries(mediaKeys.map((k) => [k, true])) as Record<string, boolean>
    const monthYears = deliveryMonthsRaw.map((m) => m.monthYear)

    setPartialMBAMediaEnabled(enabledMap)
    setPartialMBAMonthYears(monthYears)

    if (!deliveryMonthsRaw.length) {
      const computed = JSON.parse(JSON.stringify(originalPartialMBAValues))
      setPartialMBAValues(computed)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialApprovalMetadata(null)
      toast({ title: "Reset", description: "Values restored from snapshot." })
      return
    }

    const deliveryMonthsWithLineItems = getPartialMbaLineItemMonths()
    const lineItemsMap = computeLineItemTotalsFromDeliveryMonths({
      deliveryMonths: deliveryMonthsWithLineItems,
      selectedMonthYears: monthYears,
    })
    const selectedIds = Object.fromEntries(
      Object.entries(lineItemsMap).map(([mediaKey, items]) => [mediaKey, Object.keys(items)])
    ) as Record<string, string[]>
    setPartialMBASelectedLineItemIds(selectedIds)
    const v = recomputePartialMBAFromLineItems(monthYears, selectedIds, enabledMap)
    if (v) setOriginalPartialMBAValues(JSON.parse(JSON.stringify(v)))
    toast({ title: "Reset", description: "Values have been recalculated from delivery months." })
  }

  useEffect(() => {
    const newTotalInvestment =
      grossMediaTotal +
      calculateAssembledFee() +
      calculateAdServingFees() +
      calculateProductionCosts()
    setTotalInvestment(newTotalInvestment)
  }, [
    grossMediaTotal,
    calculateAssembledFee,
    calculateAdServingFees,
    calculateProductionCosts,
  ])

  /**
   * Main page: append-only billing — new campaign months, media keys, and line-item ids. Waits for
   * `autoReferenceBillingMonths` after `calculateBillingSchedule`; re-runs when line-item arrays gain rows
   * (`billingLineItemsLengthFingerprint`) so enabling a media type then loading containers/API re-appends.
   */
  useEffect(() => {
    if (!campaignStartDate || !campaignEndDate) return

    const startKey = toDateOnlyString(campaignStartDate)
    const endKey = toDateOnlyString(campaignEndDate)
    lastCampaignDatesRef.current = { start: startKey, end: endKey }

    const tid = window.setTimeout(() => {
      calculateBillingSchedule(campaignStartDate, campaignEndDate)

      const autoRef = autoReferenceBillingMonthsRef.current
      const source = workingBillingMonthsRef.current

      const fv = form.getValues() as Record<string, unknown>
      const mediaRows: { flag: string; billingKey: string; items: any[] }[] = [
        { flag: "mp_television", billingKey: "television", items: televisionMediaLineItems },
        { flag: "mp_radio", billingKey: "radio", items: radioMediaLineItems },
        { flag: "mp_newspaper", billingKey: "newspaper", items: newspaperMediaLineItems },
        { flag: "mp_magazines", billingKey: "magazines", items: magazinesMediaLineItems },
        { flag: "mp_ooh", billingKey: "ooh", items: oohMediaLineItems },
        { flag: "mp_cinema", billingKey: "cinema", items: cinemaMediaLineItems },
        { flag: "mp_digidisplay", billingKey: "digiDisplay", items: digitalDisplayMediaLineItems },
        { flag: "mp_digiaudio", billingKey: "digiAudio", items: digitalAudioMediaLineItems },
        { flag: "mp_digivideo", billingKey: "digiVideo", items: digitalVideoMediaLineItems },
        { flag: "mp_bvod", billingKey: "bvod", items: bvodMediaLineItems },
        { flag: "mp_integration", billingKey: "integration", items: integrationMediaLineItems },
        { flag: "mp_production", billingKey: "production", items: consultingMediaLineItems },
        { flag: "mp_search", billingKey: "search", items: searchMediaLineItems },
        { flag: "mp_socialmedia", billingKey: "socialMedia", items: socialMediaMediaLineItems },
        { flag: "mp_progdisplay", billingKey: "progDisplay", items: progDisplayMediaLineItems },
        { flag: "mp_progvideo", billingKey: "progVideo", items: progVideoMediaLineItems },
        { flag: "mp_progbvod", billingKey: "progBvod", items: progBvodMediaLineItems },
        { flag: "mp_progaudio", billingKey: "progAudio", items: progAudioMediaLineItems },
        { flag: "mp_progooh", billingKey: "progOoh", items: progOohMediaLineItems },
        { flag: "mp_influencers", billingKey: "influencers", items: influencersMediaLineItems },
      ]

      const enabledFlags = mediaRows.filter((r) => fv[r.flag]).map((r) => r.flag)
      const enabledMissingLineItems = mediaRows
        .filter((r) => fv[r.flag] && !isMediaTypeReadyForBillingAppend(true, r.items))
        .map((r) => r.billingKey)
      const enabledWithLineItems = mediaRows
        .filter((r) => fv[r.flag] && isMediaTypeReadyForBillingAppend(true, r.items))
        .map((r) => r.billingKey)

      const pendingEmptyLineSlots = billingStructureKeyHasPendingEmptyLineSlots(billingPlanStructureKey)

      if (autoRef.length === 0) {
        billingAppendDebug("append skipped: autoReferenceBillingMonths empty", {
          billingPlanStructureKey,
          pendingEmptyLineSlots,
          enabledFlags,
          enabledMissingLineItems,
          enabledWithLineItems,
          workingMonths: source.length,
          lineItemsFingerprint: billingLineItemsLengthFingerprint,
          isManualBilling,
        })
        return
      }

      const formatter = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      billingAppendDebug("append readiness", {
        billingPlanStructureKey,
        pendingEmptyLineSlots,
        autoRefMonths: autoRef.length,
        workingMonths: source.length,
        isManualBilling,
        enabledFlags,
        enabledMissingLineItems,
        enabledWithLineItems,
        lineItemsFingerprint: billingLineItemsLengthFingerprint,
      })

      const followAuto =
        billingLineItemsFollowAutoRef.current && !isManualBillingRef.current
      const merged = appendAutoReferenceIntoWorkingBilling(
        source,
        autoRef,
        formatter,
        attachLineItemsToMonths,
        followAuto ? { resyncExistingFromTemplate: true } : undefined
      )
      setWorkingBillingMonths(merged)
      workingBillingMonthsRef.current = merged

      billingAppendDebug("append applied", {
        outputMonths: merged.length,
        billingPlanStructureKey,
        pendingEmptyLineSlots,
      })
    }, 250)

    return () => window.clearTimeout(tid)
  }, [
    campaignStartDate,
    campaignEndDate,
    billingPlanStructureKey,
    billingLineItemsLengthFingerprint,
    autoReferenceBillingMonths.length,
    attachLineItemsToMonths,
    calculateBillingSchedule,
    isManualBilling,
    form,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    consultingMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
  ])

  // Refresh burst-derived auto reference when bursts/totals change (does not write working — append effect applies deltas).
  useEffect(() => {
    if (campaignStartDate && campaignEndDate) {
      calculateBillingSchedule(campaignStartDate, campaignEndDate)
    }
  }, [
    campaignStartDate,
    campaignEndDate,
    // Digital Media
    searchTotal,
    searchFeeTotal,
    searchBursts,
    socialmediaTotal,
    socialMediaFeeTotal,
    socialMediaBursts,
    integrationTotal,
    integrationFeeTotal,
    integrationBursts,
    digitalAudioTotal,
    digitalAudioBursts,
    digitalAudioFeeTotal,
    digitalDisplayTotal,
    digitalDisplayBursts,
    digitalDisplayFeeTotal,
    digitalVideoTotal,
    digitalVideoBursts,
    digitalVideoFeeTotal,
    bvodTotal,
    bvodFeeTotal,
    bvodBursts,
    progAudioTotal,
    progAudioFeeTotal,
    progAudioBursts,
    progDisplayTotal,
    progDisplayBursts,
    progDisplayFeeTotal,
    progVideoTotal,
    progVideoFeeTotal,
    progVideoBursts,
    progBvodTotal,
    progBvodBursts,
    progBvodFeeTotal,
    progOohTotal,
    progOohBursts,
    progOohFeeTotal,
    // Offline Media
    cinemaTotal,
    cinemaFeeTotal,
    cinemaBursts,
    televisionTotal,
    televisionFeeTotal,
    televisionBursts,
    radioTotal,
    radioFeeTotal,
    radioBursts,
    newspaperTotal,
    newspaperFeeTotal,
    newspaperBursts,
    magazinesTotal,
    magazinesFeeTotal,
    magazinesBursts,
    oohTotal,
    oohFeeTotal,
    oohBursts,
    influencersTotal,
    influencersFeeTotal,
    influencersBursts,
    // Ad Serving
    adservimp,
    adservaudio,
    adservdisplay,
    adservvideo,
    calculateBillingSchedule
  ]);

  // Helper function to convert buffer to base64
  const bufferToBase64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  const waitForStateFlush = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve())
        } else {
          setTimeout(resolve, 0)
        }
      }),
    []
  )

  const formatVersionDate = useCallback((value: any) => {
    if (!value) return 'Unknown date'
    const date = new Date(value)
    if (isNaN(date.getTime())) return 'Unknown date'
    return format(date, 'dd/MM/yyyy HH:mm')
  }, [])

  const handleVersionSelect = useCallback((value: string) => {
    const numericVersion = parseInt(value, 10)
    if (!numericVersion || numericVersion === selectedVersionNumber) return
    const versionMeta = availableVersions.find(v => v.version_number === numericVersion)
    setRollbackTargetVersion(numericVersion)
    setRollbackTargetCreatedAt(versionMeta?.created_at ?? null)
    setRollbackModalOpen(true)
  }, [availableVersions, selectedVersionNumber])

  const handleConfirmRollback = useCallback(() => {
    if (!rollbackTargetVersion) {
      setRollbackModalOpen(false)
      return
    }
    const url = `/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit?version=${rollbackTargetVersion}`
    setRollbackModalOpen(false)
    setIsLoading(true)
    router.push(url)
  }, [mbaNumber, rollbackTargetVersion, router])

  const clientNameToSlug = useCallback((clientName: string): string => {
    return clientName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim();
  }, []);

  const getPageContext = useCallback((): PageContext => {
    const values = form.getValues();
    const clientSlug = values.mp_clientname ? clientNameToSlug(values.mp_clientname) : undefined;
    const enabledMediaTypes = mediaTypes
      .filter((medium) => Boolean(values[medium.name as keyof MediaPlanFormValues]))
      .map((medium) => medium.label);

    const baseFields: PageField[] = [
      {
        id: "mp_campaignstatus",
        label: "Campaign Status",
        type: "enum",
        value: values.mp_campaignstatus,
        editable: true,
        semanticType: "status",
        group: "campaign",
        source: "ui",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Planned", value: "planned" },
          { label: "Approved", value: "approved" },
          { label: "Booked", value: "booked" },
          { label: "Completed", value: "completed" },
          { label: "Cancelled", value: "cancelled" },
        ],
        validation: { required: true },
      },
      {
        id: "mp_campaignname",
        label: "Campaign Name",
        type: "string",
        value: values.mp_campaignname,
        editable: true,
        semanticType: "campaign_name",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_brand",
        label: "Brand",
        type: "string",
        value: values.mp_brand,
        editable: true,
        semanticType: "brand",
        group: "campaign",
        source: "ui",
      },
      {
        id: "mp_campaigndates_start",
        label: "Campaign Start Date",
        type: "date",
        value: values.mp_campaigndates_start,
        editable: true,
        semanticType: "date",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_campaigndates_end",
        label: "Campaign End Date",
        type: "date",
        value: values.mp_campaigndates_end,
        editable: true,
        semanticType: "date",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_clientcontact",
        label: "Client Contact",
        type: "string",
        value: values.mp_clientcontact,
        editable: true,
        semanticType: "client_contact",
        group: "client",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_ponumber",
        label: "PO Number",
        type: "string",
        value: values.mp_ponumber,
        editable: true,
        semanticType: "po_number",
        group: "campaign",
        source: "ui",
      },
      {
        id: "mp_campaignbudget",
        label: "Campaign Budget",
        type: "number",
        value: values.mp_campaignbudget,
        editable: true,
        semanticType: "budget",
        group: "campaign",
        source: "ui",
      },
    ];

    const toggleFields: PageField[] = mediaTypes.map((medium) => ({
      id: medium.name,
      label: medium.label,
      type: "boolean",
      value: values[medium.name as keyof MediaPlanFormValues],
      editable: true,
      semanticType: "boolean_toggle",
      group: "media_types",
      source: "ui",
    }));

    return {
      route: { pathname: pathname ?? "", clientSlug, mbaSlug: mbaNumber },
      fields: [...baseFields, ...toggleFields],
      generatedAt: new Date().toISOString(),
      entities: {
        clientSlug,
        clientName: values.mp_clientname,
        mbaNumber,
        campaignName: values.mp_campaignname,
        mediaTypes: enabledMediaTypes,
      },
      pageText: {
        title: "Edit Campaign",
        headings: ["Edit Campaign"],
        breadcrumbs: ["Media Plans", "Edit"],
      },
    };
  }, [clientNameToSlug, form, mbaNumber, pathname]);

  const handleSetField = useCallback(
    async ({ fieldId, selector, value }: { fieldId?: string; selector?: string; value: any }) => {
      if (typeof window === "undefined" || typeof document === "undefined") return
      const target =
        (selector ? document.querySelector(selector) : null) ||
        (fieldId ? document.getElementById(fieldId) : null) ||
        (fieldId ? document.querySelector(`[name="${fieldId}"]`) : null)

      if (!target) {
        throw new Error("Field not found")
      }

      const asInput = target as HTMLInputElement | HTMLTextAreaElement
      if (asInput) {
        ;(asInput as any).value = value as any
        asInput.dispatchEvent(new Event("input", { bubbles: true }))
        asInput.dispatchEvent(new Event("change", { bubbles: true }))
        return `Set field ${selector || fieldId} to ${value}`
      }
      throw new Error("Unsupported field type")
    },
    []
  )

  const handleClick = useCallback(async ({ selector }: { selector: string }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) throw new Error("Element not found")
    el.click()
    return `Clicked ${selector}`
  }, [])

  const handleSelect = useCallback(async ({ selector, value }: { selector: string; value: string }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLSelectElement | null
    if (!el) throw new Error("Select not found")
    el.value = value
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return `Selected ${value} on ${selector}`
  }, [])

  const handleToggle = useCallback(async ({ selector, value }: { selector: string; value: boolean }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLInputElement | null
    if (!el) throw new Error("Toggle target not found")
    if (el.type !== "checkbox") throw new Error("Toggle target is not a checkbox")
    el.checked = Boolean(value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return `Toggled ${selector} to ${value}`
  }, [])

  useEffect(() => {
    setAssistantContext({
      pageContext: getPageContext(),
      actions: {
        setField: handleSetField,
        click: handleClick,
        select: handleSelect,
        toggle: handleToggle,
      },
    })
  }, [getPageContext, handleClick, handleSelect, handleSetField, handleToggle])

  const handleCopyPageContext = useCallback(async () => {
    try {
      const context = getPageContext();
      await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
      toast({ title: "Copied", description: "Page context copied to clipboard" });
    } catch (error) {
      console.error("Failed to copy page context", error);
      toast({
        title: "Copy failed",
        description: "Could not copy page context to clipboard",
        variant: "destructive",
      });
    }
  }, [getPageContext]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load your media plan.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => router.push("/mediaplans")} className="mt-4">
            Return to Media Plans
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full min-h-screen"
      style={{
        // Always keep iOS home-indicator / mobile browser UI from covering content
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
        <MediaPlanEditorHero
          className="mb-2"
          title="Edit Campaign"
          detail={
            <p>Update campaign settings, media types, and line item details.</p>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="text-xs"
              onClick={handleCopyPageContext}
            >
              Copy Context
            </Button>
          }
        />

        <div className="w-full">
          <Dialog open={rollbackModalOpen} onOpenChange={setRollbackModalOpen}>
            <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
              <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
              <div className="p-6">
                <DialogHeader>
                  <DialogTitle>Load version v{rollbackTargetVersion}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-foreground">
                  Load the selected version? Unsaved changes on this page will be lost.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created at: {formatVersionDate(rollbackTargetCreatedAt)}
                </p>
                <DialogFooter className="pt-4">
                  <Button variant="outline" onClick={() => setRollbackModalOpen(false)}>No</Button>
                  <Button onClick={handleConfirmRollback}>Yes, load version</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Form {...form}>
          <form className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-7 2xl:gap-8 xl:items-stretch">
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campaign Details</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>v{selectedVersionNumber ?? mediaPlan?.version_number ?? "—"}</span>
                <span className="text-border">•</span>
                <span>Next: v{nextSaveVersionNumber ?? (latestVersionNumber || 0) + 1}</span>
                {latestVersionNumber > 1 && availableVersions.length > 0 && (
                  <Combobox
                    value={selectedVersionNumber ? String(selectedVersionNumber) : ""}
                    onValueChange={handleVersionSelect}
                    placeholder="Load version"
                    searchPlaceholder="Search versions..."
                    buttonClassName="h-7 w-28 text-xs"
                    options={[...availableVersions].map((v) => ({
                      value: String(v.version_number),
                      label: `v${v.version_number}`,
                    }))}
                  />
                )}
              </div>
            </div>
            <div className="grid w-full flex-1 grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name="mp_clientname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Client Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      Client cannot be changed for existing campaigns.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaignname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={String(field.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Brand</FormLabel>
                    <FormControl>
                      <Input {...field} value={String(field.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaignstatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Status</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select campaign status"
                        searchPlaceholder="Search statuses..."
                        options={[
                          { value: "approved", label: "Approved" },
                          { value: "booked", label: "Booked" },
                          { value: "cancelled", label: "Cancelled" },
                          { value: "completed", label: "Completed" },
                          { value: "draft", label: "Draft" },
                          { value: "planned", label: "Planned" },
                        ]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_clientcontact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Client Contact</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_ponumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaigndates_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Start Date</FormLabel>
                    <FormControl>
                      <SingleDatePicker
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value}
                        onChange={field.onChange}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        calendarContext="general"
                        dateFormat="PPP"
                        placeholder={<span>Pick a date</span>}
                        iconClassName="ml-auto h-4 w-4 opacity-50"
                        isDateDisabled={(date) => date > new Date("2100-01-01")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaigndates_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign End Date</FormLabel>
                    <FormControl>
                      <SingleDatePicker
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value}
                        onChange={field.onChange}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        calendarContext="general"
                        dateFormat="PPP"
                        placeholder={<span>Pick a date</span>}
                        iconClassName="ml-auto h-4 w-4 opacity-50"
                        isDateDisabled={(date) => date > new Date("2100-01-01")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaignbudget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Budget</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "")
                          field.onChange(value ? Number(value) : 0)
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "")
                          const formattedValue = new Intl.NumberFormat("en-AU", {
                            style: "currency",
                            currency: "AUD",
                          }).format(Number(value) || 0)
                          e.target.value = formattedValue
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mbaidentifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">MBA Identifier</FormLabel>
                    <div
                      className={cn(
                        "flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{field.value || "No client selected"}</span>
                    </div>
                    <FormDescription className="text-[11px]">
                      This field is automatically populated based on the selected client.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mbanumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">MBA Number</FormLabel>
                    <div
                      className={cn(
                        "flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{field.value || "No MBA Number generated"}</span>
                    </div>
                    <FormDescription className="text-[11px]">
                      This field is automatically generated when the campaign is saved.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_plannumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Media Plan Version</FormLabel>
                    <div className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                      <span className="truncate">{field.value || String(selectedVersionNumber ?? mediaPlan?.version_number ?? 1)}</span>
                    </div>
                    <FormDescription className="text-[11px]">This is the media plan version you are editing.</FormDescription>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-1">
            <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media Types</h3>
            </div>
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 content-start gap-x-3 gap-y-1.5 px-6 py-4 md:grid-cols-2">
              {mediaTypes.map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name as FormFieldName}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0 py-0.5">
                      <FormControl className="shrink-0">
                        <Switch
                          checked={field.value as boolean}
                          onCheckedChange={(checked) => {
                            field.onChange(checked)
                            if (name === "mp_production") {
                              form.setValue("mp_production", checked, { shouldDirty: true })
                            }
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal leading-snug min-w-0 flex-1 cursor-pointer">{label}</FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-7 2xl:gap-8 xl:items-stretch">
            {/* MBA Details Section */}
            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">MBA Details</h3>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isPartialMBA ? (
                    <>
                      <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={handlePartialMBAOpen}>
                        Edit partial MBA
                      </Button>
                      <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={() => setIsPartialMBA(false)}>
                        Reset to Auto
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={handlePartialMBAOpen}>
                      Partial MBA
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-3 px-6 py-4">
                {(() => {
                  const deliveryMbaTotals = getDeliveryMbaTotals();
                  const deliveryInvestmentExGst =
                    deliveryMbaTotals.grossMedia +
                    deliveryMbaTotals.assembledFee +
                    deliveryMbaTotals.adServing +
                    deliveryMbaTotals.production;
                  return (
                    <>
                      {mediaTypes
                        .filter((medium) => medium.name !== "mp_production")
                        .filter((medium) => form.watch(medium.name as FormFieldName))
                        .map((medium) => {
                          const mediaKey = mediaKeyMap[medium.name];
                          const total = isPartialMBA
                            ? partialMBAValues.mediaTotals[mediaKey] || 0
                            : deliveryMbaTotals.mediaCostsByKey[mediaKey] ?? 0;
                          return (
                            <div key={medium.name} className="flex items-center justify-between py-1">
                              <span className="text-sm text-muted-foreground">{medium.label}</span>
                              <span className="text-sm font-medium tabular-nums">
                                {mbaCurrencyFormatter.format(total)}
                              </span>
                            </div>
                          );
                        })}
                      <div className="border-t border-border/40" />
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm font-semibold">Gross Media</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.grossMedia : deliveryMbaTotals.grossMedia
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm font-semibold">Assembled Fee</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.assembledFee : deliveryMbaTotals.assembledFee
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm font-semibold">Ad Serving & Tech</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.adServing : deliveryMbaTotals.adServing
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm font-semibold">Production</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.production : deliveryMbaTotals.production
                          )}
                        </span>
                      </div>
                      <div className="border-t-2 border-primary/20 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold">Total Investment (ex GST)</span>
                          <span className="text-sm font-bold tabular-nums text-primary">
                            {mbaCurrencyFormatter.format(
                              isPartialMBA
                                ? partialMBAValues.grossMedia +
                                    partialMBAValues.assembledFee +
                                    partialMBAValues.adServing +
                                    partialMBAValues.production
                                : deliveryInvestmentExGst
                            )}
                          </span>
                        </div>
                      </div>
                      {isPartialMBA && partialApprovalMetadata?.note ? (
                        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                          <div className="mb-1 font-semibold text-foreground">Partial approval changes</div>
                          <div>{partialApprovalMetadata.note}</div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Billing Schedule Section — summary grid; detail/line edits are in Manual Billing. New months/media/lines merge in via append-only logic without full reset. */}
            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Billing Schedule</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={workingBillingMonths.length === 0}
                    onClick={handleDownloadBillingScheduleExcel}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Excel
                  </Button>
                  <Button onClick={handleManualBillingOpen} type="button" className="shrink-0">
                    Edit Billing
                  </Button>
                </div>
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto px-6 py-4">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead align="right">Media</TableHead>
                    <TableHead align="right">Fees</TableHead>
                    <TableHead align="right">Ad Serving</TableHead>
                    <TableHead align="right">Production</TableHead>
                    <TableHead align="right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workingBillingMonths.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No billing schedule available. Select campaign dates to generate.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workingBillingMonths.map(m => (
                      <TableRow key={m.monthYear}>
                        <TableCell>{m.monthYear}</TableCell>
                        <TableCell align="right">{m.mediaTotal}</TableCell>
                        <TableCell align="right">{m.feeTotal}</TableCell>
                        <TableCell align="right">{m.adservingTechFees}</TableCell>
                        <TableCell align="right">{m.production || "$0.00"}</TableCell>
                        <TableCell align="right" className="font-semibold">{m.totalAmount}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {workingBillingMonths.length > 0 && (
                    <TableRow className="font-bold">
                      <TableCell>Grand Total</TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          .format(workingBillingMonths.reduce((acc, m) => acc + parseFloat(m.mediaTotal.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          .format(workingBillingMonths.reduce((acc, m) => acc + parseFloat(m.feeTotal.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          .format(workingBillingMonths.reduce((acc, m) => acc + parseFloat(m.adservingTechFees.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          .format(workingBillingMonths.reduce((acc, m) => acc + parseFloat((m.production || "$0").replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right" className="font-semibold">{billingTotalDisplayFromWorking}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>

              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">KPIs</h3>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
                  <p className="text-center text-sm text-muted-foreground">Coming soon</p>
                </div>
              </div>
            </div>

          <div className="space-y-6">
            <div className="relative pb-2 pt-8">
              <div className="absolute inset-x-0 top-4 h-px bg-border/50" />
              <h3 className="relative inline-block bg-background pr-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Media Containers
              </h3>
            </div>
            <div className="space-y-4">
              {/* Media Containers */}
              {mediaTypes.map((medium) => {
                if (!form.watch(medium.name as any)) return null;
                
                return (
                  <div key={medium.name} id={`media-section-${medium.name}`} className="mt-4 scroll-mt-24">
                    <Suspense fallback={<MediaContainerSuspenseFallback label={medium.label} />}>
                      {medium.name === "mp_television" && (
                        <TelevisionContainer
                          clientId={selectedClientId}
                          feetelevision={feeTelevision || 0}
                          onTotalMediaChange={handleTelevisionTotalChange}
                          onBurstsChange={handleTelevisionBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleTelevisionItemsChange}
                          onTelevisionLineItemsChange={handleTelevisionMediaLineItemsChange}
                          onMediaLineItemsChange={handleTelevisionMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["television"]}
                          initialLineItems={televisionLineItems}
                        />
                      )}
                      {medium.name === "mp_radio" && (
                        <RadioContainer
                          clientId={selectedClientId}
                          feeradio={feeRadio || 0}
                          onTotalMediaChange={handleRadioTotalChange}
                          onBurstsChange={handleRadioBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleRadioItemsChange}
                          onMediaLineItemsChange={handleRadioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["radio"]}
                          initialLineItems={radioLineItems}
                        />
                      )}
                      {medium.name === "mp_newspaper" && (
                        <NewspaperContainer
                          clientId={selectedClientId}
                          feenewspapers={feeNewspapers || 0}
                          onTotalMediaChange={handleNewspaperTotalChange}
                          onBurstsChange={handleNewspaperBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleNewspaperItemsChange}
                          onNewspaperLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleNewspaperMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["newspaper"]}
                          initialLineItems={newspaperLineItems}
                        />
                      )}
                      {medium.name === "mp_magazines" && (
                        <MagazinesContainer
                          clientId={selectedClientId}
                          feemagazines={feeMagazines || 0}
                          onTotalMediaChange={handleMagazinesTotalChange}
                          onBurstsChange={handleMagazinesBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleMagazinesItemsChange}
                          onMediaLineItemsChange={handleMagazinesMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["magazines"]}
                          initialLineItems={magazinesLineItems}
                        />
                      )}
                      {medium.name === "mp_ooh" && (
                        <OOHContainer
                          clientId={selectedClientId}
                          feeooh={feeOoh || 0}
                          onTotalMediaChange={handleOohTotalChange}
                          onBurstsChange={handleOohBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleOohItemsChange}
                          onMediaLineItemsChange={handleOohMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["ooh"]}
                          initialLineItems={oohLineItems}
                        />
                      )}
                      {medium.name === "mp_cinema" && (
                        <CinemaContainer
                          clientId={selectedClientId}
                          feecinema={feeCinema || 0}
                          onTotalMediaChange={handleCinemaTotalChange}
                          onBurstsChange={handleCinemaBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleCinemaItemsChange}
                          onMediaLineItemsChange={handleCinemaMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["cinema"]}
                          initialLineItems={cinemaLineItems}
                        />
                      )}
                      {medium.name === "mp_digidisplay" && (
                        <DigitalDisplayContainer
                          clientId={selectedClientId}
                          feedigidisplay={feeDigiDisplay || 0}
                          onTotalMediaChange={handleDigitalDisplayTotalChange}
                          onBurstsChange={handleDigitalDisplayBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleDigitalDisplayItemsChange}
                          onMediaLineItemsChange={handleDigitalDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["digidisplay"]}
                          initialLineItems={digitalDisplayLineItems}
                        />
                      )}
                      {medium.name === "mp_digiaudio" && (
                        <DigitalAudioContainer
                          clientId={selectedClientId}
                          feedigiaudio={feeDigiAudio || 0}
                          onTotalMediaChange={handleDigitalAudioTotalChange}
                          onBurstsChange={handleDigitalAudioBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleDigitalAudioItemsChange}
                          onMediaLineItemsChange={handleDigitalAudioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["digiaudio"]}
                          initialLineItems={digitalAudioLineItems}
                        />
                      )}
                      {medium.name === "mp_digivideo" && (
                        <DigitalVideoContainer
                          clientId={selectedClientId}
                          feedigivideo={feeDigiVideo || 0}
                          onTotalMediaChange={handleDigitalVideoTotalChange}
                          onBurstsChange={handleDigitalVideoBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleDigitalVideoItemsChange}
                          onMediaLineItemsChange={handleDigitalVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["digivideo"]}
                          initialLineItems={digitalVideoLineItems}
                        />
                      )}
                      {medium.name === "mp_bvod" && (
                        <BVODContainer
                          clientId={selectedClientId}
                          feebvod={feeBvod || 0}
                          onTotalMediaChange={handleBvodTotalChange}
                          onBurstsChange={handleBvodBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleBvodItemsChange}
                          onMediaLineItemsChange={handleBvodMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["bvod"]}
                          initialLineItems={bvodLineItems}
                        />
                      )}
                      {medium.name === "mp_integration" && (
                        <IntegrationContainer
                          clientId={selectedClientId}
                          feeintegration={feeIntegration || 0}
                          onTotalMediaChange={handleIntegrationTotalChange}
                          onBurstsChange={handleIntegrationBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleIntegrationItemsChange}
                          onMediaLineItemsChange={handleIntegrationMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["integration"]}
                          initialLineItems={integrationLineItems}
                        />
                      )}
                      {medium.name === "mp_production" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Production" />}>
                          <ProductionContainer
                            clientId={selectedClientId}
                            feesearch={feeConsulting || 0}
                            onTotalMediaChange={handleConsultingTotalChange}
                            onBurstsChange={handleConsultingBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={(items) => {
                              setConsultingItems(items)
                              setConsultingMediaLineItems(items)
                            }}
                            onMediaLineItemsChange={handleConsultingMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={mbaNumber}
                            mediaTypes={mediaTypes.map((m) => ({ value: m.label, label: m.label }))}
                            initialLineItems={consultingLineItems}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_search" && (
                        <SearchContainer
                          clientId={selectedClientId}
                          feesearch={feesearch || 0}
                          onTotalMediaChange={handleSearchTotalChange}
                          onBurstsChange={handleSearchBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleSearchItemsChange}
                          onMediaLineItemsChange={handleSearchMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["search"]}
                          initialLineItems={searchLineItems}
                        />
                      )}
                      {medium.name === "mp_socialmedia" && (
                        <SocialMediaContainer
                          clientId={selectedClientId}
                          feesocial={feesocial || 0}
                          onTotalMediaChange={handleSocialMediaTotalChange}
                          onBurstsChange={handleSocialMediaBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleSocialMediaItemsChange}
                          onSocialMediaLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleSocialMediaMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["socialmedia"]}
                          initialLineItems={socialMediaLineItems}
                        />
                      )}
                      {medium.name === "mp_progdisplay" && (
                        <ProgDisplayContainer
                          clientId={selectedClientId}
                          feeprogdisplay={feeprogdisplay || 0}
                          onTotalMediaChange={handleProgDisplayTotalChange}
                          onBurstsChange={handleProgDisplayBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleProgDisplayItemsChange}
                          onMediaLineItemsChange={handleProgDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["progdisplay"]}
                          initialLineItems={progDisplayLineItems}
                        />
                      )}
                      {medium.name === "mp_progvideo" && (
                        <ProgVideoContainer
                          clientId={selectedClientId}
                          feeprogvideo={feeprogvideo || 0}
                          onTotalMediaChange={handleProgVideoTotalChange}
                          onBurstsChange={handleProgVideoBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleProgVideoItemsChange}
                          onMediaLineItemsChange={handleProgVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["progvideo"]}
                          initialLineItems={progVideoLineItems}
                        />
                      )}
                      {medium.name === "mp_progbvod" && (
                        <ProgBVODContainer
                          clientId={selectedClientId}
                          feeprogbvod={feeprogbvod || 0}
                          onTotalMediaChange={handleProgBvodTotalChange}
                          onBurstsChange={handleProgBvodBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleProgBvodItemsChange}
                          onMediaLineItemsChange={handleProgBvodMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["progbvod"]}
                          initialLineItems={progBvodLineItems}
                        />
                      )}
                      {medium.name === "mp_progaudio" && (
                        <ProgAudioContainer
                          clientId={selectedClientId}
                          feeprogaudio={feeprogaudio || 0}
                          onTotalMediaChange={handleProgAudioTotalChange}
                          onBurstsChange={handleProgAudioBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleProgAudioItemsChange}
                          onMediaLineItemsChange={handleProgAudioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["progaudio"]}
                          initialLineItems={progAudioLineItems}
                        />
                      )}
                      {medium.name === "mp_progooh" && (
                        <ProgOOHContainer
                          clientId={selectedClientId}
                          feeprogooh={feeprogooh || 0}
                          onTotalMediaChange={handleProgOohTotalChange}
                          onBurstsChange={handleProgOohBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleProgOohItemsChange}
                          onMediaLineItemsChange={handleProgOohMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["progooh"]}
                          initialLineItems={progOohLineItems}
                        />
                      )}
                      {medium.name === "mp_influencers" && (
                        <InfluencersContainer
                          clientId={selectedClientId}
                          feeinfluencers={feeInfluencers ?? feecontentcreator ?? 0}
                          onTotalMediaChange={handleInfluencersTotalChange}
                          onBurstsChange={handleInfluencersBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={handleInfluencersItemsChange}
                          onMediaLineItemsChange={handleInfluencersMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={mbaNumber}
                          mediaTypes={["influencers"]}
                          initialLineItems={influencersLineItems}
                        />
                      )}
                    </Suspense>
                  </div>
                );
              })}
            </div>
          </div>
          </form>
          </Form>
        </div>

      <Dialog
        open={isUnsavedPromptOpen}
        onOpenChange={(open) => {
          if (!open) {
            stayOnPage();
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300" />
          <div className="p-6">
            <DialogHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-2">
                <DialogTitle>Leave without saving?</DialogTitle>
                <DialogDescription>
                  You have unsaved changes. Save your campaign before leaving or continue without saving.
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  onClick={stayOnPage}
                  className="ml-2 rounded-md border p-1 text-sm hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </DialogClose>
            </DialogHeader>
            <p className="mt-3 text-sm text-muted-foreground">
              Leaving now will discard any unsaved edits to this media plan.
            </p>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={stayOnPage}>
                No, stay on page
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={async () => {
                  stayOnPage();
                  await handleSaveAll();
                }}
                disabled={isLoading || isSaving}
              >
                {isLoading || isSaving ? "Saving..." : "Save campaign"}
              </Button>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={confirmNavigation}>
                Yes, leave without saving
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <SavingModal
        isOpen={shouldShowSaveModal}
        items={saveStatus}
        isSaving={isSaving}
        onClose={handleCloseSaveModal}
      />

      <OutcomeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        outcome={modalOutcome}
        isLoading={modalLoading}
      />

      <AlertDialog open={fullBillingResetConfirmOpen} onOpenChange={setFullBillingResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all billing to auto?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This <span className="font-medium text-foreground">replaces the entire billing schedule</span> (including
                  saved version data) with a fresh burst-derived schedule. It is the{" "}
                  <span className="font-medium text-foreground">only</span> action that fully rebuilds billing.
                </p>
                <p>
                  Line-item resets and fee / tech / production row resets only change part of the schedule and do not do
                  this.
                </p>
                <p>To undo, load an older plan version from version history if available.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                runConfirmedFullBillingResetToAuto()
              }}
            >
              Reset all billing to auto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Billing Modal */}
      <Dialog
        open={isManualBillingModalOpen}
        onOpenChange={(open) => {
          setIsManualBillingModalOpen(open)
          if (!open) {
            setManualBillingMonths([])
            setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
          <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b px-6 py-4">
              <DialogHeader>
                <DialogTitle>Manual Billing Schedule</DialogTitle>
              </DialogHeader>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Billing control surface:</span> the main page only adds new
                months, media types, and line items. Any reset or rebuild of existing amounts happens here only.
                Subtotals follow line items. <span className="font-medium text-foreground">Reset levels:</span> (1) Fee / Ad
                serving / Production row buttons — that cost bucket only, from auto month totals. (2) Per-row Reset — that
                line’s months from the auto snapshot. (3) “Reset billing to auto” in the footer — full schedule from bursts
                + line items; confirms before running. Save the campaign to persist a new version baseline.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
              <Accordion type="multiple" className="w-full">
                {mediaTypes
                  .filter((medium) => medium.name !== "mp_production")
                  .filter((medium) => form.watch(medium.name as any) && medium.component)
                  .map((medium) => {
                    const mediaKey = mediaKeyMap[medium.name]
                    const headers = getMediaTypeHeaders(mediaKey)
                    const firstMonth = manualBillingMonths[0]
                    const lineItems = firstMonth?.lineItems?.[mediaKey as keyof typeof firstMonth.lineItems] as
                      | BillingLineItemType[]
                      | undefined

                    if (!lineItems || lineItems.length === 0) return null

                    return (
                      <AccordionItem key={medium.name} value={`manual-billing-${medium.name}`}>
                        <AccordionTrigger className="text-left">{medium.label}</AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto mt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[90px]">Reset row</TableHead>
                                  <TableHead className="w-[90px]">Pre-bill</TableHead>
                                  <TableHead>{headers.header1}</TableHead>
                                  <TableHead>{headers.header2}</TableHead>
                                  {manualBillingMonths.map((m) => (
                                    <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
                                      {m.monthYear}
                                    </TableHead>
                                  ))}
                                  <TableHead className="text-right font-bold">Media Total</TableHead>
                                  <TableHead className="text-right">Fee Total</TableHead>
                                  <TableHead className="text-right">Ad Serving Total</TableHead>
                                </TableRow>
                              </TableHeader>

                              <TableBody>
                                {lineItems.map((lineItem) => (
                                  <TableRow key={lineItem.id}>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleManualBillingLineItemResetToAuto(mediaKey, lineItem.id)}
                                      >
                                        Reset
                                      </Button>
                                    </TableCell>
                                    <TableCell>
                                      <Checkbox
                                        checked={Boolean(lineItem.preBill)}
                                        onCheckedChange={(next) =>
                                          handleManualBillingLineItemPreBillToggle(mediaKey, lineItem.id, Boolean(next))
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>{lineItem.header1}</TableCell>
                                    <TableCell>{lineItem.header2}</TableCell>
                                    {manualBillingMonths.map((month, monthIndex) => {
                                      const monthAmount = lineItem.monthlyAmounts?.[month.monthYear] || 0
                                      return (
                                        <TableCell key={month.monthYear} align="right">
                                          <EditableLineItemMonthInput
                                            key={`${lineItem.id}__${month.monthYear}`}
                                            className="text-right w-28"
                                            amount={monthAmount}
                                            formatter={mbaCurrencyFormatter}
                                            onAmountChange={(numericValue) => {
                                              const tempCopy = [...manualBillingMonths]
                                              syncLineItemMonthlyAmountAcrossAllMonthRows(
                                                tempCopy,
                                                mediaKey,
                                                lineItem.id,
                                                month.monthYear,
                                                numericValue
                                              )
                                              setManualBillingMonths(tempCopy)
                                            }}
                                            onCommit={(raw) =>
                                              handleManualBillingChange(
                                                monthIndex,
                                                "lineItem",
                                                raw,
                                                mediaKey,
                                                lineItem.id,
                                                month.monthYear
                                              )
                                            }
                                          />
                                        </TableCell>
                                      )
                                    })}
                                    <TableCell className="text-right font-semibold">
                                      {new Intl.NumberFormat("en-AU", {
                                        style: "currency",
                                        currency: "AUD",
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }).format(lineItem.totalAmount || 0)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                      {new Intl.NumberFormat("en-AU", {
                                        style: "currency",
                                        currency: "AUD",
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }).format(lineItem.totalFeeAmount || 0)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                      {new Intl.NumberFormat("en-AU", {
                                        style: "currency",
                                        currency: "AUD",
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }).format(lineItem.totalAdServingAmount || 0)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>

                              <TableFooter>
                                <TableRow className="font-bold border-t-2 bg-muted/30">
                                  <TableCell colSpan={4}>Subtotal</TableCell>
                                  {manualBillingMonths.map((m) => {
                                    const subtotal = lineItems.reduce((sum, li) => sum + (li.monthlyAmounts?.[m.monthYear] || 0), 0)
                                    return (
                                      <TableCell key={m.monthYear} className="text-right">
                                        {new Intl.NumberFormat("en-AU", {
                                          style: "currency",
                                          currency: "AUD",
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }).format(subtotal)}
                                      </TableCell>
                                    )
                                  })}
                                  <TableCell className="text-right">
                                    {new Intl.NumberFormat("en-AU", {
                                      style: "currency",
                                      currency: "AUD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }).format(
                                      lineItems.reduce((sum, li) => sum + (li.totalAmount || 0), 0)
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {new Intl.NumberFormat("en-AU", {
                                      style: "currency",
                                      currency: "AUD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }).format(
                                      lineItems.reduce((sum, li) => sum + (li.totalFeeAmount || 0), 0)
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {new Intl.NumberFormat("en-AU", {
                                      style: "currency",
                                      currency: "AUD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }).format(
                                      lineItems.reduce((sum, li) => sum + (li.totalAdServingAmount || 0), 0)
                                    )}
                                  </TableCell>
                                </TableRow>
                              </TableFooter>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}

                <AccordionItem value="manual-billing-costs">
                  <AccordionTrigger className="text-left">Fees, Ad Serving &amp; Production</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Level 1 — each Reset copies only that bucket from the auto schedule (same month column); line items are
                      unchanged.
                    </p>
                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[70px]">Reset bucket</TableHead>
                            <TableHead className="w-[90px]">Pre-bill</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Details</TableHead>
                            {manualBillingMonths.map((m) => (
                              <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
                                {m.monthYear}
                              </TableHead>
                            ))}
                            <TableHead className="text-right font-bold">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Fees */}
                          <TableRow>
                            <TableCell>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleManualBillingCostResetToAuto("fee")}
                              >
                                Reset
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.fee}
                                onCheckedChange={(next) => handleManualBillingCostPreBillToggle("fee", Boolean(next))}
                              />
                            </TableCell>
                            <TableCell className="font-medium">Fees</TableCell>
                            <TableCell className="text-muted-foreground">Total</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <div className="space-y-1">
                                  <Input
                                    className="text-right w-28"
                                    value={month.feeTotal}
                                    onBlur={(e) => handleManualBillingChange(monthIndex, "fee", e.target.value)}
                                    onChange={(e) => {
                                      const tempCopy = [...manualBillingMonths]
                                      tempCopy[monthIndex].feeTotal = e.target.value
                                      setManualBillingMonths(tempCopy)
                                    }}
                                  />
                                  <div className="text-[10px] text-muted-foreground">
                                    Auto:{" "}
                                    {autoReferenceBillingMonthsRef.current.find((am) => am.monthYear === month.monthYear)
                                      ?.feeTotal || "$0.00"}
                                  </div>
                                </div>
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {new Intl.NumberFormat("en-AU", {
                                style: "currency",
                                currency: "AUD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(
                                manualBillingMonths.reduce(
                                  (acc, m) => acc + (parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Ad Serving */}
                          <TableRow>
                            <TableCell>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleManualBillingCostResetToAuto("adServing")}
                              >
                                Reset
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.adServing}
                                onCheckedChange={(next) => handleManualBillingCostPreBillToggle("adServing", Boolean(next))}
                              />
                            </TableCell>
                            <TableCell className="font-medium">Ad Serving</TableCell>
                            <TableCell className="text-muted-foreground">Tech fees</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <div className="space-y-1">
                                  <Input
                                    className="text-right w-28"
                                    value={month.adservingTechFees}
                                    onBlur={(e) => handleManualBillingChange(monthIndex, "adServing", e.target.value)}
                                    onChange={(e) => {
                                      const tempCopy = [...manualBillingMonths]
                                      tempCopy[monthIndex].adservingTechFees = e.target.value
                                      setManualBillingMonths(tempCopy)
                                    }}
                                  />
                                  <div className="text-[10px] text-muted-foreground">
                                    Auto:{" "}
                                    {autoReferenceBillingMonthsRef.current.find((am) => am.monthYear === month.monthYear)
                                      ?.adservingTechFees || "$0.00"}
                                  </div>
                                </div>
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {new Intl.NumberFormat("en-AU", {
                                style: "currency",
                                currency: "AUD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(
                                manualBillingMonths.reduce(
                                  (acc, m) =>
                                    acc + (parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Production */}
                          <TableRow>
                            <TableCell>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleManualBillingCostResetToAuto("production")}
                              >
                                Reset
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.production}
                                onCheckedChange={(next) => handleManualBillingCostPreBillToggle("production", Boolean(next))}
                              />
                            </TableCell>
                            <TableCell className="font-medium">Production</TableCell>
                            <TableCell className="text-muted-foreground">Total</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <div className="space-y-1">
                                  <Input
                                    className="text-right w-28"
                                    value={month.production || "$0.00"}
                                    onBlur={(e) =>
                                      handleManualBillingChange(monthIndex, "production", e.target.value, "production")
                                    }
                                    onChange={(e) => {
                                      const tempCopy = [...manualBillingMonths]
                                      tempCopy[monthIndex].production = e.target.value
                                      if (tempCopy[monthIndex].mediaCosts?.production !== undefined) {
                                        tempCopy[monthIndex].mediaCosts.production = e.target.value
                                      }
                                      setManualBillingMonths(tempCopy)
                                    }}
                                  />
                                  <div className="text-[10px] text-muted-foreground">
                                    Auto:{" "}
                                    {autoReferenceBillingMonthsRef.current.find((am) => am.monthYear === month.monthYear)
                                      ?.production || "$0.00"}
                                  </div>
                                </div>
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {new Intl.NumberFormat("en-AU", {
                                style: "currency",
                                currency: "AUD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(
                                manualBillingMonths.reduce(
                                  (acc, m) => acc + (parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="text-right">
                <span className="font-bold">Grand Total: {billingTotalDisplayFromManual}</span>
                {billingError.show && (
                  <div className="mt-2 space-y-3 rounded border p-3 text-sm">
                    {billingError.blockingErrors.length > 0 && (
                      <div className="rounded border border-destructive/60 bg-destructive/10 p-3 text-destructive">
                        <p className="font-semibold">Blocking — fix before a clean save</p>
                        <p className="mt-1 text-xs text-destructive/90">
                          These break internal consistency (month totals vs line items, production vs media costs, or orphan
                          rows tied to removed media). Campaign save will be blocked until resolved.
                        </p>
                        <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-4">
                          {billingError.blockingErrors.map((message, idx) => (
                            <li key={`b-${idx}-${message.slice(0, 24)}`}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {billingError.preservedOverrides.length > 0 && (
                      <div className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-950">
                        <p className="font-semibold">Preserved manual billing (informational)</p>
                        <p className="mt-1 text-xs text-amber-900/90">
                          Billing differs from current bursts or fee auto-calculation — normal if you edited amounts on purpose.
                          Campaign save still allows these unless you fix them.
                        </p>
                        <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-4">
                          {billingError.preservedOverrides.map((message, idx) => (
                            <li key={`p-${idx}-${message.slice(0, 24)}`}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleManualBillingSave(true)}>
                        Save anyway (accept all listed issues)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t px-6 py-4">
              <DialogFooter className="sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsManualBillingModalOpen(false)
                      setBillingError({ show: false, blockingErrors: [], preservedOverrides: [] })
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setFullBillingResetConfirmOpen(true)
                    }}
                  >
                    Reset billing to auto
                  </Button>
                  <Button type="button" onClick={() => handleManualBillingSave()}>
                    Save Billing Changes
                  </Button>
                </div>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Partial MBA Modal === */}
      <Dialog open={isPartialMBAModalOpen} onOpenChange={(open) => {
        setIsPartialMBAModalOpen(open);
        if (!open) setPartialMBAError(null);
      }}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
          <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-6 pt-6">
              <DialogHeader>
                <DialogTitle>Partial MBA Override</DialogTitle>
              </DialogHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {(() => {
              const campaignBudget = form.watch("mp_campaignbudget") || 0
              const totalInvestment =
                partialMBAValues.grossMedia +
                partialMBAValues.assembledFee +
                partialMBAValues.adServing +
                partialMBAValues.production
              const diff = totalInvestment - campaignBudget
              if (!campaignBudget || Math.abs(diff) <= 2) return null

              return (
                <div className="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-md" role="alert">
                  <p className="font-bold">Budget mismatch (warning)</p>
                  <p className="text-sm">
                    Campaign Budget:{" "}
                    {formatMoney(campaignBudget, {
                      locale: "en-US",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    . Total Investment:{" "}
                    {formatMoney(totalInvestment, {
                      locale: "en-US",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    . Difference:{" "}
                    {formatMoney(Math.abs(diff), {
                      locale: "en-US",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {diff > 0 ? "over" : "under"}.
                  </p>
                </div>
              )
            })()}

            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery months</label>
              <MultiSelectCombobox
                options={(() => {
                  const primary = workingBillingMonths
                  const src = billingMonthsHaveDetailedLineItems(primary)
                    ? primary
                    : autoDeliveryMonths.length > 0
                      ? autoDeliveryMonths
                      : workingBillingMonths
                  return src.map((m): MultiSelectOption => ({ value: m.monthYear, label: m.monthYear }))
                })()}
                values={partialMBAMonthYears}
                onValuesChange={handlePartialMBAMonthsChange}
                placeholder="Select months"
                allSelectedText="All months"
              />
              <p className="text-xs text-muted-foreground">
                Changing months or line selection recalculates media from checked lines; assembled fee and ad serving scale with the share of line-item media included.
              </p>
            </div>
            <h4 className="font-semibold text-md border-b pb-2">Media Totals (Expandable by line item)</h4>
            <Accordion type="multiple" className="w-full">
              {mediaTypes
                .filter((medium) => medium.name !== "mp_production")
                .filter((medium) => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
                .map((medium) => {
                  const mediaKey = mediaKeyMap[medium.name]
                  const checked = partialMBAMediaEnabled[mediaKey] ?? true
                  const items = partialMBALineItemsByMedia[mediaKey] || []
                  return (
                    <AccordionItem key={medium.name} value={medium.name}>
                      <AccordionTrigger
                        leading={
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => handlePartialMBAToggleMedia(mediaKey, Boolean(next))}
                          />
                        }
                      >
                        <div className="flex w-full items-center justify-between pr-4">
                          <span className="text-sm font-medium">{medium.label}</span>
                          <span className="text-sm">
                            {formatMoney(partialMBAValues.mediaTotals[mediaKey] || 0, {
                              locale: "en-US",
                              currency: "USD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-2">
                          {items.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No line items found for selected months.</p>
                          ) : (
                            items.map((item) => {
                              const itemChecked = (partialMBASelectedLineItemIds[mediaKey] || []).includes(item.lineItemId)
                              return (
                                <div key={item.lineItemId} className="flex items-center justify-between gap-2 text-sm">
                                  <label className="flex min-w-0 flex-1 items-start gap-2">
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={itemChecked}
                                      onCheckedChange={(next) => handlePartialMBAToggleLineItem(mediaKey, item.lineItemId, Boolean(next))}
                                    />
                                    <span className="min-w-0 leading-snug">
                                      <span className="font-medium tabular-nums text-muted-foreground">
                                        {item.lineNumber != null ? `Line ${item.lineNumber}` : "Line —"}
                                      </span>
                                      {" · "}
                                      <span className="font-medium">{item.header1 || "—"}</span>
                                      {item.header2 ? (
                                        <>
                                          {" · "}
                                          <span>{item.header2}</span>
                                        </>
                                      ) : null}
                                    </span>
                                  </label>
                                  <span className="shrink-0 tabular-nums">
                                    {formatMoney(item.amount, {
                                      locale: "en-US",
                                      currency: "USD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
            </Accordion>
            
            {/* Aggregated Totals */}
            <h4 className="font-semibold text-md border-b pb-2 pt-4">Summary Totals</h4>
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Gross Media Total</label>
                <Input
                  className="text-right w-48 bg-muted"
                  value={formatMoney(partialMBAValues.grossMedia, {
                    locale: "en-US",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  readOnly // This field is calculated automatically
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Assembled Fee</label>
                <Input
                  className="text-right w-48"
                  value={formatMoney(partialMBAValues.assembledFee, {
                    locale: "en-US",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  onBlur={(e) => handlePartialMBAChange('assembledFee', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, assembledFee: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Ad Serving & Tech Fees</label>
                <Input
                  className="text-right w-48"
                  value={formatMoney(partialMBAValues.adServing, {
                    locale: "en-US",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  onBlur={(e) => handlePartialMBAChange('adServing', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, adServing: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Production</label>
                <Input
                  className="text-right w-48"
                  value={formatMoney(partialMBAValues.production, {
                    locale: "en-US",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  onBlur={(e) => handlePartialMBAChange('production', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, production: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
                />
              </div>
              <div className="border-t pt-4 mt-4 flex items-center justify-between">
                <label className="text-sm font-bold">Total Investment (ex GST)</label>
                <div className="text-right w-48 font-bold p-2">
                  {formatMoney(
                    partialMBAValues.grossMedia +
                      partialMBAValues.assembledFee +
                      partialMBAValues.adServing +
                      partialMBAValues.production,
                    {
                      locale: "en-US",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </div>
              </div>
            </div>
          </div>
            </div>
            <div className="shrink-0 border-t px-6 py-4">
          <DialogFooter className="sm:justify-between pt-0">
            <Button variant="outline" onClick={handlePartialMBAReset} className="sm:mr-auto">
              Reset Changes
            </Button>
            <div className="flex space-x-2">
              <Button variant="ghost" onClick={() => setIsPartialMBAModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePartialMBASave}>Save Partial MBA</Button>
            </div>
          </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Spacer so the fixed save bar never covers the last field */}
      <div
        aria-hidden="true"
        style={{ height: stickyBarHeight ? stickyBarHeight + 24 : 160 }}
      />

      {/* Sticky action bar: single centered pill (main column only, excludes sidebar) */}
      <div
        ref={stickyBarRef}
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-center md:left-[var(--sidebar-width)]"
      >
        <div className="inline-flex max-w-full flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
          {hasBillingMismatch && (
            <div className="flex items-center gap-2 text-center text-sm font-medium text-amber-600 dark:text-amber-500">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                Billing schedule has differences from line items — open Edit Billing to review or run a full reset
              </span>
            </div>
          )}
          <CampaignExportsSection
            variant="embedded"
            mbaNumber={mbaNumber}
            lineItemCount={editLineItemCount}
            isBusy={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
            ariaStatus=""
            className="z-40 max-w-[min(98vw,88rem)]"
          >
            <Button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || isLoading}
              className="h-9 shrink-0 rounded-full bg-success px-4 text-white shadow-sm hover:bg-success-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateMBA}
              disabled={isLoading}
              className="h-9 shrink-0 rounded-full border-border px-4 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isLoading ? "Generating..." : "Generate MBA"}
            </Button>
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
                      >
                        <MoreHorizontal className="mr-1.5 h-4 w-4" />
                        Downloads
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={handleDownloadMediaPlan}
                        disabled={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
                      >
                        Media Plan
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                        disabled={
                          !hasAdvertisingAssociatesBilling ||
                          isDownloading ||
                          isDownloadingAa ||
                          isNamingDownloading ||
                          isLoading ||
                          isSaving
                        }
                        className={cn(
                          "text-brand-dark focus:bg-highlight/25 focus:text-brand-dark",
                          !hasAdvertisingAssociatesBilling && "opacity-50",
                        )}
                      >
                        Media Plan (AA)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDownloadNamingConventions}
                        disabled={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
                      >
                        Naming Conventions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleSaveAndDownloadAll}
                        disabled={isLoading || isDownloading || isDownloadingAa || isSaving}
                      >
                        Save &amp; Download All
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  type="button"
                  onClick={handleDownloadMediaPlan}
                  disabled={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
                  className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-lime hover:bg-lime/90 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">{isDownloading ? "Downloading..." : "Media Plan"}</span>
                </Button>
                <Button
                  type="button"
                  onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                  disabled={
                    !hasAdvertisingAssociatesBilling ||
                    isDownloading ||
                    isDownloadingAa ||
                    isNamingDownloading ||
                    isLoading ||
                    isSaving
                  }
                  className={cn(
                    "hidden h-9 rounded-full px-4 py-2 md:inline-flex bg-highlight text-brand-dark hover:bg-highlight/85 focus-visible:ring-2 focus-visible:ring-ring",
                    !hasAdvertisingAssociatesBilling && "opacity-50 grayscale",
                  )}
                >
                  {isDownloadingAa ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isDownloadingAa ? "Creating AA Plan..." : "Media Plan (AA)"}
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={handleDownloadNamingConventions}
                  disabled={isDownloading || isDownloadingAa || isNamingDownloading || isLoading || isSaving}
                  className="hidden h-9 rounded-full px-4 py-2 md:inline-flex bg-muted text-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isNamingDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isNamingDownloading ? "Generating Names..." : "Naming Conventions"}
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveAndDownloadAll}
                  disabled={isLoading || isDownloading || isDownloadingAa || isSaving}
                  className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-brand-dark hover:bg-brand-dark/90 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isLoading || isDownloading || isDownloadingAa ? "Processing..." : "Save & Download All"}
                  </span>
                </Button>
              </CampaignExportsSection>
        </div>
      </div>
      </div>

      <FloatingSectionNav sections={enabledSections} storageKey="mediaplan-edit-section-nav-collapsed" />
    </div>
  )
}

