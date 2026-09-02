/**
 * MR-3 — propose AV line items + panel children from detected shape + profile.
 * Proposal only: never writes media_plan_* tables; never mints line_item_id.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import {
  DERIVED_WARNING_PCT,
  evaluateReconciliationGate,
  isMoneyTarget,
  parseMoneyCell,
} from "@/lib/mediaplans/ingest/moneyTargets"
import {
  interpretGridCell,
  isReferenceIgnoreTarget,
  type BookingStatus,
  type GridSemantics,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export type ProposedBurst = {
  start_date: string | null
  end_date: string | null
  quantity: number
  /** Always 0 for bonus / bonus_display. */
  media_amount: number
  booking_status: BookingStatus
}

/** Per-panel period presence — mirrors burst letter runs; no money. */
export type ProposedPanelFlight = {
  period_start: string
  period_end: string
  /** Contiguous grid columns in this run (for "live N of M"). */
  period_count: number
  is_live: boolean
  is_bonus: boolean
}

export type ProposedPanel = {
  descriptors: Record<string, string>
  raw_unmapped: Record<string, string>
  source_publisher: string
  source_row_ref: string
  flights: ProposedPanelFlight[]
  /** Denominator for flight summary — sheet grid width at propose time. */
  grid_period_count: number
}

export type ProposedLineItem = {
  grouping: Record<string, string>
  panels: ProposedPanel[]
  bursts: ProposedBurst[]
  /**
   * Publisher per-unit bought rate for the row (`media_rate:bought`).
   * `null` / omitted = unmapped; `0` = mapped zero. Display/rate only —
   * never a line total.
   */
  bought_rate?: number | null
  /** One-off charges seen on source rows — not imported into media. */
  charges_detected?: {
    production: number
    installation: number
  }
}

export type IngestReconciliation = {
  line_item_count: number
  panel_count: number
  burst_count: number
  total_media_amount: number
  file_stated_total: number | null
  /** Absolute |computed − stated|; null when no stated total. */
  delta: number | null
  /** Relative delta; null when no stated total. */
  delta_pct: number | null
  /** True when Accept is allowed (file-total gate). */
  accept_ok: boolean
  /** Human reason when Accept is blocked. */
  block_reason: string | null
  /** Non-blocking warnings (derived vs stated, charges not imported, …). */
  warnings: string[]
  /** Σ production + installation seen; never silently dropped. */
  charges_detected_total: number
}

export type IngestProposal = {
  publisher_name: string
  media_type: string
  sheet_name: string
  /** Profile grid semantics — stamp uses this, never infers from media type. */
  grid_semantics?: GridSemantics
  line_items: ProposedLineItem[]
  reconciliation: IngestReconciliation
}

type RowContext = Record<string, string>

type RowMoney = {
  stated: number | null
  weeklyRate: number | null
  lunarRate: number | null
  boughtRate: number | null
  production: number | null
  installation: number | null
}

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

function buildHeaderLookup(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
): {
  mapped: Map<number, string>
  headersByCol: Map<number, string>
} {
  const byHeader = new Map<string, string>()
  for (const [pub, canon] of Object.entries(profile.column_map)) {
    byHeader.set(headerKey(pub), canon)
  }
  const mapped = new Map<number, string>()
  const headersByCol = new Map<number, string>()
  for (const d of shape.descriptor_columns) {
    headersByCol.set(d.col, d.header)
    const canon = byHeader.get(headerKey(d.header))
    if (canon) mapped.set(d.col, canon)
  }
  return { mapped, headersByCol }
}

