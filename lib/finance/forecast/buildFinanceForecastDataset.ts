import {
  extractServiceAmountsFromBillingSchedule,
  getMediaTypeKeyFromDisplayName,
  matchMonthYear,
  parseBillingScheduleAmount,
  calculateMonthlyAmountFromBursts,
  campaignOverlapsMonth,
} from "@/lib/finance/utils"
import type {
  FinanceForecastClientBlock,
  FinanceForecastClientInput,
  FinanceForecastDataset,
  FinanceForecastDatasetMeta,
  FinanceForecastLine,
  FinanceForecastLineKey,
  FinanceForecastMediaPlanVersionInput,
  FinanceForecastMonthlyAmounts,
  FinanceForecastMonthKey,
  FinanceForecastPublisherInput,
  FinanceForecastRowGroup,
  FinanceForecastScenario,
} from "@/lib/types/financeForecast"
import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_GROUP_LABELS,
  FINANCE_FORECAST_LINE_KEYS,
} from "@/lib/types/financeForecast"
import {
  applyForecastCommissionRate,
  CLIENT_FIELD_FEE_SEARCH,
  CLIENT_FIELD_FEE_SOCIAL,
  CLIENT_FIELD_MONTHLY_RETAINER,
  CLIENT_PROG_FEE_FIELDS,
  DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY,
  FORECAST_BILLING_LINE_ORDER,
  FORECAST_MAPPING_SCHEMA_GAPS,
  FORECAST_REVENUE_BODY_LINE_ORDER,
  readPublisherCommissionRate,
  resolveRevenueCommissionBucket,
  splitBillableAmountByBillingEntity,
  VERSION_EXTRA_BURSTS_KEY,
} from "@/lib/finance/forecast/mapping"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildFinanceForecastDatasetParams {
  media_plan_versions: ReadonlyArray<FinanceForecastMediaPlanVersionInput>
  clients: ReadonlyArray<FinanceForecastClientInput>
  publishers: ReadonlyArray<FinanceForecastPublisherInput>
  /** Calendar year of FY start (1 July). */
  financial_year_start_year: number
  scenario: FinanceForecastScenario
}

export function buildFinanceForecastDataset(
  params: BuildFinanceForecastDatasetParams
): FinanceForecastDataset {
  const publisherByName = buildPublisherLookup(params.publishers)
  const clientByNormName = buildClientLookup(params.clients)

  const fyStart = params.financial_year_start_year
  const latest = selectLatestVersionPerMba(
    params.media_plan_versions,
    params.scenario,
    fyStart
  )

  const byClient = new Map<
    string,
    {
      client_id: string
      client_name: string
      campaigns: FinanceForecastMediaPlanVersionInput[]
    }
  >()

  for (const v of latest) {
    const clientName = resolveClientName(v)
    const clientId = resolveClientId(clientName, clientByNormName, params.clients)
    let bucket = byClient.get(clientId)
    if (!bucket) {
      bucket = { client_id: clientId, client_name: clientName, campaigns: [] }
      byClient.set(clientId, bucket)
    }
    bucket.campaigns.push(v)
  }

  const clientIdsSorted = [...byClient.keys()].sort((a, b) => {
    const an = byClient.get(a)!.client_name
    const bn = byClient.get(b)!.client_name
    return an.localeCompare(bn, undefined, { sensitivity: "base" })
  })

  const client_blocks: FinanceForecastClientBlock[] = []

  for (const cid of clientIdsSorted) {
    const bucket = byClient.get(cid)!
    const billingLines: FinanceForecastLine[] = []
    const revenueLines: FinanceForecastLine[] = []

    for (const version of bucket.campaigns) {
      const campaignLines = buildLinesForCampaign({
        version,
        scenario: params.scenario,
        fyStartYear: fyStart,
        client_id: bucket.client_id,
        client_name: bucket.client_name,
        publisherByName,
        clientRecord: clientByNormName.get(normalizeName(bucket.client_name))?.raw,
      })
      for (const line of campaignLines.billing) billingLines.push(line)
      for (const line of campaignLines.revenue) revenueLines.push(line)
    }

    const clientRecord = clientByNormName.get(normalizeName(bucket.client_name))?.raw
    const clientLevelRevenue = buildClientLevelRevenueLines({
      client_id: bucket.client_id,
      client_name: bucket.client_name,
      scenario: params.scenario,
      fyStartYear: fyStart,
      clientRecord,
    })
    revenueLines.push(...clientLevelRevenue)

    const mergedRevenue = attachTotalRevenueLine(revenueLines, {
      client_id: bucket.client_id,
      client_name: bucket.client_name,
      scenario: params.scenario,
      fyStartYear: fyStart,
    })

    const groups: FinanceForecastRowGroup[] = [
      {
        group_key: FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
        title: FINANCE_FORECAST_GROUP_LABELS[FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation],
        lines: orderBillingLines(billingLines),
      },
      {
        group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
        title: FINANCE_FORECAST_GROUP_LABELS[FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission],
        lines: orderRevenueLines(mergedRevenue),
      },
    ]

    client_blocks.push({
      client_id: bucket.client_id,
      client_name: bucket.client_name,
      groups,
    })
  }

  const meta: FinanceForecastDatasetMeta = {
    financial_year_start_year: fyStart,
    scenario: params.scenario,
    generated_at: new Date().toISOString(),
    schema_version: "finance_forecast_v1",
  }

  return { meta, client_blocks }
}

