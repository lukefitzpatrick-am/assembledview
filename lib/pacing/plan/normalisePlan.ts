export type ChannelGroup = "social" | "prog_display" | "prog_video"

export type PlannedBurst = {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  budgetNumber: number
  deliverableNumber?: number
}

export type PlannedLineItem = {
  mbaNumber: string
  clientSlug: string
  campaignName: string
  channelGroup: ChannelGroup
  lineItemId: string // lowercase
  platform: string
  buyType: string
  totalBudgetNumber: number
  deliverableTotalNumber?: number
  bursts: PlannedBurst[]
}

export type NormalisePlanInputs = {
  // Latest versions by mbaNumber (caller should pass the already-latest records)
  mediaPlanVersions: Array<{
    mba_number?: string
    mbaNumber?: string
    client_name?: string
    clientName?: string
    campaign_name?: string
    campaignName?: string
  }>
  mediaPlanSocial: any[]
  mediaPlanProgrammaticDisplay: any[]
  mediaPlanProgrammaticVideo: any[]
}

function normalizeISODate(value: unknown): string | null {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const cleaned = String(value).replace(/[^0-9.-]/g, "")
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function slugifyClientName(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  return s
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

function parseBursts(raw: unknown): PlannedBurst[] {
  const source = (() => {
    if (!raw) return null
    if (Array.isArray(raw)) return raw
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  })()

  if (!source) return []

  return source
    .map((b: any) => {
      const startDate =
        normalizeISODate(
          b?.start_date ?? b?.startDate ?? b?.start ?? b?.begin_date ?? b?.beginDate
        ) ?? null
      const endDate =
        normalizeISODate(b?.end_date ?? b?.endDate ?? b?.end ?? b?.stop_date ?? b?.stopDate) ??
        startDate

      if (!startDate || !endDate) return null

      const budgetNumber = parseNumber(
        b?.budget_number ?? b?.media_investment ?? b?.buy_amount_number ?? b?.budget ?? 0
      )
      const deliverableNumber = parseNumber(
        b?.calculated_value_number ?? b?.deliverables ?? b?.deliverable ?? b?.conversions
      )

      return {
        startDate,
        endDate,
        budgetNumber,
        ...(deliverableNumber ? { deliverableNumber } : {}),
      } satisfies PlannedBurst
    })
    .filter(Boolean) as PlannedBurst[]
}

function normaliseLineItemBase(raw: any) {
  const mbaNumber = String(raw?.mba_number ?? raw?.mbaNumber ?? "").trim()
  const clientName =
    raw?.mp_client_name ?? raw?.client_name ?? raw?.clientName ?? raw?.client ?? raw?.mpClientName
  const campaignName =
    raw?.mp_campaignname ?? raw?.campaign_name ?? raw?.campaignName ?? raw?.campaign ?? ""

  const lineItemId =
    String(raw?.line_item_id ?? raw?.lineItemId ?? raw?.LINE_ITEM_ID ?? "").trim().toLowerCase()

  const platform = String(raw?.platform ?? raw?.site ?? raw?.publisher ?? "").trim()
  const buyType = String(raw?.buy_type ?? raw?.buyType ?? "").trim()
  const totalBudgetNumber = parseNumber(raw?.total_budget ?? raw?.budget ?? raw?.buy_amount ?? 0)
  const deliverableTotalNumber = parseNumber(
    raw?.goal_deliverable_total ?? raw?.deliverables_total ?? raw?.deliverables ?? raw?.goal ?? 0
  )

  const bursts = parseBursts(raw?.bursts ?? raw?.bursts_json)
  const fallbackStart = normalizeISODate(raw?.start_date ?? raw?.startDate ?? raw?.start)
  const fallbackEnd = normalizeISODate(raw?.end_date ?? raw?.endDate ?? raw?.end)
  const burstsWithFallback =
    bursts.length === 0 && fallbackStart && fallbackEnd
      ? [
          {
            startDate: fallbackStart,
            endDate: fallbackEnd,
            budgetNumber: totalBudgetNumber,
            ...(deliverableTotalNumber ? { deliverableNumber: deliverableTotalNumber } : {}),
          },
        ]
      : bursts

  return {
    mbaNumber,
    clientSlug: slugifyClientName(clientName),
    campaignName: String(campaignName ?? "").trim(),
    lineItemId,
    platform: platform || "—",
    buyType: buyType || "—",
    totalBudgetNumber,
    deliverableTotalNumber: deliverableTotalNumber || undefined,
    bursts: burstsWithFallback,
  }
}

export function normalisePlan(inputs: NormalisePlanInputs): PlannedLineItem[] {
  const versionsByMba = new Map<string, { clientSlug: string; campaignName: string }>()
  ;(inputs.mediaPlanVersions ?? []).forEach((v) => {
    const mba = String(v?.mba_number ?? v?.mbaNumber ?? "").trim()
    if (!mba) return
    const clientSlug = slugifyClientName(v?.client_name ?? v?.clientName)
    const campaignName = String(v?.campaign_name ?? v?.campaignName ?? "").trim()
    versionsByMba.set(mba, { clientSlug, campaignName })
  })

  const mapRows = (rows: any[], channelGroup: ChannelGroup): PlannedLineItem[] => {
    return (rows ?? [])
      .map((row) => {
        const base = normaliseLineItemBase(row)
        if (!base.mbaNumber || !base.lineItemId) return null

        const versionMeta = versionsByMba.get(base.mbaNumber)
        const clientSlug = versionMeta?.clientSlug || base.clientSlug
        const campaignName = versionMeta?.campaignName || base.campaignName

        return {
          mbaNumber: base.mbaNumber,
          clientSlug,
          campaignName: campaignName || "—",
          channelGroup,
          lineItemId: base.lineItemId,
          platform: base.platform,
          buyType: base.buyType,
          totalBudgetNumber: base.totalBudgetNumber,
          ...(base.deliverableTotalNumber ? { deliverableTotalNumber: base.deliverableTotalNumber } : {}),
          bursts: base.bursts,
        } satisfies PlannedLineItem
      })
      .filter(Boolean) as PlannedLineItem[]
  }

  const items = [
    ...mapRows(inputs.mediaPlanSocial ?? [], "social"),
    ...mapRows(inputs.mediaPlanProgrammaticDisplay ?? [], "prog_display"),
    ...mapRows(inputs.mediaPlanProgrammaticVideo ?? [], "prog_video"),
  ]

  // Deduplicate by lineItemId (last one wins), but keep stable ordering by mba + lineItemId.
  const byId = new Map<string, PlannedLineItem>()
  items.forEach((item) => byId.set(item.lineItemId, item))
  return Array.from(byId.values()).sort((a, b) => {
    const mbaCmp = a.mbaNumber.localeCompare(b.mbaNumber)
    if (mbaCmp !== 0) return mbaCmp
    return a.lineItemId.localeCompare(b.lineItemId)
  })
}

function parseIsoToUtcMs(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = Date.UTC(y, mo, d, 0, 0, 0, 0)
  return Number.isFinite(dt) ? dt : null
}

function addDaysISO(iso: string, days: number): string {
  const ms = parseIsoToUtcMs(iso)
  if (ms === null) return iso
  const dt = new Date(ms)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function daysBetweenInclusiveISO(startISO: string, endISO: string): number {
  const s = parseIsoToUtcMs(startISO)
  const e = parseIsoToUtcMs(endISO)
  if (s === null || e === null) return 0
  if (e < s) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((e - s) / msPerDay) + 1
}

function clampISO(value: string, min: string, max: string): string {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function computePlannedSpendToDate(bursts: PlannedBurst[], asAtDateISO: string): number {
  const asAt = normalizeISODate(asAtDateISO)
  if (!asAt) return 0
  return (bursts ?? []).reduce((sum, b) => {
    const start = normalizeISODate(b.startDate)
    const end = normalizeISODate(b.endDate)
    if (!start || !end) return sum
    const total = Number(b.budgetNumber ?? 0)
    if (!total) return sum
    if (asAt < start) return sum

    const burstEnd = end
    const elapsedEnd = clampISO(asAt, start, burstEnd)
    const durationDays = daysBetweenInclusiveISO(start, burstEnd)
    const elapsedDays = daysBetweenInclusiveISO(start, elapsedEnd)
    if (durationDays <= 0 || elapsedDays <= 0) return sum
    const should = (total / durationDays) * elapsedDays
    return sum + Math.min(total, Math.max(0, should))
  }, 0)
}

export function computePlannedDeliverableToDate(bursts: PlannedBurst[], asAtDateISO: string): number {
  const asAt = normalizeISODate(asAtDateISO)
  if (!asAt) return 0
  return (bursts ?? []).reduce((sum, b) => {
    const start = normalizeISODate(b.startDate)
    const end = normalizeISODate(b.endDate)
    if (!start || !end) return sum
    const total = Number(b.deliverableNumber ?? 0)
    if (!total) return sum
    if (asAt < start) return sum

    const burstEnd = end
    const elapsedEnd = clampISO(asAt, start, burstEnd)
    const durationDays = daysBetweenInclusiveISO(start, burstEnd)
    const elapsedDays = daysBetweenInclusiveISO(start, elapsedEnd)
    if (durationDays <= 0 || elapsedDays <= 0) return sum
    const should = (total / durationDays) * elapsedDays
    return sum + Math.min(total, Math.max(0, should))
  }, 0)
}

export function getBurstBounds(bursts: PlannedBurst[]): { startDate: string | null; endDate: string | null } {
  const starts = (bursts ?? []).map((b) => normalizeISODate(b.startDate)).filter(Boolean) as string[]
  const ends = (bursts ?? []).map((b) => normalizeISODate(b.endDate)).filter(Boolean) as string[]
  return {
    startDate: starts.length ? starts.sort()[0] : null,
    endDate: ends.length ? ends.sort().slice(-1)[0] : null,
  }
}

export function buildLastNDaysWindow(endISO: string, days: number) {
  const end = normalizeISODate(endISO)
  if (!end) return null
  const start = addDaysISO(end, -(days - 1))
  return { startDate: start, endDate: end }
}