function readRowMoney(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
): RowMoney {
  const { mapped } = buildHeaderLookup(profile, shape)
  const out: RowMoney = {
    stated: null,
    weeklyRate: null,
    lunarRate: null,
    boughtRate: null,
    production: null,
    installation: null,
  }
  for (const d of shape.descriptor_columns) {
    const canon = mapped.get(d.col)
    if (!canon || !isMoneyTarget(canon)) continue
    const n = parseMoneyCell(shape.matrix[row]?.[d.col] ?? "")
    if (n == null) continue
    if (canon === "media_amount:stated") out.stated = n
    else if (canon === "media_rate:weekly") out.weeklyRate = n
    else if (canon === "media_rate:lunar") out.lunarRate = n
    else if (canon === "media_rate:bought") out.boughtRate = n
    else if (canon === "charge:production") out.production = n
    else if (canon === "charge:installation") out.installation = n
  }
  return out
}

function countPaidWeeks(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
): number {
  let n = 0
  for (const g of shape.grid_columns) {
    const raw = shape.matrix[row]?.[g.col] ?? ""
    const it = interpretGridCell(profile, raw)
    if (profile.grid_semantics === "count") {
      if (it.quantity != null && it.quantity > 0) n++
    } else if (it.booking_status === "paid") {
      n++
    }
  }
  return n
}

/**
 * Stated line total is not derived here. Rate × period:
 * weekly → lunar/4 → bought last, and only when the profile declares
 * the bought-rate period. An unknown-period rate is display-only.
 */
function derivedMediaForRow(
  money: RowMoney,
  paidWeeks: number,
  boughtRatePeriod?: "weekly" | "lunar" | null,
): number | null {
  if (paidWeeks <= 0) return null
  if (money.weeklyRate != null) return money.weeklyRate * paidWeeks
  if (money.lunarRate != null) return (money.lunarRate / 4) * paidWeeks
  if (money.boughtRate != null && boughtRatePeriod === "weekly") {
    return money.boughtRate * paidWeeks
  }
  if (money.boughtRate != null && boughtRatePeriod === "lunar") {
    return (money.boughtRate / 4) * paidWeeks
  }
  return null
}

/**
 * Carry grouping-row context down. Grouping rows never write into identity
 * column_map fields (site_number, panel_name, …) — only into grouping_keys
 * that are context fields, or state/format/market/geography when the cell
 * lands in a column mapped to those.
 */
function applyGroupingRow(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
  ctx: RowContext,
  stackFields: string[],
): RowContext {
  const next = { ...ctx }
  const vals: string[] = []
  const populated: { col: number; text: string }[] = []
  for (const d of shape.descriptor_columns) {
    const t = shape.matrix[row]?.[d.col] ?? ""
    if (t) {
      vals.push(t)
      populated.push({ col: d.col, text: t })
    }
  }
  const value = vals[0] ?? ""
  if (!value) return next

  const CONTEXT_CANON = new Set([
    "state",
    "format",
    "market",
    "geography",
    "publisher_format_name",
    "station",
    "network",
  ])

  const { mapped } = buildHeaderLookup(profile, shape)
  for (const p of populated) {
    const canon = mapped.get(p.col)
    if (canon && CONTEXT_CANON.has(canon)) {
      next[canon] = p.text
      if (canon === "publisher_format_name" && !next.format) {
        next.format = p.text
      }
      if (canon === "geography" && !next.market) next.market = p.text
      if (canon === "state" && !next.market) next.market = p.text
      return next
    }
  }

  const contextKeys = profile.grouping_keys.filter(
    (k) => !Object.values(profile.column_map).includes(k) || CONTEXT_CANON.has(k),
  )
  const fields =
    contextKeys.length > 0
      ? contextKeys.filter(
          (k) =>
            CONTEXT_CANON.has(k) || !Object.values(profile.column_map).includes(k),
        )
      : stackFields
  const useFields = fields.length > 0 ? fields : stackFields
  if (useFields.length === 0) {
    next.group = value
    return next
  }

  let idx = useFields.findIndex((f) => !next[f])
  if (idx < 0) idx = useFields.length - 1
  if (
    useFields.includes("market") &&
    next.format &&
    populated.length === 1 &&
    value.length < 40 &&
    !/digital|format|large/i.test(value)
  ) {
    idx = useFields.indexOf("market")
  }
  next[useFields[idx]!] = value
  for (let i = idx + 1; i < useFields.length; i++) delete next[useFields[i]!]
  return next
}

