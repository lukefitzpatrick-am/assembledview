/**
 * Non-blocking Advertising Associates warnings shown before publish.
 * Neither rule stops the publish.
 */
import type { Publisher } from "@/lib/types/publisher"
import { billingMonthLabel } from "@/lib/finance/billingPartner/cycle"
import { editorBillingStableLineItemId } from "@/lib/finance/buildEditorLineItemInputs"
import { lineItemBillsViaAdvertisingAssociates } from "@/lib/mediaplan/advertisingAssociatesExcel"
import type { LineItem } from "@/lib/generateMediaPlan"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"

/** Newspaper and magazines are the press channels AA books by insertion week. */
export const PRESS_BILLING_KEYS = new Set(["newspaper", "magazines"])

const PRESS_SPAN_DAYS = 6
const AMOUNT_TOLERANCE = 0.009

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

export type PressBurstInput = {
  startDate?: unknown
  endDate?: unknown
  calculatedValue?: unknown
}

export type PressLineInput = {
  lineId: string
  bursts: PressBurstInput[]
}

export type SentAaPack = {
  billingMonth: string
  versionId: number
  sentAt: string | null
  /** AA billing media dollars keyed by YYYY-MM. */
  aaAmountsByMonth: Record<string, number>
}

export type ScheduleMonthForAa = {
  monthYear: string
  lineItems?: Record<string, Array<{ id?: string; monthlyAmounts?: Record<string, number> }>>
}

export type EditorChannelForAa = {
  billingKey: string
  lineItems?: unknown[]
}

export function pressInsertionMessage(lineId: string): string {
  return `Press line ${lineId}: enter one burst per insertion week so AA can book each insertion.`
}

export function alreadySentMonthMessage(monthYm: string): string {
  return `This changes ${billingMonthLabel(monthYm)}, which AA has already received. Let AA know before the 26th.`
}

/**
 * One warning per press line that has a burst ending more than six days after
 * it starts and a quantity (`calculatedValue`) of 2 or more.
 */
export function pressInsertionWarnings(lines: PressLineInput[]): string[] {
  const messages: string[] = []
  for (const line of lines) {
    const lineId = line.lineId.trim()
    if (!lineId) continue
    const qualifies = line.bursts.some((burst) => {
      const span = calendarDaysAfter(burst.startDate, burst.endDate)
      const quantity = burstQuantity(burst.calculatedValue)
      return span != null && span > PRESS_SPAN_DAYS && quantity != null && quantity >= 2
    })
    if (qualifies) messages.push(pressInsertionMessage(lineId))
  }
  return messages
}

/**
 * Warn for each month at or before a sent pack's billing month whose AA
 * billing-media total differs from the latest sent pack that covers it.
 * An empty pack list (never sent, or only a draft) warns nothing.
 */
export function alreadySentAaWarnings(input: {
  nextAaAmountsByMonth: Record<string, number>
  sentPacks: SentAaPack[]
}): string[] {
  if (input.sentPacks.length === 0) return []
  const packs = input.sentPacks.flatMap((pack) => {
    const billingMonth = monthYm(pack.billingMonth)
    if (!billingMonth) return []
    const amounts: Record<string, number> = {}
    for (const [key, value] of Object.entries(pack.aaAmountsByMonth)) {
      const ym = monthYm(key)
      if (!ym || !Number.isFinite(value)) continue
      amounts[ym] = value
    }
    return [{ billingMonth, versionId: pack.versionId, sentAt: pack.sentAt, amounts }]
  })
  if (packs.length === 0) return []

  const months = new Set<string>()
  for (const key of Object.keys(input.nextAaAmountsByMonth)) {
    const ym = monthYm(key)
    if (ym) months.add(ym)
  }
  for (const pack of packs) {
    for (const key of Object.keys(pack.amounts)) months.add(key)
  }

  const changed: string[] = []
  for (const month of [...months].sort()) {
    const covering = packs.filter((pack) => pack.billingMonth >= month)
    if (covering.length === 0) continue
    covering.sort((a, b) => {
      const at = (a.sentAt ?? "").localeCompare(b.sentAt ?? "")
      if (at !== 0) return at
      return a.versionId - b.versionId
    })
    const latest = covering[covering.length - 1]!
    const next = amountForMonth(input.nextAaAmountsByMonth, month)
    const sent = latest.amounts[month] ?? 0
    if (Math.abs(next - sent) > AMOUNT_TOLERANCE) changed.push(month)
  }
  return changed.map((month) => alreadySentMonthMessage(month))
}

