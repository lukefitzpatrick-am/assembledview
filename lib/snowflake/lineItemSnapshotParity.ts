import type { XanoLineItem } from "@/lib/xano/fetchAllLineItems"

export type LineItemSnapshotSource = "xano" | "parity" | "postgres"

export function normaliseLineItemSnapshotSource(
  raw: string | undefined | null
): LineItemSnapshotSource {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "parity" || v === "dual") return "parity"
  if (v === "postgres" || v === "pg") return "postgres"
  return "xano"
}

/** Prefer `budget`, else media+fee, else total/gross — same rules both sides. */
export function spendFromBurstsJson(bursts: unknown[]): number {
  let sum = 0
  for (const raw of bursts) {
    if (!raw || typeof raw !== "object") continue
    const b = raw as Record<string, unknown>
    const budget = coerceMoney(b.budget)
    if (budget != null) {
      sum += budget
      continue
    }
    const media = coerceMoney(b.media) ?? 0
    const fee = coerceMoney(b.fee) ?? 0
    if (media !== 0 || fee !== 0) {
      sum += media + fee
      continue
    }
    const total = coerceMoney(b.total) ?? coerceMoney(b.gross)
    if (total != null) sum += total
  }
  return sum
}

function coerceMoney(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function dedupeByLineItemId(items: XanoLineItem[]): XanoLineItem[] {
  const byId = new Map<string, XanoLineItem>()
  for (const item of items) {
    const existing = byId.get(item.line_item_id)
    if (!existing) {
      byId.set(item.line_item_id, item)
      continue
    }
    const existingTime = existing.xano_created_at || 0
    const itemTime = item.xano_created_at || 0
    if (
      itemTime > existingTime ||
      (itemTime === existingTime && item.xano_row_id > existing.xano_row_id)
    ) {
      byId.set(item.line_item_id, item)
    }
  }
  return Array.from(byId.values())
}

export type MbaParityRow = {
  mba_number: string
  xano_rows: number
  pg_rows: number
  row_delta: number
  xano_spend: number
  pg_spend: number
  spend_delta: number
}

export type LineItemSnapshotParityReport = {
  xano_raw: number
  pg_raw: number
  xano_deduped: number
  pg_deduped: number
  xano_complete: boolean
  pg_complete: boolean
  mba_count_xano: number
  mba_count_pg: number
  mba_mismatches: number
  row_delta_abs_sum: number
  spend_delta_abs_sum: number
  mismatched: MbaParityRow[]
  sample: MbaParityRow[]
}

const SPEND_EPS = 0.005

export function buildLineItemSnapshotParityReport(
  xanoItems: XanoLineItem[],
  pgItems: XanoLineItem[],
  opts?: { xanoComplete?: boolean; pgComplete?: boolean; sampleSize?: number }
): LineItemSnapshotParityReport {
  const xano = dedupeByLineItemId(xanoItems)
  const pg = dedupeByLineItemId(pgItems)

  type Agg = { rows: number; spend: number }
  const xanoByMba = new Map<string, Agg>()
  const pgByMba = new Map<string, Agg>()

  const bump = (map: Map<string, Agg>, mba: string, spend: number) => {
    const key = mba.trim() || "(blank)"
    const cur = map.get(key) ?? { rows: 0, spend: 0 }
    cur.rows += 1
    cur.spend += spend
    map.set(key, cur)
  }

  for (const item of xano) {
    bump(xanoByMba, item.mba_number, spendFromBurstsJson(item.bursts_json))
  }
  for (const item of pg) {
    bump(pgByMba, item.mba_number, spendFromBurstsJson(item.bursts_json))
  }

  const mbas = new Set([...xanoByMba.keys(), ...pgByMba.keys()])
  const rows: MbaParityRow[] = []
  for (const mba of mbas) {
    const x = xanoByMba.get(mba) ?? { rows: 0, spend: 0 }
    const p = pgByMba.get(mba) ?? { rows: 0, spend: 0 }
    rows.push({
      mba_number: mba,
      xano_rows: x.rows,
      pg_rows: p.rows,
      row_delta: p.rows - x.rows,
      xano_spend: round2(x.spend),
      pg_spend: round2(p.spend),
      spend_delta: round2(p.spend - x.spend),
    })
  }

  rows.sort((a, b) => {
    const spendAbs = Math.abs(b.spend_delta) - Math.abs(a.spend_delta)
    if (spendAbs !== 0) return spendAbs
    return Math.abs(b.row_delta) - Math.abs(a.row_delta)
  })

  const mismatched = rows.filter(
    (r) => r.row_delta !== 0 || Math.abs(r.spend_delta) > SPEND_EPS
  )
  const sampleSize = opts?.sampleSize ?? 25

  return {
    xano_raw: xanoItems.length,
    pg_raw: pgItems.length,
    xano_deduped: xano.length,
    pg_deduped: pg.length,
    xano_complete: opts?.xanoComplete ?? true,
    pg_complete: opts?.pgComplete ?? true,
    mba_count_xano: xanoByMba.size,
    mba_count_pg: pgByMba.size,
    mba_mismatches: mismatched.length,
    row_delta_abs_sum: mismatched.reduce((s, r) => s + Math.abs(r.row_delta), 0),
    spend_delta_abs_sum: round2(
      mismatched.reduce((s, r) => s + Math.abs(r.spend_delta), 0)
    ),
    mismatched,
    sample: rows.slice(0, sampleSize),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