function rowToPanel(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
  ctx: RowContext,
): { panel: ProposedPanel; descriptors: Record<string, string> } {
  const { mapped, headersByCol } = buildHeaderLookup(profile, shape)
  const descriptors: Record<string, string> = { ...ctx }
  const raw_unmapped: Record<string, string> = {}

  for (const d of shape.descriptor_columns) {
    const raw = shape.matrix[row]?.[d.col] ?? ""
    if (!raw) continue
    const canon = mapped.get(d.col)
    if (canon) {
      // Money and reference:ignore never land on panels (schema / ignore rule).
      if (isMoneyTarget(canon) || isReferenceIgnoreTarget(canon)) continue
      descriptors[canon] = raw
    } else {
      raw_unmapped[headersByCol.get(d.col) ?? `col_${d.col}`] = raw
    }
  }

  const panel: ProposedPanel = {
    descriptors: { ...descriptors },
    raw_unmapped,
    source_publisher: profile.publisher_name,
    source_row_ref: `${shape.sheet_name}!r${row}`,
    flights: [],
    grid_period_count: shape.grid_columns.length,
  }
  return { panel, descriptors }
}

type StatusRun = {
  status: BookingStatus
  startColIdx: number
  endColIdx: number
  length: number
  quantitySum: number
}

/**
 * Contiguous paid/bonus letter runs (and count cells). Dark letters / blank
 * break the run and never produce a flight — same as bursts.
 */
function buildStatusRunsForRow(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
): StatusRun[] {
  if (shape.grid_columns.length === 0) return []

  if (profile.grid_semantics === "count") {
    const runs: StatusRun[] = []
    for (let i = 0; i < shape.grid_columns.length; i++) {
      const g = shape.grid_columns[i]!
      const raw = shape.matrix[row]?.[g.col] ?? ""
      const interpreted = interpretGridCell(profile, raw)
      if (interpreted.quantity == null || interpreted.quantity <= 0) continue
      runs.push({
        status: "paid",
        startColIdx: i,
        endColIdx: i,
        length: 1,
        quantitySum: interpreted.quantity,
      })
    }
    return runs
  }

  const runs: StatusRun[] = []
  let current: StatusRun | null = null

  for (let i = 0; i < shape.grid_columns.length; i++) {
    const g = shape.grid_columns[i]!
    const raw = shape.matrix[row]?.[g.col] ?? ""
    if (!raw) {
      current = null
      continue
    }
    const interpreted = interpretGridCell(profile, raw)
    if (
      interpreted.booking_status === "unavailable" ||
      interpreted.booking_status === "unmapped"
    ) {
      current = null
      continue
    }
    const status = interpreted.booking_status
    if (
      current &&
      current.status === status &&
      current.endColIdx === i - 1
    ) {
      current.endColIdx = i
      current.length++
    } else {
      current = {
        status,
        startColIdx: i,
        endColIdx: i,
        length: 1,
        quantitySum: 0,
      }
      runs.push(current)
    }
  }
  return runs
}