// ---------------------------------------------------------------------------
// Version & status
// ---------------------------------------------------------------------------

function normalizeCampaignStatus(version: FinanceForecastMediaPlanVersionInput): string {
  const s = String(version.campaign_status ?? version.mp_campaignstatus ?? "")
    .trim()
    .toLowerCase()
  return s
}

function isCancelledStatus(status: string): boolean {
  if (!status) return false
  return (
    status.includes("cancel") ||
    status === "canceled" ||
    status === "killed" ||
    status === "void"
  )
}

function includeVersionForScenario(
  status: string,
  scenario: FinanceForecastScenario
): boolean {
  if (isCancelledStatus(status)) return false
  if (scenario === "confirmed_plus_probable") return true
  return (
    status === "booked" ||
    status === "approved" ||
    status === "completed"
  )
}

function parseVersionNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "string" ? Number.parseInt(v, 10) : Number(v)
  return Number.isFinite(n) ? n : null
}

function fyWindow(fyStartYear: number): { start: Date; end: Date } {
  const start = new Date(fyStartYear, 6, 1, 0, 0, 0, 0)
  const end = new Date(fyStartYear + 1, 5, 30, 23, 59, 59, 999)
  return { start, end }
}

function campaignTouchesFinancialYear(
  version: FinanceForecastMediaPlanVersionInput,
  fyStartYear: number
): boolean {
  const start = version.campaign_start_date
  const end = version.campaign_end_date
  if (start && end) {
    const { start: fyStart, end: fyEnd } = fyWindow(fyStartYear)
    const cs = new Date(start)
    const ce = new Date(end)
    if (!Number.isNaN(cs.getTime()) && !Number.isNaN(ce.getTime())) {
      return cs <= fyEnd && ce >= fyStart
    }
  }
  return true
}

function selectLatestVersionPerMba(
  versions: ReadonlyArray<FinanceForecastMediaPlanVersionInput>,
  scenario: FinanceForecastScenario,
  fyStartYear: number
): FinanceForecastMediaPlanVersionInput[] {
  const filtered = versions.filter((v) => {
    const mba = String(v.mba_number ?? "").trim()
    if (!mba) return false
    const st = normalizeCampaignStatus(v)
    if (!includeVersionForScenario(st, scenario)) return false
    if (!campaignTouchesFinancialYear(v, fyStartYear)) {
      return scheduleTouchesFinancialYear(v, fyStartYear)
    }
    return true
  })

  const byMba = new Map<string, FinanceForecastMediaPlanVersionInput>()
  for (const v of filtered) {
    const mba = String(v.mba_number ?? "").trim()
    const vn = parseVersionNumber(v.version_number)
    const existing = byMba.get(mba)
    const ev = parseVersionNumber(existing?.version_number)
    if (!existing || (vn ?? -1) > (ev ?? -1)) {
      byMba.set(mba, v)
    }
  }
  return [...byMba.values()]
}

