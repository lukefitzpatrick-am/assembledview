/**
 * Profile money_rules — line media basis, stated-cell gate, section
 * subtotals, rate-card info. Never a TypeScript per-publisher branch.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import {
  parseMoneyCell,
  RECONCILIATION_BLOCK_PCT,
} from "@/lib/mediaplans/ingest/moneyTargets"
import type {
  MediaAmountBasis,
  MoneyRules,
  PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export type FileStatedSource = "stated_cell" | "column_sum_fallback" | "scrape"

export type SectionReconciliation = {
  row: number
  file: number
  computed: number
  delta: number
  delta_pct: number
  ok: boolean
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

function normalizeLabel(s: string): string {
  return headerKey(s).replace(/:+$/, "")
}

export function inferMediaAmountBasis(
  profile: PublisherProfileConfig,
): MediaAmountBasis | null {
  const declared = profile.money_rules.media_amount_basis
  if (declared) return declared
  const targets = new Set(Object.values(profile.column_map))
  if (targets.has("media_rate:weekly")) return "weekly_rate"
  if (targets.has("media_amount:stated") || targets.has("media_rate:bought")) {
    return "line_total"
  }
  if (targets.has("media_rate:lunar")) return "lunar_rate"
  return null
}

export function columnIndexForHeader(
  shape: DetectedSheetShape,
  header: string,
): number | null {
  const want = headerKey(header)
  const hit = shape.descriptor_columns.find(
    (d) => headerKey(d.header) === want,
  )
  return hit ? hit.col : null
}

function cellMatchesLabel(raw: string, label: string): boolean {
  const a = normalizeLabel(raw)
  const b = normalizeLabel(label)
  return a.length > 0 && a === b
}

/**
 * Find a labelled money cell. Prefer `column` on the same row when set.
 * Never sums a column.
 */
export function findLabeledMoneyCell(
  matrix: string[][],
  label: string,
  preferredCol: number | null,
): { row: number; value: number } | null {
  if (!label.trim()) return null
  let best: { row: number; value: number } | null = null
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    for (let c = 1; c < row.length; c++) {
      if (!cellMatchesLabel(row[c] ?? "", label)) continue
      if (preferredCol != null) {
        const n = parseMoneyCell(row[preferredCol] ?? "")
        if (n != null) return { row: r, value: n }
      }
      for (let k = c + 1; k < row.length; k++) {
        const n = parseMoneyCell(row[k] ?? "")
        if (n != null && n > 0) {
          if (best == null || n > best.value) best = { row: r, value: n }
          break
        }
      }
    }
  }
  return best
}

export function findSectionSubtotalRows(
  matrix: string[][],
  sectionLabel: string,
  statedLabel: string | null,
  preferredCol: number | null,
): { row: number; value: number }[] {
  const out: { row: number; value: number }[] = []
  const statedNorm = statedLabel ? normalizeLabel(statedLabel) : null
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    let hasSection = false
    let hasStated = false
    for (let c = 1; c < row.length; c++) {
      const t = row[c] ?? ""
      if (cellMatchesLabel(t, sectionLabel)) hasSection = true
      if (statedNorm && normalizeLabel(t) === statedNorm) hasStated = true
    }
    if (!hasSection || hasStated) continue
    if (preferredCol != null) {
      const n = parseMoneyCell(row[preferredCol] ?? "")
      if (n != null && n > 0) out.push({ row: r, value: n })
    }
  }
  return out
}

export type RowMoneyInput = {
  stated: number | null
  weeklyRate: number | null
  lunarRate: number | null
  boughtRate: number | null
}

/**
 * Line media for one buy row. Bonus/STA weeks are never multipliers.
 * `line_total` uses the bought/stated cell once; weekly/lunar multiply by
 * PAID weeks only.
 */
export function lineMediaForRow(
  money: RowMoneyInput,
  paidWeeks: number,
  profile: PublisherProfileConfig,
  lineColumnValue: number | null,
): number | null {
  const basis = inferMediaAmountBasis(profile)
  if (basis === "line_total") {
    const v =
      lineColumnValue ??
      money.boughtRate ??
      (profile.money_rules.rate_card ? null : money.stated)
    if (v == null || !(v > 0)) return null
    return roundCents(v)
  }
  if (paidWeeks <= 0) return null
  if (basis === "weekly_rate" && money.weeklyRate != null) {
    return roundCents(money.weeklyRate * paidWeeks)
  }
  if (basis === "lunar_rate" && money.lunarRate != null) {
    return roundCents((money.lunarRate / 4) * paidWeeks)
  }
  if (basis == null) {
    if (money.stated != null && money.stated > 0 && paidWeeks > 0) {
      return roundCents(money.stated)
    }
    if (money.weeklyRate != null) {
      return roundCents(money.weeklyRate * paidWeeks)
    }
    if (money.lunarRate != null) {
      return roundCents((money.lunarRate / 4) * paidWeeks)
    }
  }
  return null
}