function allocateMediaToBursts(
  runs: StatusRun[],
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  authoritativeMedia: number,
): ProposedBurst[] {
  const paidRuns = runs.filter((r) => r.status === "paid")
  const weightTotal =
    profile.grid_semantics === "count"
      ? paidRuns.reduce((s, r) => s + r.quantitySum, 0)
      : paidRuns.reduce((s, r) => s + r.length, 0)

  let allocated = 0
  const out: ProposedBurst[] = []
  let paidIndex = 0

  for (const run of runs) {
    const startG = shape.grid_columns[run.startColIdx]!
    const endG = shape.grid_columns[run.endColIdx]!
    const isBonus =
      run.status === "bonus" || run.status === "bonus_display"
    let media_amount = 0
    if (
      !isBonus &&
      run.status === "paid" &&
      authoritativeMedia > 0 &&
      weightTotal > 0
    ) {
      paidIndex++
      const weight =
        profile.grid_semantics === "count" ? run.quantitySum : run.length
      if (paidIndex === paidRuns.length) {
        media_amount = Math.round((authoritativeMedia - allocated) * 100) / 100
      } else {
        media_amount =
          Math.round(((authoritativeMedia * weight) / weightTotal) * 100) / 100
        allocated += media_amount
      }
    }
    out.push({
      start_date: startG.start_date,
      end_date: endG.end_date ?? endG.start_date,
      quantity:
        profile.grid_semantics === "count" ? run.quantitySum : run.length,
      media_amount,
      booking_status: run.status,
    })
  }
  return out
}

function buildBurstsForRow(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
  money: RowMoney = {
    stated: null,
    weeklyRate: null,
    lunarRate: null,
    boughtRate: null,
    production: null,
    installation: null,
  },
  warnings: string[] = [],
): ProposedBurst[] {
  const runs = buildStatusRunsForRow(profile, shape, row)
  const paidWeeks = countPaidWeeks(profile, shape, row)
  const derived = derivedMediaForRow(money, paidWeeks)

  // Stated line total wins when present; otherwise derived rate×period.
  let authoritative = 0
  if (money.stated != null && money.stated > 0 && paidWeeks > 0) {
    authoritative = money.stated
    if (
      derived != null &&
      derived > 0 &&
      Math.abs(derived - money.stated) / money.stated > DERIVED_WARNING_PCT
    ) {
      const pct =
        (Math.abs(derived - money.stated) / money.stated) * 100
      warnings.push(
        `${shape.sheet_name}!r${row}: derived $${derived.toFixed(2)} diverges from stated $${money.stated.toFixed(2)} by ${pct.toFixed(1)}% (cross-check only)`,
      )
    }
  } else if (derived != null && derived > 0) {
    authoritative = derived
  }

  return allocateMediaToBursts(runs, profile, shape, authoritative)
}

/** Flights require resolved period dates (MR-7); unresolved runs are skipped. */
function buildFlightsForRow(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
): ProposedPanelFlight[] {
  const out: ProposedPanelFlight[] = []
  for (const run of buildStatusRunsForRow(profile, shape, row)) {
    const startG = shape.grid_columns[run.startColIdx]!
    const endG = shape.grid_columns[run.endColIdx]!
    const period_start = startG.start_date
    const period_end = endG.end_date ?? endG.start_date
    if (!period_start || !period_end) continue
    const isBonus =
      run.status === "bonus" || run.status === "bonus_display"
    out.push({
      period_start,
      period_end,
      period_count: run.length,
      is_live: true,
      is_bonus: isBonus,
    })
  }
  return out
}

function groupingKeyValue(
  keys: string[],
  descriptors: Record<string, string>,
): string {
  return keys.map((k) => descriptors[k] ?? "").join("||")
}

type Acc = {
  grouping: Record<string, string>
  panels: ProposedPanel[]
  bursts: ProposedBurst[]
  production: number
  installation: number
  bought_rate: number | null
}

function groupingFromDescriptors(
  keys: string[],
  descriptors: Record<string, string>,
): Record<string, string> {
  const grouping: Record<string, string> = {}
  for (const k of keys) {
    if (descriptors[k]) grouping[k] = descriptors[k]!
  }
  return grouping
}

function rowIdentityGrouping(
  descriptors: Record<string, string>,
): Record<string, string> {
  const grouping: Record<string, string> = {}
  for (const [k, v] of Object.entries(descriptors)) {
    if (v) grouping[k] = v
  }
  return grouping
}

