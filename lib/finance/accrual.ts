export type MonthKey = `${number}-${string}` | string

export type AccrualSource = "delivery" | "billing"

export interface AccrualClient {
  name: string
  slug?: string
}

export interface AccrualRow {
  clientName: string
  clientSlug?: string
  campaignName: string
  mbaNumber: string
  versionNumber: number
  lineItemKey: string
  lineItemName: string
  deliveryAmount: number
  billingAmount: number
  difference: number
}

export interface AccrualApiResponse {
  months: string[]
  rows: AccrualRow[]
  meta?: Record<string, unknown>
}

type FlattenedLine = {
  source: AccrualSource
  clientName: string
  clientSlug?: string
  campaignName: string
  mbaNumber: string
  versionNumber: number
  monthKey: string
  lineItemKey: string
  lineItemName: string
  amount: number
}

type VersionInput = {
  clientName: string
  clientSlug?: string
  campaignName: string
  mbaNumber: string
  versionNumber: number
  deliverySchedule?: unknown
  billingSchedule?: unknown
}

/**
 * Robust money parser.
 * Examples:
 * - "$21,749.25" -> 21749.25
 * - " 21749.25 " -> 21749.25
 * - "(1,234.50)" -> -1234.5
 * - 1000 -> 1000
 */
export function parseMoneyToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  const raw = String(value).trim()
  if (!raw) return 0

  const negativeByParens = /^\(.*\)$/.test(raw)
  const cleaned = raw.replace(/[^\d.-]/g, "")
  const num = Number.parseFloat(cleaned)
  if (!Number.isFinite(num)) return 0
  return negativeByParens ? -Math.abs(num) : num
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Normalize many month representations to canonical key "YYYY-MM".
 * Examples:
 * - "January 2026" -> "2026-01"
 * - "Dec 2025" -> "2025-12"
 * - "2025-12" -> "2025-12"
 * - 202512 -> "2025-12"
 * - "12/2025" -> "2025-12"
 */
