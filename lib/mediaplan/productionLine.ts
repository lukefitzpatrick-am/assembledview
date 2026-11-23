import type { BillingBurst } from "@/lib/billing/types"
import { resolveBuyTypeForChannel } from "@/lib/mediaplan/deliverableBudget"
import { defaultMediaBurstEndDate, defaultMediaBurstStartDate } from "@/lib/date-picker-anchor"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { formatProductionBurstForPersist } from "@/lib/mediaplan/resolveProductionBurstBudget"
import { roundMoney2 } from "@/lib/money"
import type { UseFormReturn } from "react-hook-form"

/**
 * Production's own line rules on the shared channel container (W5l), moved
 * unchanged from its old container: the load, the card's cost and quantity
 * money, the billing bursts, the save row and the Excel row.
 *
 * Production has no buy types, no fee and no Budget field. A burst is a unit
 * cost and a quantity; its money is cost x quantity, written to the standard
 * `budget`, `buyAmount` and `calculatedValue` keys exactly as save persists
 * them (`formatProductionBurstForPersist`), so the shared totals, summary,
 * investment chart, card title and expert carry read Production's money
 * without a rule of their own.
 */

type Line = Record<string, unknown>
type FormBurst = { cost?: unknown; amount?: unknown; startDate?: unknown; endDate?: unknown }
type FormLine = Line & { bursts: FormBurst[] }
type Ctx = { feePct: number; mbaNumber: string; campaignStartDate: Date; campaignEndDate: Date; index: number }

/** Date-only (local midnight) so a stored instant cannot shift the day. */
function toDateOnly(d?: Date | string | null): Date | null {
  if (!d) return null
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) return null
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
}