function scheduleTouchesFinancialYear(
  version: FinanceForecastMediaPlanVersionInput,
  fyStartYear: number
): boolean {
  const billing = coalesceSchedule(version.billingSchedule ?? version.billing_schedule)
  const delivery = coalesceSchedule(version.deliverySchedule ?? version.delivery_schedule)
  for (let m = 0; m < FINANCE_FORECAST_FISCAL_MONTH_ORDER.length; m++) {
    const { calendarYear, calendarMonth } = fiscalSlotToCalendar(fyStartYear, m)
    if (sumScheduleMediaForMonth(billing, calendarYear, calendarMonth) > 0) return true
    if (sumScheduleMediaForMonth(delivery, calendarYear, calendarMonth) > 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Fiscal calendar
// ---------------------------------------------------------------------------

function fiscalSlotToCalendar(
  fyStartYear: number,
  fiscalIndex: number
): { calendarYear: number; calendarMonth: number } {
  const key = FINANCE_FORECAST_FISCAL_MONTH_ORDER[fiscalIndex]
  const monthMap: Record<FinanceForecastMonthKey, number> = {
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
  }
  const calMonth = monthMap[key as FinanceForecastMonthKey]
  const calendarYear = calMonth >= 7 ? fyStartYear : fyStartYear + 1
  return { calendarYear, calendarMonth: calMonth }
}

function fiscalMonthKeyFromIndex(fiscalIndex: number): FinanceForecastMonthKey {
  return FINANCE_FORECAST_FISCAL_MONTH_ORDER[fiscalIndex]
}

function emptyMonthly(): FinanceForecastMonthlyAmounts {
  const o = {} as FinanceForecastMonthlyAmounts
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    o[k] = 0
  }
  return o
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

function coalesceSchedule(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    try {
      return JSON.parse(t)
    } catch {
      return null
    }
  }
  return raw
}

function toScheduleArray(schedule: unknown): any[] {
  if (!schedule) return []
  if (Array.isArray(schedule)) return schedule
  if (typeof schedule === "object" && schedule !== null && Array.isArray((schedule as any).months)) {
    return (schedule as any).months
  }
  return []
}

function sumScheduleMediaForMonth(
  schedule: unknown,
  calendarYear: number,
  calendarMonth: number
): number {
  const arr = toScheduleArray(schedule)
  const monthEntry = arr.find((entry) => {
    const label =
      entry?.monthYear ??
      entry?.month_year ??
      entry?.month ??
      entry?.month_label ??
      entry?.billingMonth ??
      ""
    return matchMonthYear(String(label ?? ""), calendarYear, calendarMonth)
  })
  if (!monthEntry) return 0

  let total = 0
  const mediaTypes = Array.isArray(monthEntry.mediaTypes) ? monthEntry.mediaTypes : []
  for (const mt of mediaTypes) {
    const items = Array.isArray(mt?.lineItems) ? mt.lineItems : []
    for (const li of items) {
      total += parseBillingScheduleAmount(li?.amount)
    }
  }

  const flatItems = Array.isArray(monthEntry.lineItems) ? monthEntry.lineItems : []
  for (const li of flatItems) {
    total += parseBillingScheduleAmount(li?.amount)
  }

  const mediaTotal =
    monthEntry.mediaTotal ??
    monthEntry.media_total ??
    monthEntry.totalMedia ??
    monthEntry.total_media
  if (total <= 0 && mediaTotal != null) {
    total = parseBillingScheduleAmount(mediaTotal)
  }

  return round2(total)
}

type ScheduleSource = "billingSchedule" | "deliverySchedule" | "burst_fallback" | "none"

function resolveMonthlyMediaForFySlot(args: {
  version: FinanceForecastMediaPlanVersionInput
  fyStartYear: number
  fiscalIndex: number
}): { amount: number; source: ScheduleSource; detail: string } {
  const { calendarYear, calendarMonth } = fiscalSlotToCalendar(args.fyStartYear, args.fiscalIndex)

  const billing = coalesceSchedule(args.version.billingSchedule ?? args.version.billing_schedule)
  const delivery = coalesceSchedule(args.version.deliverySchedule ?? args.version.delivery_schedule)

  const b = sumScheduleMediaForMonth(billing, calendarYear, calendarMonth)
  if (b > 0) {
    return {
      amount: b,
      source: "billingSchedule",
      detail: `billingSchedule ${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
    }
  }

  const d = sumScheduleMediaForMonth(delivery, calendarYear, calendarMonth)
  if (d > 0) {
    return {
      amount: d,
      source: "deliverySchedule",
      detail: `deliverySchedule ${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
    }
  }

  const bursts = readBursts(args.version)
  const burstAmt = calculateMonthlyAmountFromBursts(bursts, calendarYear, calendarMonth)
  if (burstAmt > 0) {
    return {
      amount: burstAmt,
      source: "burst_fallback",
      detail: `bursts prorated ${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
    }
  }

  const start = args.version.campaign_start_date
  const end = args.version.campaign_end_date
  if (start && end && campaignOverlapsMonth(start, end, calendarYear, calendarMonth)) {
    return {
      amount: 0,
      source: "none",
      detail:
        "no_schedule_or_burst_for_month_campaign_overlaps_month_but_no_amount_derivation_available",
    }
  }

  return { amount: 0, source: "none", detail: "no_billing_delivery_or_burst_for_month" }
}

function readBursts(version: FinanceForecastMediaPlanVersionInput): unknown {
  const ex = version.extra
  if (ex && typeof ex === "object" && ex !== null && VERSION_EXTRA_BURSTS_KEY in ex) {
    return (ex as Record<string, unknown>)[VERSION_EXTRA_BURSTS_KEY]
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Publisher / client lookup
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildPublisherLookup(publishers: ReadonlyArray<FinanceForecastPublisherInput>): Map<
  string,
  FinanceForecastPublisherInput
> {
  const m = new Map<string, FinanceForecastPublisherInput>()
  for (const p of publishers) {
    const n = String(p.publisher_name ?? "").trim()
    if (n) m.set(normalizeName(n), p)
  }
  return m
}

function buildClientLookup(clients: ReadonlyArray<FinanceForecastClientInput>): Map<
  string,
  { id: string; raw: FinanceForecastClientInput }
> {
  const m = new Map<string, { id: string; raw: FinanceForecastClientInput }>()
  for (const c of clients) {
    const id = c.id != null ? String(c.id) : ""
    const names = [c.clientname_input, c.mp_client_name, c.name]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
    for (const n of names) {
      m.set(normalizeName(n), { id: id || normalizeName(n), raw: c })
    }
  }
  return m
}

function resolveClientName(v: FinanceForecastMediaPlanVersionInput): string {
  return String(v.mp_client_name ?? v.campaign_name ?? "Unknown client").trim() || "Unknown client"
}

function resolveClientId(
  displayName: string,
  byNorm: Map<string, { id: string; raw: FinanceForecastClientInput }>,
  clients: ReadonlyArray<FinanceForecastClientInput>
): string {
  const hit = byNorm.get(normalizeName(displayName))
  if (hit?.id) return hit.id
  if (clients.length === 0) return normalizeName(displayName) || "unknown_client"
  return normalizeName(displayName) || "unknown_client"
}

function resolvePublisher(
  publisherName: string,
  publisherByName: Map<string, FinanceForecastPublisherInput>
): FinanceForecastPublisherInput | null {
  const key = normalizeName(publisherName)
  return publisherByName.get(key) ?? null
}

// Billing / commission routing: `lib/finance/forecast/mapping` (definitions + classification).

function orderBillingLines(lines: FinanceForecastLine[]): FinanceForecastLine[] {
  const byKey = new Map<FinanceForecastLineKey, FinanceForecastLine[]>()
  for (const lk of FORECAST_BILLING_LINE_ORDER) byKey.set(lk, [])
  for (const line of lines) {
    const bucket = byKey.get(line.line_key)
    if (bucket) bucket.push(line)
  }
  const out: FinanceForecastLine[] = []
  for (const lk of FORECAST_BILLING_LINE_ORDER) out.push(...(byKey.get(lk) ?? []))
  return out
}

function orderRevenueLines(lines: FinanceForecastLine[]): FinanceForecastLine[] {
  const byKey = new Map<FinanceForecastLineKey, FinanceForecastLine[]>()
  for (const lk of [...FORECAST_REVENUE_BODY_LINE_ORDER, FINANCE_FORECAST_LINE_KEYS.totalRevenue]) {
    byKey.set(lk, [])
  }
  for (const line of lines) {
    const bucket = byKey.get(line.line_key)
    if (bucket) bucket.push(line)
  }
  const out: FinanceForecastLine[] = []
  for (const lk of FORECAST_REVENUE_BODY_LINE_ORDER) out.push(...(byKey.get(lk) ?? []))
  out.push(...(byKey.get(FINANCE_FORECAST_LINE_KEYS.totalRevenue) ?? []))
  return out
}

function mergeMonthly(into: FinanceForecastMonthlyAmounts, key: FinanceForecastMonthKey, v: number) {
  into[key] = round2((into[key] ?? 0) + v)
}

function fySum(m: FinanceForecastMonthlyAmounts): number {
  let t = 0
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) t += m[k] ?? 0
  return round2(t)
}

interface CampaignLinesResult {
  billing: FinanceForecastLine[]
  revenue: FinanceForecastLine[]
}

function buildLinesForCampaign(args: {
  version: FinanceForecastMediaPlanVersionInput
  scenario: FinanceForecastScenario
  fyStartYear: number
  client_id: string
  client_name: string
  publisherByName: Map<string, FinanceForecastPublisherInput>
  clientRecord: FinanceForecastClientInput | undefined
}): CampaignLinesResult {
  const version = args.version
  const mba = String(version.mba_number ?? "").trim()
  const vid = version.id ?? null
  const vn = parseVersionNumber(version.version_number)
  const campaignName = String(version.campaign_name ?? "").trim()
  const campaignId =
    version.campaign_id !== undefined && version.campaign_id !== null
      ? String(version.campaign_id)
      : null

  const aaMonthly = emptyMonthly()
  const amMonthly = emptyMonthly()
  const searchSocialMonthly = emptyMonthly()
  const directDigitalMonthly = emptyMonthly()
  const commissionOtherMonthly = emptyMonthly()
  const serviceFeeMonthly = emptyMonthly()
  const fixedGtdMonthly = emptyMonthly()

  const scheduleNotes: string[] = []

  for (let i = 0; i < FINANCE_FORECAST_FISCAL_MONTH_ORDER.length; i++) {
    const fmk = fiscalMonthKeyFromIndex(i)
    const { calendarYear, calendarMonth } = fiscalSlotToCalendar(args.fyStartYear, i)
    const { amount: monthMedia, source, detail } = resolveMonthlyMediaForFySlot({
      version,
      fyStartYear: args.fyStartYear,
      fiscalIndex: i,
    })
    scheduleNotes.push(`${fmk}:${source}:${detail}`)

    const billing = coalesceSchedule(version.billingSchedule ?? version.billing_schedule)
    const delivery = coalesceSchedule(version.deliverySchedule ?? version.delivery_schedule)
    const lineRows = extractBillableLinesForMonth(
      billing,
      calendarYear,
      calendarMonth,
      args.publisherByName
    )

    if (lineRows.length === 0 && monthMedia > 0) {
      lineRows.push(
        ...extractBillableLinesForMonth(delivery, calendarYear, calendarMonth, args.publisherByName)
      )
    }

    if (lineRows.length === 0 && monthMedia > 0) {
      const unknownPublisher: FinanceForecastPublisherInput = {
        publisher_name: "Unknown",
        billingagency: DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY,
      }
      lineRows.push({
        publisher: unknownPublisher,
        mediaTypeDisplay: "Aggregated",
        mediaTypeKey: "unknown",
        mediaAmount: monthMedia,
      })
    }

    let aa = 0
    let am = 0
    for (const row of lineRows) {
      const split = splitBillableAmountByBillingEntity({
        publisher: row.publisher,
        mediaAmount: row.mediaAmount,
      })
      aa += split.advertisingAssociates
      am += split.assembledMedia
    }
    mergeMonthly(aaMonthly, fmk, aa)
    mergeMonthly(amMonthly, fmk, am)

    for (const row of lineRows) {
      const mtKey = row.mediaTypeKey
      const mediaAmt = row.mediaAmount
      const comms = readPublisherCommissionRate(row.publisher, mtKey)
      const commsAmt = applyForecastCommissionRate(mediaAmt, comms)

      const bucket = resolveRevenueCommissionBucket({
        mediaTypeKey: mtKey,
        publishertype: row.publisher.publishertype,
      })
      if (bucket === "search_social") {
        mergeMonthly(searchSocialMonthly, fmk, commsAmt)
      } else if (bucket === "direct_managed_digital") {
        mergeMonthly(directDigitalMonthly, fmk, commsAmt)
      } else {
        mergeMonthly(commissionOtherMonthly, fmk, commsAmt)
      }
    }

    let services = extractServiceAmountsFromBillingSchedule(
      billing,
      calendarYear,
      calendarMonth
    )
    if (
      services.assembledFee + services.adservingTechFees + services.production <= 0 &&
      delivery
    ) {
      services = extractServiceAmountsFromBillingSchedule(
        delivery,
        calendarYear,
        calendarMonth
      )
    }
    mergeMonthly(serviceFeeMonthly, fmk, services.assembledFee + services.adservingTechFees)
    mergeMonthly(fixedGtdMonthly, fmk, services.production)
  }

  const baseSource = (kind: string): FinanceForecastLine["source"] => ({
    kind,
    media_plan_version_id: vid,
    refs: [
      {
        label: "mba_number",
        record_type: "media_plan_version",
        record_id: mba,
        field: "mba_number",
      },
    ],
  })

  const baseDebug = (stage: string, explanation: string): FinanceForecastLine["debug"] => ({
    stage,
    explanation,
    inputs_digest: scheduleNotes.slice(0, 24).join(" | "),
  })

  const billing: FinanceForecastLine[] = [
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.advertisingAssociatesBillingForPublisher,
      group_key: FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
      monthly: aaMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("billing_schedule_aa_publisher_media"),
      debug: baseDebug(
        "billing_aa",
        "Advertising Associates billing line — see getForecastLineMappingDefinition(advertising_associates_billing_for_publisher) in lib/finance/forecast/mapping."
      ),
    }),
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher,
      group_key: FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
      monthly: amMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("billing_schedule_am_publisher_media"),
      debug: baseDebug(
        "billing_am",
        "Assembled Media billing line — see getForecastLineMappingDefinition(assembled_media_billing_for_publisher); unknown publisher uses DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY."
      ),
    }),
  ]

  const revenue: FinanceForecastLine[] = [
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: searchSocialMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("publisher_comms_search_social"),
      debug: baseDebug(
        "revenue_search_social",
        "Search/social bucket — publisher *_comms + client feesearch/feesocial; mapping: lib/finance/forecast/mapping/definitions.ts."
      ),
    }),
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: directDigitalMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("publisher_comms_direct_digital"),
      debug: baseDebug(
        "revenue_direct_digital",
        "Direct-managed digital bucket — FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS + publishertype direct + client feeprog*; mapping layer."
      ),
    }),
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.commission,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: commissionOtherMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("publisher_comms_other_channels"),
      debug: baseDebug(
        "revenue_commission_other",
        "Commission bucket for remaining channels — resolveRevenueCommissionBucket → commission_other; FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS."
      ),
    }),
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: serviceFeeMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("billing_schedule_service_fees"),
      debug: baseDebug(
        "revenue_service_fee",
        "extractServiceAmountsFromBillingSchedule (lib/finance/utils); see FORECAST_MAPPING_SCHEMA_GAPS.serviceFeeDigitalScope for digital-only follow-up."
      ),
    }),
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.fixedPriceGtd,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: fixedGtdMonthly,
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: mba,
      campaign_id: campaignId,
      campaign_name: campaignName,
      media_plan_version_id: vid,
      version_number: vn,
      scenario: args.scenario,
      source: baseSource("billing_schedule_production"),
      debug: baseDebug(
        "revenue_fixed_gtd",
        "Production column from extractServiceAmountsFromBillingSchedule; FORECAST_MAPPING_SCHEMA_GAPS.fixedPriceGtdVsProduction if GTD ≠ production."
      ),
    }),
  ]

  void args.clientRecord
  return { billing, revenue }
}

type BillableRow = {
  publisher: FinanceForecastPublisherInput
  mediaTypeDisplay: string
  mediaTypeKey: string
  mediaAmount: number
}

function extractBillableLinesForMonth(
  schedule: unknown,
  calendarYear: number,
  calendarMonth: number,
  publisherByName: Map<string, FinanceForecastPublisherInput>
): BillableRow[] {
  const arr = toScheduleArray(schedule)
  const monthEntry = arr.find((entry) => {
    const label =
      entry?.monthYear ??
      entry?.month_year ??
      entry?.month ??
      entry?.month_label ??
      ""
    return matchMonthYear(String(label ?? ""), calendarYear, calendarMonth)
  })
  if (!monthEntry?.mediaTypes) return []

  const out: BillableRow[] = []
  for (const mediaTypeEntry of monthEntry.mediaTypes) {
    const mediaTypeDisplay =
      mediaTypeEntry.mediaType ||
      mediaTypeEntry.media_type ||
      mediaTypeEntry.type ||
      mediaTypeEntry.name ||
      ""
    const mediaTypeKey = getMediaTypeKeyFromDisplayName(String(mediaTypeDisplay))
    const lineItems = Array.isArray(mediaTypeEntry.lineItems) ? mediaTypeEntry.lineItems : []
    for (const lineItem of lineItems) {
      const amount = parseBillingScheduleAmount(lineItem.amount)
      if (amount <= 0) continue
      const clientPays =
        lineItem.clientPaysForMedia === true || lineItem.client_pays_for_media === true
      if (clientPays) continue

      let publisherName = String(lineItem.header1 ?? "").trim()
      if (!publisherName && lineItem.lineItemId) {
        const parts = String(lineItem.lineItemId).split("-")
        if (parts.length >= 2) publisherName = parts[1].trim()
      }
      const publisher =
        resolvePublisher(publisherName, publisherByName) ??
        ({
          publisher_name: publisherName || "Unknown",
          billingagency: DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY,
        } as FinanceForecastPublisherInput)

      out.push({
        publisher,
        mediaTypeDisplay: String(mediaTypeDisplay),
        mediaTypeKey,
        mediaAmount: round2(amount),
      })
    }
  }
  return out
}

function makeLine(p: {
  line_key: FinanceForecastLineKey
  group_key: FinanceForecastLine["group_key"]
  monthly: FinanceForecastMonthlyAmounts
  client_id: string
  client_name: string
  mba_number: string | null
  campaign_id: string | null
  campaign_name: string
  media_plan_version_id: string | number | null
  version_number: number | null
  scenario: FinanceForecastScenario
  source: FinanceForecastLine["source"]
  debug?: FinanceForecastLine["debug"]
}): FinanceForecastLine {
  return {
    client_id: p.client_id,
    client_name: p.client_name,
    campaign_id: p.campaign_id,
    mba_number: p.mba_number,
    media_plan_version_id: p.media_plan_version_id,
    version_number: p.version_number,
    scenario: p.scenario,
    group_key: p.group_key,
    line_key: p.line_key,
    monthly: { ...p.monthly },
    fy_total: fySum(p.monthly),
    source: p.source,
    debug: p.debug
      ? { ...p.debug, explanation: `${p.debug.explanation} Campaign: ${p.campaign_name}` }
      : undefined,
  }
}

function buildClientLevelRevenueLines(args: {
  client_id: string
  client_name: string
  scenario: FinanceForecastScenario
  fyStartYear: number
  clientRecord: FinanceForecastClientInput | undefined
}): FinanceForecastLine[] {
  const c = (args.clientRecord ?? {}) as Record<string, unknown>
  const monthlyRetainer = Number(c[CLIENT_FIELD_MONTHLY_RETAINER])
  const feesearch = Number(c[CLIENT_FIELD_FEE_SEARCH])
  const feesocial = Number(c[CLIENT_FIELD_FEE_SOCIAL])
  let feeProgSum = 0
  for (const f of CLIENT_PROG_FEE_FIELDS) {
    feeProgSum += Number(c[f])
  }

  const retainerMonth = emptyMonthly()
  const searchTopUp = emptyMonthly()
  const directClientFees = emptyMonthly()

  if (Number.isFinite(monthlyRetainer) && monthlyRetainer > 0) {
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      retainerMonth[k] = round2(monthlyRetainer)
    }
  }

  const clientFeeMonthly = round2(
    (Number.isFinite(feesearch) ? feesearch : 0) + (Number.isFinite(feesocial) ? feesocial : 0)
  )
  if (clientFeeMonthly > 0) {
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      searchTopUp[k] = clientFeeMonthly
    }
  }

  const progFees = Number.isFinite(feeProgSum) && feeProgSum > 0 ? round2(feeProgSum) : 0
  if (progFees > 0) {
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      directClientFees[k] = progFees
    }
  }

  const lines: FinanceForecastLine[] = []

  if (fySum(retainerMonth) > 0) {
    lines.push(
      makeLine({
        line_key: FINANCE_FORECAST_LINE_KEYS.retainer,
        group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
        monthly: retainerMonth,
        client_id: args.client_id,
        client_name: args.client_name,
        mba_number: null,
        campaign_id: null,
        campaign_name: "",
        media_plan_version_id: null,
        version_number: null,
        scenario: args.scenario,
        source: {
          kind: "client_monthlyretainer",
          refs: [
            {
              record_type: "client",
              record_id: args.client_id,
              field: CLIENT_FIELD_MONTHLY_RETAINER,
            },
          ],
        },
        debug: {
          stage: "client_retainer",
          explanation: `Client ${CLIENT_FIELD_MONTHLY_RETAINER} (see lib/validations/client.ts) applied evenly across FY months.`,
        },
      })
    )
  }

  if (fySum(searchTopUp) > 0) {
    lines.push(
      makeLine({
        line_key: FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct,
        group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
        monthly: searchTopUp,
        client_id: args.client_id,
        client_name: args.client_name,
        mba_number: null,
        campaign_id: null,
        campaign_name: "",
        media_plan_version_id: null,
        version_number: null,
        scenario: args.scenario,
        source: {
          kind: "client_feesearch_feesocial",
          refs: [
            { record_type: "client", record_id: args.client_id, field: CLIENT_FIELD_FEE_SEARCH },
            { record_type: "client", record_id: args.client_id, field: CLIENT_FIELD_FEE_SOCIAL },
          ],
        },
        debug: {
          stage: "client_search_social_fees",
          explanation: `Client ${CLIENT_FIELD_FEE_SEARCH} + ${CLIENT_FIELD_FEE_SOCIAL} (fixed monthly) → search_social forecast bucket per mapping/definitions.`,
        },
      })
    )
  }

  if (fySum(directClientFees) > 0) {
    lines.push(
      makeLine({
        line_key: FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct,
        group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
        monthly: directClientFees,
        client_id: args.client_id,
        client_name: args.client_name,
        mba_number: null,
        campaign_id: null,
        campaign_name: "",
        media_plan_version_id: null,
        version_number: null,
        scenario: args.scenario,
        source: {
          kind: "client_feeprog_sum",
          refs: [{ record_type: "client", record_id: args.client_id, field: "feeprog*" }],
        },
        debug: {
          stage: "client_prog_fees",
          explanation: `Sum of CLIENT_PROG_FEE_FIELDS (${CLIENT_PROG_FEE_FIELDS.join(", ")}) as monthly fee inputs → direct_managed_digital bucket.`,
        },
      })
    )
  }

  lines.push(
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.projectScopePrip,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: emptyMonthly(),
      client_id: args.client_id,
      client_name: args.client_name,
      mba_number: null,
      campaign_id: null,
      campaign_name: "",
      media_plan_version_id: null,
      version_number: null,
      scenario: args.scenario,
      source: {
        kind: "project_scope_prip_placeholder",
        refs: [{ record_type: "client", record_id: args.client_id }],
      },
      debug: {
        stage: "project_scope_prip",
        explanation: `Placeholder — ${FORECAST_MAPPING_SCHEMA_GAPS.projectScopePrip}. See getForecastLineMappingDefinition(project_scope_prip).`,
      },
    })
  )

  void args.fyStartYear
  return lines
}

/**
 * Append a single total revenue row equal to the month-wise sum of all revenue body line_keys
 * (every campaign-level and client-level row in those buckets).
 */
function attachTotalRevenueLine(
  revenueLines: FinanceForecastLine[],
  ctx: {
    client_id: string
    client_name: string
    scenario: FinanceForecastScenario
    fyStartYear: number
  }
): FinanceForecastLine[] {
  const body = revenueLines.filter((l) => l.line_key !== FINANCE_FORECAST_LINE_KEYS.totalRevenue)

  const totalMonthly = emptyMonthly()
  const contributors: string[] = []

  for (const line of body) {
    if (!FORECAST_REVENUE_BODY_LINE_ORDER.includes(line.line_key)) continue
    contributors.push(`${line.line_key}:${line.mba_number ?? "client"}:${line.fy_total}`)
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      mergeMonthly(totalMonthly, k, line.monthly[k] ?? 0)
    }
  }

  body.push(
    makeLine({
      line_key: FINANCE_FORECAST_LINE_KEYS.totalRevenue,
      group_key: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
      monthly: totalMonthly,
      client_id: ctx.client_id,
      client_name: ctx.client_name,
      mba_number: null,
      campaign_id: null,
      campaign_name: "",
      media_plan_version_id: null,
      version_number: null,
      scenario: ctx.scenario,
      source: { kind: "sum_revenue_body_lines" },
      debug: {
        stage: "total_revenue",
        explanation:
          "Sum of FORECAST_REVENUE_BODY_LINE_ORDER rows for this client. See lib/finance/forecast/mapping/definitions.ts.",
        inputs_digest: contributors.slice(0, 80).join(";"),
      },
    })
  )

  void ctx.fyStartYear
  return body
}