export function normalizeMonthKey(monthYearLike: unknown): string | null {
  if (!monthYearLike) return null

  if (monthYearLike instanceof Date) {
    const t = monthYearLike.getTime()
    if (Number.isNaN(t)) return null
    const y = monthYearLike.getFullYear()
    const m = monthYearLike.getMonth() + 1
    return `${y}-${pad2(m)}`
  }

  if (typeof monthYearLike === "number") {
    const asString = String(monthYearLike)
    if (/^\d{6}$/.test(asString)) {
      const yearNum = Number.parseInt(asString.slice(0, 4), 10)
      const monthNum = Number.parseInt(asString.slice(4, 6), 10)
      if (Number.isFinite(yearNum) && monthNum >= 1 && monthNum <= 12) {
        return `${yearNum}-${pad2(monthNum)}`
      }
    }
    return null
  }

  const raw = String(monthYearLike).trim()
  if (!raw) return null
  const trimmed = raw.replace(/[,]/g, " ").replace(/\s+/g, " ").trim()

  // YYYY-MM or YYYY/MM
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr] = trimmed.split(/[-/]/)
    const y = Number.parseInt(yearStr, 10)
    const m = Number.parseInt(monthStr, 10)
    if (Number.isFinite(y) && m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // MM/YYYY or M/YYYY
  if (/^\d{1,2}[-/]\d{4}$/.test(trimmed)) {
    const [monthStr, yearStr] = trimmed.split(/[-/]/)
    const y = Number.parseInt(yearStr, 10)
    const m = Number.parseInt(monthStr, 10)
    if (Number.isFinite(y) && m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // Month name + year (e.g. "Jul 2024", "July 2024")
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const monthName = parts[0].toLowerCase()
    const yearStr = parts[1]
    const yearNum = Number.parseInt(yearStr, 10)

    const monthIndex = [
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
    ].indexOf(monthName)

    const monthIndexShort = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthName)

    const resolved =
      monthIndex >= 0 ? monthIndex + 1 : monthIndexShort >= 0 ? monthIndexShort + 1 : null

    if (resolved && Number.isFinite(yearNum)) {
      return `${yearNum}-${pad2(resolved)}`
    }
  }

  // Fallback numeric extraction (e.g., "2025 12" or "2025-12 anything")
  const numericMatch = trimmed.match(/(\d{4}).*?(\d{1,2})/)
  if (numericMatch) {
    const y = Number.parseInt(numericMatch[1], 10)
    const m = Number.parseInt(numericMatch[2], 10)
    if (Number.isFinite(y) && m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // Fallback to Date parsing (e.g. ISO strings)
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`
  }

  return null
}

function parseJsonIfNeeded(value: unknown): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function toScheduleArray(schedule: unknown): any[] {
  const parsed = parseJsonIfNeeded(schedule)
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === "object") {
    const months = (parsed as any).months
    if (Array.isArray(months)) return months
  }
  return []
}

function getMonthYearValue(entry: any): unknown {
  return (
    entry?.monthYear ??
    entry?.month_year ??
    entry?.month ??
    entry?.billingMonth ??
    entry?.monthLabel ??
    entry?.month_label ??
    entry?.date ??
    entry?.startDate ??
    entry?.start_date ??
    entry?.period_start ??
    entry?.periodStart ??
    null
  )
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  return String(value).trim()
}

function buildLineItemName(args: {
  mediaType?: string
  header1?: string
  header2?: string
  explicitName?: string
}): string {
  const explicit = safeString(args.explicitName)
  if (explicit) return explicit

  const h1 = safeString(args.header1)
  const h2 = safeString(args.header2)
  if (h1 && h2) return `${h1} • ${h2}`
  if (h1) return h1
  if (h2) return h2

  const mt = safeString(args.mediaType)
  return mt || "Line item"
}

function buildLineItemKey(args: {
  lineItem: any
  mediaType?: string
  header1?: string
  header2?: string
  lineItemName?: string
}): string {
  const idCandidate =
    args?.lineItem?.lineItemId ??
    args?.lineItem?.line_item_id ??
    args?.lineItem?.line_item_id ??
    args?.lineItem?.id ??
    null
  const id = safeString(idCandidate)
  if (id) return id.toLowerCase()

  const mediaType = safeString(args.mediaType).toLowerCase()
  const header1 = safeString(args.header1).toLowerCase()
  const header2 = safeString(args.header2).toLowerCase()
  const name = safeString(args.lineItemName).toLowerCase()

  return `${mediaType}__${header1}__${header2}__${name}`.replace(/\s+/g, " ").trim()
}

function extractHeaders(lineItem: any): { header1?: string; header2?: string } {
  const header1 =
    lineItem?.header1 ??
    lineItem?.publisher ??
    lineItem?.network ??
    lineItem?.platform ??
    lineItem?.site ??
    ""
  const header2 =
    lineItem?.header2 ??
    lineItem?.placement ??
    lineItem?.station ??
    lineItem?.title ??
    lineItem?.format ??
    ""
  return { header1: safeString(header1), header2: safeString(header2) }
}

function extractAmount(lineItem: any, mediaTypeEntry?: any, monthEntry?: any): number {
  const candidate =
    lineItem?.amount ??
    lineItem?.totalAmount ??
    lineItem?.total_amount ??
    lineItem?.total ??
    lineItem?.value ??
    lineItem?.cost ??
    lineItem?.budget ??
    mediaTypeEntry?.amount ??
    mediaTypeEntry?.totalAmount ??
    monthEntry?.amount ??
    monthEntry?.totalAmount ??
    monthEntry?.spend ??
    monthEntry?.budget ??
    monthEntry?.investment ??
    monthEntry?.media_investment ??
    0
  return round2(parseMoneyToNumber(candidate))
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "number") return Number.isFinite(value)
  const s = String(value).trim()
  return s.length > 0
}

function flattenSchedule(args: {
  source: AccrualSource
  schedule: unknown
  months: Set<string>
  client: AccrualClient
  campaignName: string
  mbaNumber: string
  versionNumber: number
}): FlattenedLine[] {
  const { source, client } = args
  const scheduleArray = toScheduleArray(args.schedule)
  if (!scheduleArray.length) return []

  const out: FlattenedLine[] = []

  for (const monthEntry of scheduleArray) {
    const monthKey = normalizeMonthKey(getMonthYearValue(monthEntry))
    if (!monthKey || !args.months.has(monthKey)) continue

    // Month-level service amounts that should be included alongside line items.
    // These often exist on billingSchedule, but can also exist on deliverySchedule in some exports.
    const monthServices: Array<{ key: string; name: string; value: unknown }> = [
      {
        key: "__service__adserving",
        name: "Adserving & Tech Fees",
        value:
          monthEntry?.adservingTechFees ??
          monthEntry?.adserving_tech_fees ??
          monthEntry?.adServingTechFees ??
          monthEntry?.ad_serving ??
          monthEntry?.adserving ??
          null,
      },
      {
        key: "__service__production",
        name: "Production",
        value: monthEntry?.production ?? monthEntry?.production_cost ?? monthEntry?.productionCost ?? null,
      },
      {
        key: "__service__fees",
        name: "Fees",
        value: monthEntry?.feeTotal ?? monthEntry?.fee_total ?? monthEntry?.assembledFee ?? null,
      },
    ]

    for (const svc of monthServices) {
      if (!hasMeaningfulValue(svc.value)) continue
      const amount = round2(parseMoneyToNumber(svc.value))
      out.push({
        source,
        clientName: client.name,
        clientSlug: client.slug,
        campaignName: args.campaignName,
        mbaNumber: args.mbaNumber,
        versionNumber: args.versionNumber,
        monthKey,
        lineItemKey: svc.key,
        lineItemName: svc.name,
        amount,
      })
    }

    const mediaTypes =
      monthEntry?.mediaTypes ??
      monthEntry?.media_types ??
      monthEntry?.mediaTypeEntries ??
      monthEntry?.channels ??
      null

    if (Array.isArray(mediaTypes)) {
      for (const mediaTypeEntry of mediaTypes) {
        const mediaType =
          safeString(
            mediaTypeEntry?.mediaType ??
              mediaTypeEntry?.media_type ??
              mediaTypeEntry?.type ??
              mediaTypeEntry?.name ??
              monthEntry?.mediaType ??
              monthEntry?.media_type ??
              monthEntry?.channel ??
              monthEntry?.media_channel
          ) || undefined

        const lineItems =
          mediaTypeEntry?.lineItems ??
          mediaTypeEntry?.line_items ??
          mediaTypeEntry?.items ??
          mediaTypeEntry?.rows ??
          null

        if (Array.isArray(lineItems)) {
          for (const lineItem of lineItems) {
            const amount = extractAmount(lineItem, mediaTypeEntry, monthEntry)
            const { header1, header2 } = extractHeaders(lineItem)
            const explicitName =
              lineItem?.lineItemName ??
              lineItem?.line_item_name ??
              lineItem?.name ??
              lineItem?.description ??
              lineItem?.label ??
              lineItem?.title ??
              null
            const lineItemName = buildLineItemName({ mediaType, header1, header2, explicitName })
            const lineItemKey = buildLineItemKey({ lineItem, mediaType, header1, header2, lineItemName })

            out.push({
              source,
              clientName: client.name,
              clientSlug: client.slug,
              campaignName: args.campaignName,
              mbaNumber: args.mbaNumber,
              versionNumber: args.versionNumber,
              monthKey,
              lineItemKey,
              lineItemName,
              amount,
            })
          }
          continue
        }

        // If we have a mediaType entry but no lineItems, treat it as a single aggregate line (best-effort).
        const amount = extractAmount(null, mediaTypeEntry, monthEntry)
        if (amount !== 0) {
          const lineItemName = buildLineItemName({ mediaType, header1: "", header2: "", explicitName: undefined })
          const lineItemKey = buildLineItemKey({ lineItem: mediaTypeEntry, mediaType, lineItemName })
          out.push({
            source,
            clientName: client.name,
            clientSlug: client.slug,
            campaignName: args.campaignName,
            mbaNumber: args.mbaNumber,
            versionNumber: args.versionNumber,
            monthKey,
            lineItemKey,
            lineItemName,
            amount,
          })
        }
      }
      continue
    }

    // Flat month entry: may have lineItems directly.
    const flatLineItems = monthEntry?.lineItems ?? monthEntry?.line_items ?? monthEntry?.items ?? null
    if (Array.isArray(flatLineItems)) {
      const mediaType = safeString(monthEntry?.mediaType ?? monthEntry?.media_type ?? monthEntry?.channel ?? "") || undefined
      for (const lineItem of flatLineItems) {
        const amount = extractAmount(lineItem, null, monthEntry)
        const { header1, header2 } = extractHeaders(lineItem)
        const explicitName =
          lineItem?.lineItemName ??
          lineItem?.line_item_name ??
          lineItem?.name ??
          lineItem?.description ??
          lineItem?.label ??
          lineItem?.title ??
          null
        const lineItemName = buildLineItemName({ mediaType, header1, header2, explicitName })
        const lineItemKey = buildLineItemKey({ lineItem, mediaType, header1, header2, lineItemName })

        out.push({
          source,
          clientName: client.name,
          clientSlug: client.slug,
          campaignName: args.campaignName,
          mbaNumber: args.mbaNumber,
          versionNumber: args.versionNumber,
          monthKey,
          lineItemKey,
          lineItemName,
          amount,
        })
      }
      continue
    }

    // Last resort: treat month entry itself as a single line.
    const mediaType = safeString(monthEntry?.mediaType ?? monthEntry?.media_type ?? monthEntry?.channel ?? "") || undefined
    const amount = extractAmount(monthEntry, null, monthEntry)
    if (amount !== 0) {
      const lineItemName = buildLineItemName({
        mediaType,
        header1: safeString(monthEntry?.header1 ?? monthEntry?.publisher ?? ""),
        header2: safeString(monthEntry?.header2 ?? monthEntry?.placement ?? ""),
        explicitName: monthEntry?.lineItemName ?? monthEntry?.name ?? monthEntry?.description ?? null,
      })
      const lineItemKey = buildLineItemKey({ lineItem: monthEntry, mediaType, lineItemName })
      out.push({
        source,
        clientName: client.name,
        clientSlug: client.slug,
        campaignName: args.campaignName,
        mbaNumber: args.mbaNumber,
        versionNumber: args.versionNumber,
        monthKey,
        lineItemKey,
        lineItemName,
        amount,
      })
    }
  }

  return out
}

function slugifyClientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

/**
 * Compute merged accrual rows for selected months across the chosen versions.
 */
export function computeAccrualRows(args: {
  versions: VersionInput[]
  months: string[]
  clientPaysForMediaByLineItemId?: Record<string, boolean>
}): AccrualRow[] {
  const monthsSet = new Set(args.months)
  if (!monthsSet.size) return []

  const clientPaysForMediaByLineItemId: Record<string, boolean> = args.clientPaysForMediaByLineItemId ?? {}

  const aggregate = new Map<
    string,
    {
      clientName: string
      clientSlug?: string
      campaignName: string
      mbaNumber: string
      versionNumber: number
      lineItemKey: string
      lineItemName: string
      deliveryAmount: number
      billingAmount: number
    }
  >()

  for (const v of args.versions) {
    const clientName = safeString(v.clientName) || "Unknown"
    const clientSlug = safeString(v.clientSlug) || slugifyClientName(clientName) || undefined
    const client: AccrualClient = { name: clientName, slug: clientSlug }
    const campaignName = safeString(v.campaignName) || "Unknown campaign"
    const mbaNumber = safeString(v.mbaNumber) || "unknown"
    const versionNumber = Number.isFinite(v.versionNumber) ? v.versionNumber : 0

    const delivery = flattenSchedule({
      source: "delivery",
      schedule: v.deliverySchedule,
      months: monthsSet,
      client,
      campaignName,
      mbaNumber,
      versionNumber,
    })
      // Exclude delivery for line items where Xano says client pays for media.
      // Keys are compared using lowercase ids (buildLineItemKey returns lowercase when an id exists).
      .filter((line) => clientPaysForMediaByLineItemId[String(line.lineItemKey ?? "").trim().toLowerCase()] !== true)
    const billing = flattenSchedule({
      source: "billing",
      schedule: v.billingSchedule,
      months: monthsSet,
      client,
      campaignName,
      mbaNumber,
      versionNumber,
    })

    for (const line of [...delivery, ...billing]) {
      const aggKey = `${line.mbaNumber}||${line.versionNumber}||${line.lineItemKey}`
      const existing = aggregate.get(aggKey)
      if (!existing) {
        aggregate.set(aggKey, {
          clientName: line.clientName,
          clientSlug: line.clientSlug,
          campaignName: line.campaignName,
          mbaNumber: line.mbaNumber,
          versionNumber: line.versionNumber,
          lineItemKey: line.lineItemKey,
          lineItemName: line.lineItemName,
          deliveryAmount: line.source === "delivery" ? line.amount : 0,
          billingAmount: line.source === "billing" ? line.amount : 0,
        })
        continue
      }

      if (line.source === "delivery") existing.deliveryAmount = round2(existing.deliveryAmount + line.amount)
      else existing.billingAmount = round2(existing.billingAmount + line.amount)

      // Keep the most informative label we’ve seen.
      if (!existing.lineItemName || existing.lineItemName.length < line.lineItemName.length) {
        existing.lineItemName = line.lineItemName
      }
    }
  }

  return Array.from(aggregate.values()).map((r) => ({
    clientName: r.clientName,
    clientSlug: r.clientSlug,
    campaignName: r.campaignName,
    mbaNumber: r.mbaNumber,
    versionNumber: r.versionNumber,
    lineItemKey: r.lineItemKey,
    lineItemName: r.lineItemName,
    deliveryAmount: round2(r.deliveryAmount),
    billingAmount: round2(r.billingAmount),
    difference: round2(r.deliveryAmount - r.billingAmount),
  }))
}