function formatDateString(d?: Date | string): string {
  const dateObj = toDateOnly(d)
  if (!dateObj) return ""
  const year = dateObj.getFullYear()
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

function num(value: unknown): number {
  if (typeof value === "string") return parseFloat(value.replace(/[^0-9.-]/g, "")) || 0
  return Number(value || 0)
}

/** A burst's money from its cost and quantity, in the keys save persists. */
function burstMoney(cost: number, amount: number) {
  const media = cost * amount
  return {
    budget: Number.isFinite(media) ? String(roundMoney2(media)) : "0",
    buyAmount: String(amount),
    calculatedValue: amount,
  }
}

/**
 * Load: the field map's fields, then Production's own fallbacks (production
 * type from `mediaType`, `platform` or `media_type`; publisher from
 * `publisher` or `network`; description from `description` or `creative`; unit
 * rate from `unitRate`, `unitCost`, `unit_cost` or the first burst's cost), a
 * blank buy type read as "production" (C-91), the line's own id fallback
 * (index + 1, no line number key: the save path numbers lines from the ids),
 * and each burst as cost, quantity, dates and that money.
 */
export function productionHydrateLine(line: Line, saved: Line, ctx: Ctx): Line & { bursts: Line[] } {
  const {
    line_item: _a,
    lineItem: _b,
    line_item_id: _c,
    lineItemId: _d,
    bursts: _e,
    totalMedia: _f,
    totalDeliverables: _g,
    totalFee: _h,
    ...fields
  } = line
  const rawBursts =
    typeof saved.bursts_json === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(saved.bursts_json as string)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : Array.isArray(saved.bursts_json)
        ? saved.bursts_json
        : Array.isArray(saved.bursts)
          ? saved.bursts
          : []

  const bursts = (rawBursts as Line[]).map((burst) => {
    const cost = num(burst.cost)
    const amount = num(burst.amount ?? burst.deliverables ?? 0)
    const fallbackStart = defaultMediaBurstStartDate(ctx.campaignStartDate, ctx.campaignEndDate)
    const startDate =
      toDateOnly(burst.startDate as Date | string) ??
      toDateOnly(burst.start_date as Date | string) ??
      toDateOnly(fallbackStart) ??
      fallbackStart
    let endDate = toDateOnly(burst.endDate as Date | string) ?? toDateOnly(burst.end_date as Date | string)
    if (!endDate) {
      const fallbackEnd = defaultMediaBurstEndDate(ctx.campaignStartDate, ctx.campaignEndDate)
      endDate = toDateOnly(fallbackEnd) || fallbackEnd
    }
    return { cost, amount, ...burstMoney(cost, amount), startDate, endDate }
  })

  const firstCost = bursts[0]?.cost
  return {
    ...fields,
    mediaType: saved.mediaType || saved.platform || saved.media_type || "",
    publisher: saved.publisher || saved.network || "",
    description: saved.description || saved.creative || "",
    // Hydration shim: unitCost / unit_cost → unitRate; else the first burst's cost.
    unitRate:
      saved.unitRate ??
      saved.unitCost ??
      saved.unit_cost ??
      (firstCost != null && firstCost !== 0 ? firstCost : ""),
    lineItemId:
      saved.line_item_id ||
      saved.lineItemId ||
      buildLineItemId(ctx.mbaNumber, MEDIA_TYPE_ID_CODES.production, ctx.index + 1),
    buyType: resolveBuyTypeForChannel(
      "production",
      (saved.buy_type ?? saved.buyType) as string | null | undefined,
    ),
    bursts: bursts.length > 0 ? bursts : [defaultProductionBurst(ctx)],
  }
}

function defaultProductionBurst(ctx: Ctx) {
  const startRaw = defaultMediaBurstStartDate(ctx.campaignStartDate, ctx.campaignEndDate)
  const endRaw = defaultMediaBurstEndDate(ctx.campaignStartDate, ctx.campaignEndDate)
  return {
    cost: 0,
    amount: 0,
    ...burstMoney(0, 0),
    startDate: toDateOnly(startRaw) || startRaw,
    endDate: toDateOnly(endRaw) || endRaw,
  }
}

/**
 * The card's cost and quantity money, after a burst or unit rate edit: each
 * burst's `budget`, `buyAmount` and `calculatedValue` follow its cost and
 * quantity. A `rate` also writes that cost on every burst of the line.
 */
export function writeProductionBurstMoney(
  form: UseFormReturn<any>,
  fieldKey: string,
  lineItemIndex: number,
  rate?: string,
): void {
  const path = `${fieldKey}.${lineItemIndex}`
  const bursts = (form.getValues(`${path}.bursts`) || []) as FormBurst[]
  const parsedRate = rate === undefined ? null : num(rate)
  bursts.forEach((_, burstIndex) => {
    const burstPath = `${path}.bursts.${burstIndex}`
    if (parsedRate !== null) {
      form.setValue(`${burstPath}.cost`, parsedRate, { shouldDirty: true })
    }
    const burst = (form.getValues(burstPath) || {}) as FormBurst
    const money = burstMoney(Number(burst.cost) || 0, Number(burst.amount) || 0)
    for (const [key, value] of Object.entries(money)) {
      form.setValue(`${burstPath}.${key}`, value, { shouldValidate: false, shouldDirty: false })
    }
  })
}

/** Billing: label "production", buy type "production", no fee, the burst's quantity. */
export function productionBillingBursts(form: Pick<UseFormReturn, "getValues">): BillingBurst[] {
  const lineItems = (form.getValues("lineItems") || []) as FormLine[]
  return lineItems.flatMap((lineItem) =>
    (lineItem.bursts || []).map((burst) => {
      const startDate = toDateOnly(burst.startDate as Date | string) || new Date()
      const endDate = toDateOnly(burst.endDate as Date | string) || startDate
      const mediaAmount = (Number(burst.cost) || 0) * (Number(burst.amount) || 0)
      return {
        startDate,
        endDate,
        mediaAmount,
        feeAmount: 0,
        totalAmount: mediaAmount,
        mediaType: "production",
        feePercentage: 0,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noAdserving: false,
        deliverables: Number(burst.amount) || 0,
        buyType: "production",
      } as BillingBurst
    }),
  )
}

/**
 * Save: the hook's row without its unit rate, fee percent and total media,
 * the line's own camel `unitRate`, and each burst dual-written
 * (`formatProductionBurstForPersist`).
 */
export function productionSaveLine(row: Line, line: FormLine): Line {
  const {
    unit_rate: _rate,
    feePct: _fee,
    totalMedia: _total,
    line_item_id: lineItemId,
    bursts: _bursts,
    line_item: lineNumber,
    ...head
  } = row
  return {
    ...head,
    unitRate: line.unitRate ?? "",
    line_item_id: lineItemId,
    bursts: (line.bursts || []).map((burst) =>
      formatProductionBurstForPersist(
        {
          cost: Number(burst.cost) || 0,
          amount: Number(burst.amount) || 0,
          startDate: formatDateString(burst.startDate as Date | string),
          endDate: formatDateString(burst.endDate as Date | string),
        },
        line,
      ),
    ),
    line_item: lineNumber,
  }
}

/**
 * Excel: one row per burst. Every production row exports as platform
 * "production" and buy type "production"; the dropdown's production type is
 * internal organisation only and stays on the save row's `media_type`.
 */
export function productionExcelRow(row: Line, line: Line, burst: Line): Line {
  const cost = Number(burst.cost) || 0
  const amount = Number(burst.amount) || 0
  return {
    market: line.market || "",
    platform: "production",
    network: line.publisher || "",
    creative: line.description || "",
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables: amount,
    buyType: "production",
    deliverablesAmount: cost.toString(),
    grossMedia: String(cost * amount),
    line_item_id: row.line_item_id,
    line_item: row.line_item,
  }
}
