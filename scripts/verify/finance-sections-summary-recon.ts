/**
 * FN-FIX-1 / FS-2 / CP-3 reconciliation gate:
 *  - receivables FYTD (Postgres published tip vs legacy blob pool)
 *  - payables composition (media-only, status-scoped, dual-shape join + client-pays)
 *  - per-MBA legacy-vs-sections payables with disposition causes
 *  - VERIFY TARGETS: payables $1,617,617.28 / excluded media $604,145.84 / CP $49,568.00
 *
 * Usage:
 *   npm run recon:finance-sections-summary
 *   npm run recon:finance-sections-summary -- --fy=2026
 */

import { sql } from "drizzle-orm"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function parseFyArg(argv: string[]): number | undefined {
  for (const a of argv) {
    if (a.startsWith("--fy=")) {
      const n = Number.parseInt(a.slice(5), 10)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

function aud(cents: number): string {
  return (cents / 100).toFixed(2)
}

function asCents(v: unknown): number {
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  return 0
}

function monthStartDate(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function monthEndExclusive(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((x) => Number.parseInt(x, 10))
  const d = new Date(y!, m! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

async function legacyReceivablesByMba(fy: number): Promise<{
  totalCents: number
  byMba: Map<string, number>
}> {
  const { parseXanoListPayload } = await import("../../lib/api/xano")
  const { xanoMediaPlansUrl } = await import("../../lib/api/xanoClients")
  const { fetchAllXanoPages } = await import("../../lib/api/xanoPagination")
  const { mbaJoinKey } = await import("../../lib/mediaplan/mbaNumber")
  const { publishedVersionFromMaster } = await import(
    "../../lib/mediaplan/publishedVersionGuard"
  )
  const {
    apiClient,
    getTzParts,
    getAustralianFinancialYearWindow,
    isBookedApprovedCompleted,
    normalizeSchedule,
    parseMonthYear,
    getMonthYearValue,
    pickHighestVersionRow,
    sumLineItems,
  } = await import("../../lib/api/dashboard/shared")
  const {
    australianFyStartYearForDate,
    billingMonthsInAustralianFinancialYear,
    referenceDateForFyStartYear,
  } = await import("../../lib/finance/months")

  const now = new Date()
  const parts = getTzParts(now)
  const currentMonthIso = `${parts.year}-${String(parts.month).padStart(2, "0")}`
  const melbourneCalendar = new Date(parts.year, parts.month - 1, parts.day)
  const currentFyStart = australianFyStartYearForDate(melbourneCalendar)
  const reference = referenceDateForFyStartYear(fy)
  const fyMonths = billingMonthsInAustralianFinancialYear(reference)
  const { start: fyStart, end: fyEnd } = getAustralianFinancialYearWindow(reference)

  let fyMonthAllowed: Set<string>
  if (fy < currentFyStart) fyMonthAllowed = new Set(fyMonths)
  else if (fy > currentFyStart) fyMonthAllowed = new Set()
  else fyMonthAllowed = new Set(fyMonths.filter((m) => m <= currentMonthIso))

  const [allVersions, mastersRaw] = await Promise.all([
    fetchAllXanoPages(
      xanoMediaPlansUrl("media_plan_versions"),
      {},
      "RECON_finance_sections_fytd",
      100,
      50
    ),
    (async () => {
      for (const endpoint of ["media_plan_master", "media_plans_master"] as const) {
        try {
          const response = await apiClient.get(xanoMediaPlansUrl(endpoint))
          return parseXanoListPayload(response.data)
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status
          if (status === 404) continue
          throw err
        }
      }
      return [] as unknown[]
    })(),
  ])

  const publishedByMba = new Map<string, number>()
  for (const master of mastersRaw || []) {
    const m = master as Record<string, unknown>
    const key = mbaJoinKey(m?.mba_number ?? m?.mbaNumber)
    if (!key) continue
    const published = publishedVersionFromMaster(m)
    if (published > 0) publishedByMba.set(key, published)
  }

  const versionsByMBA = (allVersions as Record<string, unknown>[]).reduce(
    (acc: Record<string, Record<string, unknown>[]>, version) => {
      const mbaNumber = version?.mba_number
      const key = mbaJoinKey(mbaNumber)
      if (!key) return acc
      acc[key] = acc[key] || []
      acc[key]!.push(version)
      return acc
    },
    {} as Record<string, Record<string, unknown>[]>
  )

  const byMba = new Map<string, number>()
  let totalCents = 0

  for (const [mbaNumber, versionsRaw] of Object.entries(versionsByMBA)) {
    const versions = versionsRaw as Record<string, unknown>[]
    const mbaKey = mbaJoinKey(mbaNumber) || String(mbaNumber)
    const published = publishedByMba.get(mbaKey)
    const candidatePool =
      published != null && published > 0
        ? versions.filter((v) => {
            const vn = Number(v?.version_number ?? v?.versionNumber ?? 0)
            return Number.isFinite(vn) && vn > 0 && vn <= published
          })
        : versions
    const sorted = candidatePool
      .slice()
      .sort(
        (a, b) => Number(b.version_number || 0) - Number(a.version_number || 0)
      )
    const bookedApproved = sorted.find((v) =>
      isBookedApprovedCompleted(v.campaign_status)
    )
    const version =
      bookedApproved ?? pickHighestVersionRow(versions, published) ?? null
    if (!version) continue

    const billingSchedule = normalizeSchedule(
      version?.billingSchedule ?? version?.billing_schedule
    )
    let mbaAud = 0
    for (const entry of billingSchedule) {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate) continue
      if (monthDate.getTime() < fyStart.getTime() || monthDate.getTime() > fyEnd.getTime())
        continue
      const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
      if (!fyMonthAllowed.has(ym)) continue
      mbaAud += sumLineItems(entry)
    }
    const cents = Math.round(mbaAud * 100)
    if (cents === 0) continue
    byMba.set(mbaNumber, (byMba.get(mbaNumber) ?? 0) + cents)
    totalCents += cents
  }

  return { totalCents, byMba }
}

/** Legacy hub payables UI path: include_drafts=0 → booked|approved|completed only; media-only. */
async function legacyPayablesByMba(months: string[]): Promise<{
  totalCents: number
  byMba: Map<string, number>
}> {
  const { fetchRelevantPlanVersionsForFinanceMonths } = await import(
    "../../lib/finance/relevantPlanVersions"
  )
  const { composePayableRecordsForMonth } = await import(
    "../../lib/finance/composeFinanceHubRecords"
  )
  const { hydrateVersionsFinanceScheduleSource } = await import(
    "../../lib/finance/scheduleMonthsSource"
  )
  const { getCachedPublishers } = await import("../../lib/finance/xanoReferenceCache")

  const versionsByMonth = await fetchRelevantPlanVersionsForFinanceMonths(months)
  if ("error" in versionsByMonth) {
    throw new Error(`legacy payables versions: ${versionsByMonth.error}`)
  }

  const seen = new Set<number>()
  const uniqueVersions: Record<string, unknown>[] = []
  for (const entry of versionsByMonth.values()) {
    for (const v of (entry.relevantVersions as Record<string, unknown>[]) ?? []) {
      const id = Number(v.id ?? v.version_id ?? 0)
      if (!id || seen.has(id)) continue
      seen.add(id)
      uniqueVersions.push(v)
    }
  }
  await hydrateVersionsFinanceScheduleSource(uniqueVersions)
  const publishers = (await getCachedPublishers()) as Record<string, unknown>[]

  const byMba = new Map<string, number>()
  let totalCents = 0

  for (const monthStr of months) {
    const entry = versionsByMonth.get(monthStr)
    if (!entry) continue
    const records = composePayableRecordsForMonth({
      year: entry.year,
      month: entry.month,
      relevantVersions: entry.relevantVersions as Record<string, unknown>[],
      publishers,
      includeNonBooked: false, // hub UI default includeDrafts:false → include_drafts=0
      types: [],
      clientsIdParam: null,
      searchParam: null,
      publishersIdParam: null,
    })
    for (const r of records) {
      const mba = String(r.mba_number ?? "").trim()
      if (!mba) continue
      const cents = Math.round(Number(r.total ?? 0) * 100)
      if (cents === 0) continue
      byMba.set(mba, (byMba.get(mba) ?? 0) + cents)
      totalCents += cents
    }
  }

  return { totalCents, byMba }
}

type PayablesComposition = {
  mediaAttributedCents: number
  mediaAttributedJoinedCents: number
  orphanMediaCents: number
  clientPaysExcludedCents: number
  campaignLevelServiceCents: number
  serviceMediaCents: number
  feeCents: number
  adservingCents: number
  mediaOnlyPayablesCents: number
  mediaFeeAdservingPayablesCents: number
}

async function sectionsPayablesComposition(
  from: string,
  to: string
): Promise<PayablesComposition> {
  const { getDb } = await import("../../db")
  const { SCHEDULE_LINE_JOIN_SQL } = await import(
    "../../lib/finance/sections/scheduleLineJoinSql"
  )
  const { IS_SERVICE_LINE_SQL } = await import(
    "../../lib/finance/sections/serviceLineBucket"
  )
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)

  const statusIncluded = sql.raw(
    `(LOWER(COALESCE(v.campaign_status, '')) IN ('approved', 'booked', 'completed'))`
  )

  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE
        WHEN sm.component = 'media'
          AND NOT (${isService})
          AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
        THEN sm.amount_cents ELSE 0 END), 0) AS media_attributed_cents,
      COALESCE(SUM(CASE
        WHEN sm.component = 'media'
          AND NOT (${isService})
          AND li.id IS NOT NULL
          AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
        THEN sm.amount_cents ELSE 0 END), 0) AS media_joined_cents,
      COALESCE(SUM(CASE
        WHEN sm.component = 'media'
          AND NOT (${isService})
          AND li.id IS NULL
        THEN sm.amount_cents ELSE 0 END), 0) AS orphan_media_cents,
      COALESCE(SUM(CASE
        WHEN sm.component = 'media'
          AND COALESCE(li.client_pays_for_media, FALSE) = TRUE
        THEN sm.amount_cents ELSE 0 END), 0) AS client_pays_excluded_cents,
      COALESCE(SUM(CASE
        WHEN ${isService} THEN sm.amount_cents ELSE 0 END), 0) AS campaign_level_service_cents,
      COALESCE(SUM(CASE
        WHEN ${isService} AND sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0)
        AS service_media_cents,
      COALESCE(SUM(CASE
        WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_all_cents,
      COALESCE(SUM(CASE
        WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_all_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    LEFT JOIN line_items li ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
  `)

  const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0]
    ?? (Array.isArray(result) ? (result as Record<string, unknown>[])[0] : undefined)
    ?? {}

  const mediaAttributedCents = asCents(row.media_attributed_cents)
  const mediaAttributedJoinedCents = asCents(row.media_joined_cents)
  const orphanMediaCents = asCents(row.orphan_media_cents)
  const clientPaysExcludedCents = asCents(row.client_pays_excluded_cents)
  const campaignLevelServiceCents = asCents(row.campaign_level_service_cents)
  const serviceMediaCents = asCents(row.service_media_cents)
  const feeCents = asCents(row.fee_all_cents)
  const adservingCents = asCents(row.adserving_all_cents)

  return {
    mediaAttributedCents,
    mediaAttributedJoinedCents,
    orphanMediaCents,
    clientPaysExcludedCents,
    campaignLevelServiceCents,
    serviceMediaCents,
    feeCents,
    adservingCents,
    mediaOnlyPayablesCents: mediaAttributedCents,
    mediaFeeAdservingPayablesCents: 0, // filled via sectionsPayablesTotal
  }
}

/** Exact sections summary payables total — media-only, status-scoped, ex client-pays. */
async function sectionsPayablesTotal(from: string, to: string): Promise<number> {
  const { getDb } = await import("../../db")
  const { SCHEDULE_LINE_JOIN_SQL } = await import(
    "../../lib/finance/sections/scheduleLineJoinSql"
  )
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    LEFT JOIN line_items li ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND LOWER(COALESCE(v.campaign_status, '')) IN ('approved', 'booked', 'completed')
      AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
  `)
  const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0]
    ?? (Array.isArray(result) ? (result as Record<string, unknown>[])[0] : undefined)
    ?? {}
  return asCents(row.cents)
}

async function excludedByStatusMedia(from: string, to: string): Promise<number> {
  const { getDb } = await import("../../db")
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    WHERE m.published_version_id IS NOT NULL
      AND LOWER(COALESCE(v.campaign_status, '')) IN ('draft', 'planned', 'cancelled')
  `)
  const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0]
    ?? (Array.isArray(result) ? (result as Record<string, unknown>[])[0] : undefined)
    ?? {}
  return asCents(row.cents)
}

async function sectionsPayablesByMba(
  from: string,
  to: string
): Promise<
  Array<{
    mba: string
    status: string
    cents: number
    mediaCents: number
    feeCents: number
    adservingCents: number
    serviceCents: number
  }>
> {
  const { getDb } = await import("../../db")
  const { SCHEDULE_LINE_JOIN_SQL } = await import(
    "../../lib/finance/sections/scheduleLineJoinSql"
  )
  const { IS_SERVICE_LINE_SQL } = await import(
    "../../lib/finance/sections/serviceLineBucket"
  )
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)
  const result = await db.execute(sql`
    SELECT
      m.mba_number AS mba,
      COALESCE(LOWER(v.campaign_status), '') AS status,
      COALESCE(SUM(sm.amount_cents), 0) AS cents,
      COALESCE(SUM(sm.amount_cents), 0) AS media_cents,
      0::bigint AS fee_cents,
      0::bigint AS adserving_cents,
      COALESCE(SUM(CASE WHEN ${isService} THEN sm.amount_cents ELSE 0 END), 0) AS service_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    LEFT JOIN line_items li ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND LOWER(COALESCE(v.campaign_status, '')) IN ('approved', 'booked', 'completed')
      AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
    GROUP BY m.mba_number, COALESCE(LOWER(v.campaign_status), '')
    HAVING SUM(sm.amount_cents) <> 0
    ORDER BY ABS(SUM(sm.amount_cents)) DESC
  `)
  const rows =
    (result as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(result) ? (result as Record<string, unknown>[]) : [])
  return rows.map((row) => ({
    mba: String(row.mba ?? ""),
    status: String(row.status ?? ""),
    cents: asCents(row.cents),
    mediaCents: asCents(row.media_cents),
    feeCents: asCents(row.fee_cents),
    adservingCents: asCents(row.adserving_cents),
    serviceCents: asCents(row.service_cents),
  }))
}

async function campaignLevelByStatus(
  from: string,
  to: string
): Promise<Array<{ status: string; mbaCount: number; cents: number }>> {
  const { getDb } = await import("../../db")
  const { IS_SERVICE_LINE_SQL } = await import(
    "../../lib/finance/sections/serviceLineBucket"
  )
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)
  const result = await db.execute(sql`
    SELECT
      COALESCE(LOWER(v.campaign_status), '(null)') AS status,
      COUNT(DISTINCT m.mba_number) AS mba_count,
      COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${isService}
    GROUP BY 1
    ORDER BY cents DESC
  `)
  const rows =
    (result as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(result) ? (result as Record<string, unknown>[]) : [])
  return rows.map((row) => ({
    status: String(row.status ?? ""),
    mbaCount: asCents(row.mba_count),
    cents: asCents(row.cents),
  }))
}

async function receivablesByStatus(
  from: string,
  to: string
): Promise<Array<{ status: string; mbaCount: number; cents: number }>> {
  const { getDb } = await import("../../db")
  const db = getDb()
  const fromDate = monthStartDate(from)
  const toEx = monthEndExclusive(to)
  const result = await db.execute(sql`
    SELECT
      COALESCE(LOWER(v.campaign_status), '(null)') AS status,
      COUNT(DISTINCT m.mba_number) AS mba_count,
      COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'billing'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toEx}::date
    WHERE m.published_version_id IS NOT NULL
    GROUP BY 1
    ORDER BY cents DESC
  `)
  const rows =
    (result as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(result) ? (result as Record<string, unknown>[]) : [])
  return rows.map((row) => ({
    status: String(row.status ?? ""),
    mbaCount: asCents(row.mba_count),
    cents: asCents(row.cents),
  }))
}

function dispositionPayablesDelta(args: {
  mba: string
  legacyCents: number
  pgCents: number
  deltaCents: number
  status: string
  mediaCents: number
  feeCents: number
  adservingCents: number
  serviceCents: number
}): string {
  const {
    legacyCents,
    pgCents,
    deltaCents,
    status,
    feeCents,
    adservingCents,
    serviceCents,
  } = args
  const abs = Math.abs(deltaCents)
  const feeAds = feeCents + adservingCents
  const live = status === "booked" || status === "approved" || status === "completed"
  const nonLive = status === "draft" || status === "planned" || status === "cancelled"

  if (legacyCents === 0 && pgCents > 0 && nonLive) {
    return `status scope — sections published tip is ${status}; legacy hub UI include_drafts=0 drops non-live`
  }
  if (legacyCents === 0 && pgCents > 0 && live && feeAds > 0 && Math.abs(pgCents - feeAds) < 100) {
    return `fee-adserving inclusion — sections media+fee+adserving; legacy media-only (Δ≈fee+ads $${aud(feeAds)})`
  }
  if (legacyCents === 0 && pgCents > 0 && live && serviceCents > 0 && serviceCents === pgCents) {
    return `synthetic campaign-level months — PG __service__* only; legacy line extract had $0 media`
  }
  if (legacyCents === 0 && pgCents > 0) {
    return `version pool — PG published tip has delivery months; legacy month-overlap tip empty/other`
  }
  if (legacyCents > 0 && pgCents === 0) {
    return `version pool / empty schedule_months — legacy blob delivery present; published tip has $0 in window`
  }
  if (live && feeAds > 0 && Math.abs(abs - feeAds) <= 100) {
    return `fee-adserving inclusion — Δ ≈ sections fee+adserving ($${aud(feeAds)}); legacy media-only`
  }
  if (serviceCents > 0 && serviceCents >= abs * 0.5) {
    return `synthetic campaign-level months — __service__* $${aud(serviceCents)} dominates Δ`
  }
  if (nonLive) {
    return `status scope — ${status} published tip counted in sections; legacy UI excludes`
  }
  return `version pool / month distribution — tip or month materialisation differs (open if unexplained)`
}

async function main() {
  const {
    australianFyStartYearForDate,
    billingMonthsInAustralianFinancialYear,
    getCurrentBillingMonth,
    referenceDateForFyStartYear,
  } = await import("../../lib/finance/months")
  const {
    fetchFinanceSectionsSummary,
    fetchReceivablesByMba,
    normalizeSummaryQuery,
    receivablesSqlText,
    payablesSqlText,
  } = await import("../../lib/finance/sections/summaryQuery")
  const { closeDb } = await import("../../db")

  const fy = parseFyArg(process.argv.slice(2)) ?? australianFyStartYearForDate()
  const currentMonth = getCurrentBillingMonth()
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentFy = australianFyStartYearForDate()
  const to = fy < currentFy ? fyMonths[fyMonths.length - 1]! : currentMonth
  const from = fyMonths[0]!
  const monthsInWindow = fyMonths.filter((m) => m >= from && m <= to)

  const query = normalizeSummaryQuery({ fy, from, to, clients: [] })

  console.log("=== Finance sections summary recon (FN-FIX-1 / FS-2) ===")
  console.log(`FY=${query.fy} from=${query.from} to=${query.to}`)
  console.log("")
  console.log("--- Receivables SQL (Postgres) ---")
  console.log(receivablesSqlText(query))
  console.log("")
  console.log("--- Payables SQL (Postgres) ---")
  console.log(payablesSqlText(query))
  console.log("")

  try {
    const [
      legacyAr,
      summary,
      byMbaPgAr,
      composition,
      payablesTotal,
      excludedMedia,
      byMbaPgAp,
      legacyAp,
      serviceByStatus,
      arByStatus,
    ] = await Promise.all([
      legacyReceivablesByMba(query.fy),
      fetchFinanceSectionsSummary(query),
      fetchReceivablesByMba(query),
      sectionsPayablesComposition(query.from, query.to),
      sectionsPayablesTotal(query.from, query.to),
      excludedByStatusMedia(query.from, query.to),
      sectionsPayablesByMba(query.from, query.to),
      legacyPayablesByMba(monthsInWindow),
      campaignLevelByStatus(query.from, query.to),
      receivablesByStatus(query.from, query.to),
    ])

    composition.mediaOnlyPayablesCents = payablesTotal
    composition.mediaFeeAdservingPayablesCents =
      payablesTotal + composition.feeCents + composition.adservingCents

    // CP-3 VERIFY TARGETS (FY2026 Jul–Aug) — stop if these diverge.
    const TARGET_PAYABLES = 161761728 // $1,617,617.28
    const TARGET_EXCLUDED_MEDIA = 60414584 // $604,145.84
    const TARGET_CLIENT_PAYS = 4956800 // $49,568.00

    console.log("--- CP-3 VERIFY TARGETS (media-only · status-scoped) ---")
    console.log(
      [
        "slice",
        "cents",
        "aud",
        "target_aud",
        "delta_cents",
        "match",
      ].join("\t")
    )
    const cp3Slices: Array<[string, number, number]> = [
      ["payables_media_only_status_filtered", payablesTotal, TARGET_PAYABLES],
      ["coverage_excludedByStatusCents_media", excludedMedia, TARGET_EXCLUDED_MEDIA],
      [
        "client_pays_excluded_within_included_statuses",
        composition.clientPaysExcludedCents,
        TARGET_CLIENT_PAYS,
      ],
      ["summary_payablesFytd", summary.payablesFytd.cents, TARGET_PAYABLES],
      [
        "summary_excludedByStatus_media",
        summary.coverage.excludedByStatusCents.media,
        TARGET_EXCLUDED_MEDIA,
      ],
      [
        "summary_clientPaysExcludedCents",
        summary.coverage.clientPaysExcludedCents,
        TARGET_CLIENT_PAYS,
      ],
      ["orphan_line_cents_included_statuses", composition.orphanMediaCents, -1],
      ["fee_included_statuses", composition.feeCents, -1],
      ["adserving_included_statuses", composition.adservingCents, -1],
    ]
    const cp3Diffs: string[] = []
    for (const [name, cents, expected] of cp3Slices) {
      const exp = expected < 0 ? "" : aud(expected)
      const d = expected < 0 ? "" : String(cents - expected)
      const match = expected < 0 ? "" : cents === expected ? "MATCH" : "MISS"
      if (expected >= 0 && cents !== expected) {
        cp3Diffs.push(`${name}: got $${aud(cents)} expected $${aud(expected)} (Δ ${d})`)
      }
      console.log([name, String(cents), aud(cents), exp, d, match].join("\t"))
    }
    console.log("")
    if (cp3Diffs.length === 0) {
      console.log("MATCH: CP-3 verify targets all hit.")
    } else {
      console.log("STOP — CP-3 verify target miss (do not merge until explained):")
      for (const d of cp3Diffs) console.log(`  - ${d}`)
    }
    console.log("")
    console.log(
      `Legacy hub payables (include_drafts=0, media-only, months ${monthsInWindow.join(",")}): $${aud(legacyAp.totalCents)}`
    )
    console.log(
      `Sections summary payablesFytd: $${aud(summary.payablesFytd.cents)} | lineDetailPct=${summary.coverage.lineDetailPct} | orphanLineCents=$${aud(summary.coverage.orphanLineCents)}`
    )
    console.log("")

    const diffs = cp3Diffs

    console.log("--- Campaign-level __service__* by campaign_status ---")
    console.log(["status", "mba_count", "cents", "aud"].join("\t"))
    for (const r of serviceByStatus) {
      console.log([r.status, String(r.mbaCount), String(r.cents), aud(r.cents)].join("\t"))
    }
    console.log("")

    console.log("--- Receivables (billing) by campaign_status (sections PG) ---")
    console.log(["status", "mba_count", "cents", "aud"].join("\t"))
    for (const r of arByStatus) {
      console.log([r.status, String(r.mbaCount), String(r.cents), aud(r.cents)].join("\t"))
    }
    console.log("")

    // Receivables totals (existing)
    const legacyCents = legacyAr.totalCents
    const newCents = summary.receivablesFytd.cents
    const deltaCents = newCents - legacyCents
    console.log("--- Receivables totals ---")
    console.log(
      `legacy_blob_hub $${aud(legacyCents)} | sections_pg $${aud(newCents)} | Δ $${aud(deltaCents)}`
    )
    const TARGET = -65893
    if (deltaCents === TARGET || Math.abs(deltaCents - TARGET) <= 1) {
      console.log(`MATCH: receivables delta equals −$658.93 (${deltaCents} cents).`)
    }
    console.log("")

    // Per-MBA payables
    const pgApMap = new Map(byMbaPgAp.map((r) => [r.mba, r]))
    const allAp = new Set([...legacyAp.byMba.keys(), ...pgApMap.keys()])
    const apRows: Array<{
      mba: string
      legacyCents: number
      pgCents: number
      deltaCents: number
      status: string
      mediaCents: number
      feeCents: number
      adservingCents: number
      serviceCents: number
      disposition: string
    }> = []
    for (const mba of allAp) {
      const l = legacyAp.byMba.get(mba) ?? 0
      const p = pgApMap.get(mba)
      const pgCents = p?.cents ?? 0
      if (l === 0 && pgCents === 0) continue
      const delta = pgCents - l
      const row = {
        mba,
        legacyCents: l,
        pgCents,
        deltaCents: delta,
        status: p?.status ?? "",
        mediaCents: p?.mediaCents ?? 0,
        feeCents: p?.feeCents ?? 0,
        adservingCents: p?.adservingCents ?? 0,
        serviceCents: p?.serviceCents ?? 0,
        disposition: "",
      }
      row.disposition = dispositionPayablesDelta(row)
      apRows.push(row)
    }
    apRows.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))

    console.log("--- Per-MBA payables (legacy media-only / include_drafts=0 vs sections media-only status-scoped) ---")
    console.log(
      [
        "mba",
        "status",
        "legacy_cents",
        "pg_cents",
        "delta_cents",
        "delta_aud",
        "pg_media",
        "pg_fee",
        "pg_ads",
        "pg_service",
        "disposition",
      ].join("\t")
    )
    const nonzeroAp = apRows.filter((r) => r.deltaCents !== 0)
    for (const r of nonzeroAp) {
      console.log(
        [
          r.mba,
          r.status,
          String(r.legacyCents),
          String(r.pgCents),
          String(r.deltaCents),
          aud(r.deltaCents),
          String(r.mediaCents),
          String(r.feeCents),
          String(r.adservingCents),
          String(r.serviceCents),
          r.disposition,
        ].join("\t")
      )
    }
    console.log("")
    console.log(`Non-zero payables MBA rows: ${nonzeroAp.length}`)
    console.log(
      `Legacy AP total $${aud(legacyAp.totalCents)} | Sections AP (media-only status-scoped) $${aud(payablesTotal)} | Δ $${aud(payablesTotal - legacyAp.totalCents)}`
    )
    console.log(
      `Excluded-by-status media $${aud(excludedMedia)} | client-pays within-status $${aud(composition.clientPaysExcludedCents)}`
    )

    // Machine-readable JSON block for the report doc
    console.log("")
    console.log("--- JSON_SUMMARY ---")
    console.log(
      JSON.stringify(
        {
          fy: query.fy,
          from: query.from,
          to: query.to,
          cp3: {
            payablesMediaOnlyAud: aud(payablesTotal),
            excludedByStatusMediaAud: aud(excludedMedia),
            clientPaysExcludedAud: aud(composition.clientPaysExcludedCents),
            orphanMediaAud: aud(composition.orphanMediaCents),
            feeAud: aud(composition.feeCents),
            adservingAud: aud(composition.adservingCents),
            targetsHit: cp3Diffs.length === 0,
          },
          composition: {
            mediaJoinedAud: aud(composition.mediaAttributedJoinedCents),
            orphanMediaAud: aud(composition.orphanMediaCents),
            mediaAttributedInclOrphansAud: aud(composition.mediaAttributedCents),
            clientPaysExcludedAud: aud(composition.clientPaysExcludedCents),
            serviceMediaAud: aud(composition.serviceMediaCents),
            campaignLevelServiceAllAud: aud(composition.campaignLevelServiceCents),
            feeAud: aud(composition.feeCents),
            adservingAud: aud(composition.adservingCents),
            payablesMediaOnlyAud: aud(payablesTotal),
          },
          legacyPayablesAud: aud(legacyAp.totalCents),
          receivablesDeltaCents: deltaCents,
          serviceByStatus: serviceByStatus.map((r) => ({
            status: r.status,
            mbaCount: r.mbaCount,
            aud: aud(r.cents),
          })),
          receivablesByStatus: arByStatus.map((r) => ({
            status: r.status,
            mbaCount: r.mbaCount,
            aud: aud(r.cents),
          })),
          payablesNonzeroCount: nonzeroAp.length,
          perMba: apRows.map((r) => ({
            mba: r.mba,
            status: r.status,
            legacyAud: aud(r.legacyCents),
            sectionsAud: aud(r.pgCents),
            deltaAud: aud(r.deltaCents),
            disposition: r.disposition,
          })),
          cp3Diffs: diffs,
        },
        null,
        2
      )
    )

    if (cp3Diffs.length > 0) {
      process.exitCode = 2
    }
  } finally {
    await closeDb().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
