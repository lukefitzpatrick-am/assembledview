/**
 * Map MBA editor media-line configs to LineItemInput[] for computeCampaignFinancials.
 */

import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { resolveProductionBurstBudget } from "@/lib/mediaplan/resolveProductionBurstBudget"
import { parseMoneyInput } from "@/lib/format/money"
import type {
  BurstInput,
  FeeLoading,
  LineItemApproval,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"

export type EditorFeeState = {
  feetelevision?: number | null
  feeradio?: number | null
  feenewspapers?: number | null
  feemagazines?: number | null
  feeooh?: number | null
  feecinema?: number | null
  feedigidisplay?: number | null
  feedigiaudio?: number | null
  feedigivideo?: number | null
  feebvod?: number | null
  feeintegration?: number | null
  feesearch?: number | null
  feesocial?: number | null
  feeprogdisplay?: number | null
  feeprogvideo?: number | null
  feeprogbvod?: number | null
  feeprogaudio?: number | null
  feeprogooh?: number | null
  feeinfluencers?: number | null
  feecontentcreator?: number | null
}

export type BuildEditorLineItemInputsOpts = {
  isPartialMBA?: boolean
  /** Stable billing ids selected per mediaKey when partial MBA is on. */
  partialMBASelectedLineItemIds?: Record<string, string[]>
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  return parseMoneyInput(value as string | number | null | undefined) ?? 0
}

/** Same id shape as edit-page billingStableLineItemId / fee-seed. */
export function editorBillingStableLineItemId(
  mediaType: string,
  lineItem: unknown,
  index: number
): string {
  const li = lineItem as { line_item_id?: unknown; id?: unknown } | null
  const raw = li?.line_item_id ?? li?.id
  if (raw != null && String(raw).trim() !== "") {
    return `billing-${mediaType}::${String(raw)}`
  }
  return `billing-${mediaType}::new-${index}`
}

export function buildFeeLoadingFromEditorFees(fees: EditorFeeState): FeeLoading {
  const out: FeeLoading = {}
  const set = (key: keyof FeeLoading, value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value
    }
  }
  set("feetelevision", fees.feetelevision)
  set("feeradio", fees.feeradio)
  set("feenewspapers", fees.feenewspapers)
  set("feemagazines", fees.feemagazines)
  set("feeooh", fees.feeooh)
  set("feecinema", fees.feecinema)
  set("feedigidisplay", fees.feedigidisplay)
  set("feedigiaudio", fees.feedigiaudio)
  set("feedigivideo", fees.feedigivideo)
  set("feebvod", fees.feebvod)
  set("feeintegration", fees.feeintegration)
  set("feesearch", fees.feesearch)
  set("feesocial", fees.feesocial)
  set("feeprogdisplay", fees.feeprogdisplay)
  set("feeprogvideo", fees.feeprogvideo)
  set("feeprogbvod", fees.feeprogbvod)
  set("feeprogaudio", fees.feeprogaudio)
  set("feeprogooh", fees.feeprogooh)
  set("feeinfluencers", fees.feeinfluencers)
  set("feecontentcreator", fees.feecontentcreator)
  return out
}

function resolveBuyType(lineItem: Record<string, unknown>): string {
  return String(lineItem.buy_type ?? lineItem.buyType ?? "")
}

function resolveBudgetIncludesFees(lineItem: Record<string, unknown>): boolean {
  return Boolean(lineItem.budget_includes_fees ?? lineItem.budgetIncludesFees)
}

function resolveClientPaysForMedia(lineItem: Record<string, unknown>): boolean {
  return Boolean(
    lineItem.client_pays_for_media ??
      lineItem.clientPaysForMedia ??
      lineItem.client_pays_media
  )
}

function resolveNoAdserving(lineItem: Record<string, unknown>): boolean {
  return Boolean(
    lineItem.no_adserving ?? lineItem.noadserving ?? lineItem.noAdserving ?? false
  )
}