export function aaBillingMediaByMonth(
  schedule: ScheduleMonthForAa[],
  aaLineIds: ReadonlySet<string>,
): Record<string, number> {
  const totals = new Map<string, number>()
  for (const month of schedule) {
    const ym = monthYearToYm(month.monthYear)
    if (!ym || !month.lineItems) continue
    for (const lines of Object.values(month.lineItems)) {
      if (!Array.isArray(lines)) continue
      for (const line of lines) {
        const id = typeof line.id === "string" ? line.id : ""
        if (!id || !aaLineIds.has(id)) continue
        const raw = line.monthlyAmounts?.[month.monthYear] ?? line.monthlyAmounts?.[ym] ?? 0
        if (!Number.isFinite(raw)) continue
        totals.set(ym, (totals.get(ym) ?? 0) + raw)
      }
    }
  }
  const out: Record<string, number> = {}
  for (const [month, value] of totals) {
    out[month] = Math.round(value * 100) / 100
  }
  return out
}

/**
 * Press warnings always run. Sent-month warnings run only when `sentPacks`
 * is loaded (`null` means still unknown) and publishers are available so AA
 * lines can be recognised.
 */
export function buildAaPublishWarnings(input: {
  channels: EditorChannelForAa[]
  billingSchedule: ScheduleMonthForAa[]
  publishers: Publisher[]
  sentPacks: SentAaPack[] | null
}): string[] {
  const press = pressInsertionWarnings(pressLinesFromChannels(input.channels))
  if (input.sentPacks == null || input.publishers.length === 0) return press
  const aaLineIds = advertisingAssociatesScheduleLineIds(input.channels, input.publishers)
  const next = aaBillingMediaByMonth(input.billingSchedule, aaLineIds)
  return [
    ...press,
    ...alreadySentAaWarnings({ nextAaAmountsByMonth: next, sentPacks: input.sentPacks }),
  ]
}

function pressLinesFromChannels(channels: EditorChannelForAa[]): PressLineInput[] {
  const lines: PressLineInput[] = []
  for (const channel of channels) {
    if (!PRESS_BILLING_KEYS.has(channel.billingKey)) continue
    for (const raw of channel.lineItems ?? []) {
      if (!raw || typeof raw !== "object") continue
      const line = raw as Record<string, unknown>
      const lineId = displayLineId(line)
      const bursts = Array.isArray(line.bursts) ? (line.bursts as PressBurstInput[]) : []
      lines.push({ lineId, bursts })
    }
  }
  return lines
}

function advertisingAssociatesScheduleLineIds(
  channels: EditorChannelForAa[],
  publishers: Publisher[],
): Set<string> {
  const ids = new Set<string>()
  for (const channel of channels) {
    const items = channel.lineItems ?? []
    items.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return
      const line = raw as Record<string, unknown>
      const probe = {
        network: text(line.network),
        platform: text(line.platform),
        site: text(line.site) || text(line.publisher),
      } as LineItem
      if (!lineItemBillsViaAdvertisingAssociates(probe, publishers)) return
      ids.add(editorBillingStableLineItemId(channel.billingKey, raw, index))
    })
  }
  return ids
}

function displayLineId(line: Record<string, unknown>): string {
  const raw = line.line_item_id ?? line.lineItemId
  return typeof raw === "string" ? raw.trim() : ""
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function burstQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function calendarDaysAfter(start: unknown, end: unknown): number | null {
  const startYmd = burstYmd(start)
  const endYmd = burstYmd(end)
  if (!startYmd || !endYmd) return null
  const startUtc = ymdToUtc(startYmd)
  const endUtc = ymdToUtc(endYmd)
  if (startUtc == null || endUtc == null) return null
  return Math.round((endUtc - startUtc) / 86_400_000)
}

function burstYmd(value: unknown): string | null {
  if (value instanceof Date || typeof value === "string") {
    const formatted = formatBurstDateLocal(value)
    return formatted || null
  }
  return null
}

function ymdToUtc(ymd: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function monthYm(raw: string): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])/.exec(raw.trim())
  return match ? `${match[1]}-${match[2]}` : null
}

function monthYearToYm(monthYear: string): string | null {
  const iso = monthYm(monthYear)
  if (iso) return iso
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(monthYear.trim())
  if (!match) return null
  const index = MONTH_NAMES.indexOf(match[1]!.toLowerCase())
  if (index < 0) return null
  return `${match[2]}-${String(index + 1).padStart(2, "0")}`
}

function amountForMonth(amounts: Record<string, number>, month: string): number {
  if (Object.prototype.hasOwnProperty.call(amounts, month) && Number.isFinite(amounts[month])) {
    return amounts[month]!
  }
  return 0
}