function mergeCountBursts(acc: Acc, rowBursts: ProposedBurst[]): void {
  for (const b of rowBursts) {
    const existing = acc.bursts.find(
      (x) =>
        x.start_date === b.start_date &&
        x.end_date === b.end_date &&
        x.booking_status === b.booking_status,
    )
    if (existing) {
      existing.quantity += b.quantity
      existing.media_amount =
        Math.round((existing.media_amount + b.media_amount) * 100) / 100
    } else {
      acc.bursts.push({ ...b })
    }
  }
}

function accToLineItem(g: Acc): ProposedLineItem {
  const item: ProposedLineItem = {
    grouping: g.grouping,
    panels: g.panels,
    bursts: g.bursts,
  }
  if (g.bought_rate != null) item.bought_rate = g.bought_rate
  if (g.production > 0 || g.installation > 0) {
    item.charges_detected = {
      production: g.production,
      installation: g.installation,
    }
  }
  return item
}

/**
 * Build an ingest proposal. Does not write to any plan table.
 * Guarantees no `line_item_id` on the returned object.
 *
 * Default `per_row`: each classified buy row is one line. `grouped` retains
 * the grouping_keys collapse for a future publisher whose file is not
 * row-per-buy.
 */
export function proposeLineItemsFromSheet(
  shape: DetectedSheetShape,
  profile: PublisherProfileConfig,
): IngestProposal {
  const stackFields =
    profile.media_type === "radio"
      ? ["market", "network", "station"]
      : ["format", "market"]

  let ctx: RowContext = {}
  const groupingSet = new Set(shape.grouping_rows)
  const warnings: string[] = []
  let statedPaidSum = 0
  let charges_detected_total = 0
  const grouped = profile.line_granularity === "grouped"
  const groups = new Map<string, Acc>()
  const perRow: Acc[] = []

  const rowOrder = [
    ...new Set(
      [...shape.grouping_rows, ...shape.data_rows].sort((a, b) => a - b),
    ),
  ]

  for (const row of rowOrder) {
    if (groupingSet.has(row)) {
      ctx = applyGroupingRow(profile, shape, row, ctx, stackFields)
      continue
    }
    if (!shape.data_rows.includes(row)) continue

    const money = readRowMoney(profile, shape, row)
    const { panel, descriptors } = rowToPanel(profile, shape, row, ctx)
    panel.flights = buildFlightsForRow(profile, shape, row)
    panel.grid_period_count = shape.grid_columns.length
    const keys =
      profile.grouping_keys.length > 0
        ? profile.grouping_keys
        : Object.keys(descriptors).slice(0, 2)
    const grouping = grouped
      ? groupingFromDescriptors(keys, descriptors)
      : rowIdentityGrouping(descriptors)

    const rowAcc: Acc = {
      grouping,
      panels: [panel],
      bursts: [],
      production: 0,
      installation: 0,
      bought_rate: money.boughtRate,
    }

    if (money.production != null && money.production > 0) {
      rowAcc.production += money.production
      charges_detected_total += money.production
    }
    if (money.installation != null && money.installation > 0) {
      rowAcc.installation += money.installation
      charges_detected_total += money.installation
    }

    const paidWeeks = countPaidWeeks(profile, shape, row)
    if (money.stated != null && money.stated > 0 && paidWeeks > 0) {
      statedPaidSum += money.stated
    }

    const rowBursts = buildBurstsForRow(profile, shape, row, money, warnings)
    rowAcc.bursts = rowBursts.map((b) => ({ ...b }))

    if (!grouped) {
      perRow.push(rowAcc)
      continue
    }

    const gk = groupingKeyValue(keys, descriptors)
    let acc = groups.get(gk)
    if (!acc) {
      acc = {
        grouping,
        panels: [],
        bursts: [],
        production: 0,
        installation: 0,
        bought_rate: null,
      }
      groups.set(gk, acc)
    }
    acc.panels.push(panel)
    acc.production += rowAcc.production
    acc.installation += rowAcc.installation
    if (acc.bought_rate == null && rowAcc.bought_rate != null) {
      acc.bought_rate = rowAcc.bought_rate
    }
    if (profile.grid_semantics === "count") {
      mergeCountBursts(acc, rowBursts)
    } else {
      for (const b of rowBursts) acc.bursts.push({ ...b })
    }
  }

  const line_items: ProposedLineItem[] = grouped
    ? [...groups.values()].map(accToLineItem)
    : perRow.map(accToLineItem)

  const panel_count = line_items.reduce((n, li) => n + li.panels.length, 0)
  const burst_count = line_items.reduce((n, li) => n + li.bursts.length, 0)
  const total_media_amount =
    Math.round(
      line_items.reduce(
        (n, li) => n + li.bursts.reduce((m, b) => m + b.media_amount, 0),
        0,
      ) * 100,
    ) / 100

  // Stated line Σ is the Accept gate target when the file carries line totals
  // (SCA Client Total, JCD MEDIA VALUE). Otherwise fall back to scrape.
  const file_stated_total =
    statedPaidSum > 0 ? statedPaidSum : shape.file_stated_total

  if (charges_detected_total > 0) {
    warnings.push(
      `Charges detected, not imported: $${charges_detected_total.toFixed(2)} (production/installation)`,
    )
  }

  const gate = evaluateReconciliationGate({
    total_media_amount,
    file_stated_total,
  })

  const proposal: IngestProposal = {
    publisher_name: profile.publisher_name,
    media_type: profile.media_type,
    sheet_name: shape.sheet_name,
    grid_semantics: profile.grid_semantics,
    line_items,
    reconciliation: {
      line_item_count: line_items.length,
      panel_count,
      burst_count,
      total_media_amount,
      file_stated_total,
      delta: gate.delta,
      delta_pct: gate.delta_pct,
      accept_ok: gate.ok,
      block_reason: gate.reason,
      warnings,
      charges_detected_total,
    },
  }

  assertNoLineItemId(proposal)
  return proposal
}