export function resolveFileStatedTotal(args: {
  profile: PublisherProfileConfig
  shape: DetectedSheetShape
  lineColumnSum: number
}): {
  file_stated_total: number | null
  file_stated_source: FileStatedSource | null
  warning: string | null
} {
  const rules: MoneyRules = args.profile.money_rules
  const stated = rules.stated_total
  const preferredCol = stated?.column
    ? columnIndexForHeader(args.shape, stated.column)
    : null
  if (stated?.label) {
    const hit = findLabeledMoneyCell(
      args.shape.matrix,
      stated.label,
      preferredCol,
    )
    if (hit) {
      return {
        file_stated_total: roundCents(hit.value),
        file_stated_source: "stated_cell",
        warning: null,
      }
    }
  }
  const scrape = args.shape.file_stated_total
  const basis = inferMediaAmountBasis(args.profile)
  if (basis === "line_total" && args.lineColumnSum > 0) {
    const warning = stated?.label
      ? `Stated-total label "${stated.label}" was not found; gate fell back to summing ${stated.column ?? "the line-total column"} — not silent.`
      : `No stated-total cell on this profile; gate fell back to summing the line-total column — not silent.`
    return {
      file_stated_total: roundCents(args.lineColumnSum),
      file_stated_source: "column_sum_fallback",
      warning,
    }
  }
  if (scrape != null && scrape > 0) {
    return {
      file_stated_total: roundCents(scrape),
      file_stated_source: "scrape",
      warning: null,
    }
  }
  return {
    file_stated_total: null,
    file_stated_source: null,
    warning: stated?.label
      ? `Stated-total label "${stated.label}" was not found and no column sum was available.`
      : "No stated-total cell found.",
  }
}

export function reconcileSections(args: {
  profile: PublisherProfileConfig
  shape: DetectedSheetShape
  lineItems: { sourceRow: number; media: number }[]
}): {
  sections: SectionReconciliation[]
  ok: boolean
  reason: string | null
} {
  const label = args.profile.money_rules.section_subtotal?.label
  if (!label) return { sections: [], ok: true, reason: null }
  const colName = args.profile.money_rules.stated_total?.column
  const preferredCol = colName
    ? columnIndexForHeader(args.shape, colName)
    : null
  const rows = findSectionSubtotalRows(
    args.shape.matrix,
    label,
    args.profile.money_rules.stated_total?.label ?? null,
    preferredCol,
  )
  if (rows.length === 0) {
    return {
      sections: [],
      ok: true,
      reason: null,
    }
  }
  const sections: SectionReconciliation[] = []
  for (let i = 0; i < rows.length; i++) {
    const endRow = rows[i]!.row
    const startRow = i === 0 ? 0 : rows[i - 1]!.row
    const computed = roundCents(
      args.lineItems
        .filter((l) => l.sourceRow > startRow && l.sourceRow < endRow)
        .reduce((s, l) => s + l.media, 0),
    )
    const file = roundCents(rows[i]!.value)
    const delta = Math.abs(computed - file)
    const delta_pct = file > 0 ? delta / file : 0
    sections.push({
      row: endRow,
      file,
      computed,
      delta,
      delta_pct,
      ok: delta_pct <= RECONCILIATION_BLOCK_PCT,
    })
  }
  const bad = sections.find((s) => !s.ok)
  return {
    sections,
    ok: !bad,
    reason: bad
      ? `Section subtotal at row ${bad.row}: computed $${bad.computed.toFixed(2)} vs file $${bad.file.toFixed(2)}`
      : null,
  }
}

export function sumRateCardColumn(
  shape: DetectedSheetShape,
  columnHeader: string,
  buyRows: number[],
): number {
  const col = columnIndexForHeader(shape, columnHeader)
  if (col == null) return 0
  let sum = 0
  for (const row of buyRows) {
    const n = parseMoneyCell(shape.matrix[row]?.[col] ?? "")
    if (n != null && n > 0) sum += n
  }
  return roundCents(sum)
}