function mapBurst(burst: any, mediaType: string): BurstInput {
  const isProduction = mediaType === "production"
  const production = isProduction ? resolveProductionBurstBudget(burst) : null
  const budget = production
    ? production.effectiveBudget
    : parseMoney(burst?.budget) || 0
  const buyAmount = parseMoney(burst?.buyAmount ?? burst?.buy_amount)
  const deliverables =
    production?.deliverables ??
    (typeof burst?.deliverables === "number"
      ? burst.deliverables
      : typeof burst?.calculatedValue === "number"
        ? burst.calculatedValue
        : undefined)
  const calculatedValue =
    typeof burst?.calculatedValue === "number" ? burst.calculatedValue : undefined

  const input: BurstInput = {
    startDate: burst?.startDate ?? burst?.start_date ?? "",
    endDate: burst?.endDate ?? burst?.end_date ?? "",
    budget,
    buyAmount: buyAmount || undefined,
  }
  if (deliverables != null && Number.isFinite(deliverables)) {
    input.deliverables = deliverables
  }
  if (calculatedValue != null) {
    input.calculatedValue = calculatedValue
  }
  if (typeof burst?.adServingRatePct === "number") {
    input.adServingRatePct = burst.adServingRatePct
  }
  if (typeof burst?.adServingImpressions === "number") {
    input.adServingImpressions = burst.adServingImpressions
  }
  return input
}

export function resolveApproval(
  mediaType: string,
  lineItemId: string,
  opts?: BuildEditorLineItemInputsOpts
): LineItemApproval {
  if (!opts?.isPartialMBA) return "approved"
  const selected = opts.partialMBASelectedLineItemIds?.[mediaType]
  // Unlisted / missing channel → fully IN (new channel or reload without metadata).
  if (selected === undefined) return "approved"
  // Explicit empty selection → channel managed as all-excluded.
  if (selected.length === 0) return "excluded"
  // Managed channel: only selected line ids are approved (new lines default out).
  return selected.includes(lineItemId) ? "approved" : "excluded"
}

/**
 * Walk enabled media configs (same shape as edit-page fee-seed configs) into
 * engine inputs. Leaves feePct unset so FeeLoading is the source of truth.
 */
export function buildEditorLineItemInputs(
  mediaConfigs: SeedLineFeesMediaConfig[],
  opts?: BuildEditorLineItemInputsOpts
): LineItemInput[] {
  const out: LineItemInput[] = []

  for (const config of mediaConfigs) {
    const { billingKey, lineItems } = config
    if (!lineItems?.length) continue

    lineItems.forEach((rawLine, index) => {
      const lineItem = (rawLine ?? {}) as Record<string, unknown>
      const lineItemId = editorBillingStableLineItemId(billingKey, rawLine, index)
      const rawBursts = resolveLineItemBursts(rawLine)
      const bursts = rawBursts.map((b) => mapBurst(b, billingKey))
      const buyType = resolveBuyType(lineItem)

      let enteredAmount = bursts.reduce((sum, b) => sum + parseMoney(b.budget), 0)
      if (enteredAmount <= 0) {
        enteredAmount = parseMoney(
          lineItem.totalMedia ?? lineItem.total_media ?? lineItem.budget
        )
      }

      const rate =
        bursts.map((b) => parseMoney(b.buyAmount)).find((n) => n > 0) ?? 0

      const buyTypeLower = buyType.toLowerCase()
      const isManualDeliverables =
        buyTypeLower === "bonus" || buyTypeLower === "package_inclusions"
      const deliverablesManual = isManualDeliverables
        ? bursts.reduce((sum, b) => {
            const v =
              (typeof b.deliverables === "number" ? b.deliverables : 0) ||
              (typeof b.calculatedValue === "number" ? b.calculatedValue : 0)
            return sum + v
          }, 0)
        : undefined

      const input: LineItemInput = {
        lineItemId,
        mediaType: billingKey,
        buyType,
        rate,
        enteredAmount,
        budgetIncludesFees: resolveBudgetIncludesFees(lineItem),
        clientPaysForMedia: resolveClientPaysForMedia(lineItem),
        noAdserving: resolveNoAdserving(lineItem),
        bursts,
        approval: resolveApproval(billingKey, lineItemId, opts),
      }
      if (deliverablesManual != null) {
        input.deliverablesManual = deliverablesManual
      }
      out.push(input)
    })
  }

  return out
}