function assertNoLineItemId(value: unknown, path = "proposal"): void {
  if (value == null) return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoLineItemId(v, `${path}[${i}]`))
    return
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "line_item_id") {
        throw new Error(`line_item_id must not appear on proposal (${path})`)
      }
      assertNoLineItemId(v, `${path}.${k}`)
    }
  }
}

/** Test helper: build bursts from an explicit cell list + grid column dates. */
export function buildBurstsFromCellsForTest(
  profile: PublisherProfileConfig,
  cells: string[],
  periods: { start_date: string; end_date: string }[],
): ProposedBurst[] {
  return shapeFromCellsForTest(profile, cells, periods).bursts
}

/** Test helper: build panel flights from the same cell list as bursts. */
export function buildFlightsFromCellsForTest(
  profile: PublisherProfileConfig,
  cells: string[],
  periods: { start_date: string; end_date: string }[],
): ProposedPanelFlight[] {
  return shapeFromCellsForTest(profile, cells, periods).flights
}

function shapeFromCellsForTest(
  profile: PublisherProfileConfig,
  cells: string[],
  periods: { start_date: string; end_date: string }[],
): { bursts: ProposedBurst[]; flights: ProposedPanelFlight[] } {
  const row: string[] = []
  cells.forEach((c, i) => {
    row[i + 1] = c
  })
  const shape: DetectedSheetShape = {
    sheet_name: "test",
    header_row: 1,
    header_confidence: 1,
    descriptor_columns: [],
    descriptor_confidence: 1,
    grid_columns: periods.map((p, i) => ({
      col: i + 1,
      header: p.start_date,
      start_date: p.start_date,
      end_date: p.end_date,
      confidence: 1,
    })),
    grid_confidence: 1,
    grouping_rows: [],
    data_rows: [2],
    matrix: [[], [], row],
    file_stated_total: null,
    line_item_sheet_confidence: 1,
  }
  return {
    bursts: buildBurstsForRow(profile, shape, 2),
    flights: buildFlightsForRow(profile, shape, 2),
  }
}
