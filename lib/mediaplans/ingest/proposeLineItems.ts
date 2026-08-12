/**
 * MR-3 — propose AV line items + panel children from detected shape + profile.
 * Proposal only: never writes media_plan_* tables; never mints line_item_id.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import {
  interpretGridCell,
  type BookingStatus,
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
}

export type IngestReconciliation = {
  line_item_count: number
  panel_count: number
  burst_count: number
  total_media_amount: number
  file_stated_total: number | null
}

export type IngestProposal = {
  publisher_name: string
  media_type: string
  sheet_name: string
  line_items: ProposedLineItem[]
  reconciliation: IngestReconciliation
}

type RowContext = Record<string, string>

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
      // Also alias format ← publisher_format_name when grouping key is format
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
      ? contextKeys.filter((k) => CONTEXT_CANON.has(k) || !Object.values(profile.column_map).includes(k))
      : stackFields
  const useFields = fields.length > 0 ? fields : stackFields
  if (useFields.length === 0) {
    next.group = value
    return next
  }

  // Nesting: first unset context key gets this value; if all set, replace last.
  let idx = useFields.findIndex((f) => !next[f])
  if (idx < 0) idx = useFields.length - 1
  // City/market resets (short single token after format was set): jump to market slot
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
      descriptors[canon] = raw
    } else {
      raw_unmapped[headersByCol.get(d.col) ?? `col_${d.col}`] = raw
    }
  }

  // Also capture any non-descriptor columns left of grid that had values? stick to descriptor block.

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
      current = { status, startColIdx: i, endColIdx: i, length: 1 }
      runs.push(current)
    }
  }
  return runs
}

function buildBurstsForRow(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
  row: number,
): ProposedBurst[] {
  return buildStatusRunsForRow(profile, shape, row).map((run) => {
    const startG = shape.grid_columns[run.startColIdx]!
    const endG = shape.grid_columns[run.endColIdx]!
    const isBonus =
      run.status === "bonus" || run.status === "bonus_display"
    return {
      start_date: startG.start_date,
      end_date: endG.end_date ?? endG.start_date,
      quantity:
        profile.grid_semantics === "count"
          ? (() => {
              const raw = shape.matrix[row]?.[startG.col] ?? ""
              return interpretGridCell(profile, raw).quantity ?? run.length
            })()
          : run.length,
      media_amount: isBonus ? 0 : 0, // rates unmapped on purpose — paid amount filled later
      booking_status: run.status,
    }
  })
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

/**
 * Build an ingest proposal. Does not write to any plan table.
 * Guarantees no `line_item_id` on the returned object.
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

  type Acc = {
    grouping: Record<string, string>
    panels: ProposedPanel[]
    bursts: ProposedBurst[]
  }
  const groups = new Map<string, Acc>()

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

    const { panel, descriptors } = rowToPanel(profile, shape, row, ctx)
    panel.flights = buildFlightsForRow(profile, shape, row)
    panel.grid_period_count = shape.grid_columns.length
    const keys =
      profile.grouping_keys.length > 0
        ? profile.grouping_keys
        : Object.keys(descriptors).slice(0, 2)
    const gk = groupingKeyValue(keys, descriptors)
    const grouping: Record<string, string> = {}
    for (const k of keys) {
      if (descriptors[k]) grouping[k] = descriptors[k]!
    }

    let acc = groups.get(gk)
    if (!acc) {
      acc = { grouping, panels: [], bursts: [] }
      groups.set(gk, acc)
    }
    acc.panels.push(panel)

    // Bursts: merge per line item — union runs from each panel's grid.
    // For OOH large-format (1 panel : 1 line often still grouped), take bursts
    // from each panel and append (same periods may duplicate — prefer first panel's
    // non-empty runs, then add unique). Simplest correct rule: if one panel per
    // group typically many panels share the same flight; use MAX presence per
    // period across panels for status, SUM for count.
    const rowBursts = buildBurstsForRow(profile, shape, row)
    if (profile.grid_semantics === "count") {
      // Sum quantities into existing period buckets
      for (const b of rowBursts) {
        const existing = acc.bursts.find(
          (x) =>
            x.start_date === b.start_date &&
            x.end_date === b.end_date &&
            x.booking_status === b.booking_status,
        )
        if (existing) existing.quantity += b.quantity
        else acc.bursts.push({ ...b })
      }
    } else {
      // status_matrix: keep per-panel runs as separate bursts on the line
      // (flight may differ by panel). Append all.
      for (const b of rowBursts) acc.bursts.push({ ...b })
    }
  }

  const line_items: ProposedLineItem[] = [...groups.values()].map((g) => ({
    grouping: g.grouping,
    panels: g.panels,
    bursts: g.bursts,
  }))

  const panel_count = line_items.reduce((n, li) => n + li.panels.length, 0)
  const burst_count = line_items.reduce((n, li) => n + li.bursts.length, 0)
  const total_media_amount = line_items.reduce(
    (n, li) => n + li.bursts.reduce((m, b) => m + b.media_amount, 0),
    0,
  )

  const proposal: IngestProposal = {
    publisher_name: profile.publisher_name,
    media_type: profile.media_type,
    sheet_name: shape.sheet_name,
    line_items,
    reconciliation: {
      line_item_count: line_items.length,
      panel_count,
      burst_count,
      total_media_amount,
      file_stated_total: shape.file_stated_total,
    },
  }

  // Hard guarantee: never mint / carry line_item_id
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
