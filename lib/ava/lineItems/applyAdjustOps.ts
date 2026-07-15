/**
 * Deterministic descriptor-field ops for AVA adjust_line_items.
 * Never mutates burst money/dates/quantities.
 */

export const ADJUST_DESCRIPTOR_FIELDS = [
  "network",
  "station",
  "platform",
  "format",
  "buy_type",
  "placement",
  "type",
  "size",
  "market",
  "buying_demo",
  "environment",
  "location",
  "targeting_attribute",
  "creative_targeting",
  "creative",
  "duration",
  "bid_strategy",
  "is_bonus",
  "fixed_cost_media",
  "client_pays_for_media",
  "budget_includes_fees",
  "no_adserving",
] as const

export type AdjustDescriptorField = (typeof ADJUST_DESCRIPTOR_FIELDS)[number]

/** Fields that must never be set/cleared/copied by adjust ops. */
export const ADJUST_BLOCKED_FIELDS = [
  "budget",
  "buyAmount",
  "buy_amount",
  "unit_rate",
  "unitRate",
  "calculatedValue",
  "fee",
  "startDate",
  "endDate",
  "start_date",
  "end_date",
  "bursts",
  "bursts_json",
  "quantity",
  "qty",
  "spots",
  "totalMedia",
  "total_media",
  "line_item",
  "line_item_id",
  "id",
] as const

const DESCRIPTOR_SET = new Set<string>(ADJUST_DESCRIPTOR_FIELDS)
const BLOCKED_SET = new Set<string>(ADJUST_BLOCKED_FIELDS)

/** Alias → canonical form field key. */
const FIELD_ALIASES: Record<string, AdjustDescriptorField> = {
  buyType: "buy_type",
  buyingDemo: "buying_demo",
  targetingAttribute: "targeting_attribute",
  creativeTargeting: "creative_targeting",
  bidStrategy: "bid_strategy",
  isBonus: "is_bonus",
  fixedCostMedia: "fixed_cost_media",
  clientPaysForMedia: "client_pays_for_media",
  budgetIncludesFees: "budget_includes_fees",
  noAdserving: "no_adserving",
}

const BOOLEAN_FIELDS = new Set<string>([
  "is_bonus",
  "fixed_cost_media",
  "client_pays_for_media",
  "budget_includes_fees",
  "no_adserving",
])

export type AdjustOpType = "setField" | "clearField" | "copyField" | "moveField"

export type AdjustOp = {
  type: AdjustOpType
  field?: string
  value?: unknown
  fromField?: string
  toField?: string
}

export type AdjustScope =
  | "all"
  | { where: { field: string; equals: unknown } }
  | { isBonus: true }
  | { rowIndexes: number[] }

export type AdjustApplyResult = {
  items: Record<string, unknown>[]
  matchedCount: number
  changedCount: number
  summaryParts: string[]
  blockedOps: string[]
  moneyHint: boolean
}

function resolveFieldName(raw: string | undefined): {
  canonical: string | null
  blocked: boolean
  unknown: boolean
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { canonical: null, blocked: false, unknown: true }
  }
  const trimmed = raw.trim()
  const aliased = FIELD_ALIASES[trimmed] ?? trimmed
  if (BLOCKED_SET.has(aliased) || BLOCKED_SET.has(trimmed)) {
    return { canonical: aliased, blocked: true, unknown: false }
  }
  if (DESCRIPTOR_SET.has(aliased)) {
    return { canonical: aliased, blocked: false, unknown: false }
  }
  return { canonical: aliased, blocked: false, unknown: true }
}

function coerceValue(field: string, value: unknown): unknown {
  if (!BOOLEAN_FIELDS.has(field)) {
    if (value === null || value === undefined) return ""
    return typeof value === "string" ? value : String(value)
  }
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    return v === "true" || v === "1" || v === "yes"
  }
  return Boolean(value)
}

function fieldEquals(item: Record<string, unknown>, field: string, equals: unknown): boolean {
  const resolved = resolveFieldName(field)
  const key = resolved.canonical ?? field
  const actual = item[key]
  if (BOOLEAN_FIELDS.has(key)) {
    return Boolean(actual) === coerceValue(key, equals)
  }
  const a = actual == null ? "" : String(actual).trim()
  const b = equals == null ? "" : String(equals).trim()
  return a === b
}

function selectIndexes(
  items: Record<string, unknown>[],
  scope: AdjustScope,
): number[] {
  if (scope === "all") {
    return items.map((_, i) => i)
  }
  if ("isBonus" in scope && scope.isBonus === true) {
    return items.flatMap((item, i) => (item.is_bonus === true ? [i] : []))
  }
  if ("rowIndexes" in scope && Array.isArray(scope.rowIndexes)) {
    const out: number[] = []
    for (const raw of scope.rowIndexes) {
      const i = typeof raw === "number" ? raw : Number(raw)
      if (Number.isInteger(i) && i >= 0 && i < items.length) out.push(i)
    }
    return [...new Set(out)]
  }
  if ("where" in scope && scope.where && typeof scope.where === "object") {
    const { field, equals } = scope.where
    return items.flatMap((item, i) =>
      fieldEquals(item, String(field ?? ""), equals) ? [i] : [],
    )
  }
  return []
}

function cloneItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return structuredClone(items)
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value === null || value === undefined || value === "") return "(empty)"
  return `'${String(value)}'`
}

/**
 * Apply descriptor ops to a deep copy of items. Does not mutate input.
 */
export function applyAdjustLineItemOps(
  sourceItems: Record<string, unknown>[],
  ops: AdjustOp[],
  scope: AdjustScope,
): AdjustApplyResult {
  const items = cloneItems(sourceItems)
  const indexes = selectIndexes(items, scope)
  const summaryParts: string[] = []
  const blockedOps: string[] = []
  let moneyHint = false
  let changedCount = 0

  for (const op of ops) {
    if (!op || typeof op !== "object") continue
    const type = op.type

    if (type === "setField") {
      const resolved = resolveFieldName(op.field)
      if (resolved.blocked) {
        moneyHint = true
        blockedOps.push(`setField(${op.field}) blocked — money/dates/quantities stay in the grid`)
        continue
      }
      if (resolved.unknown || !resolved.canonical) {
        blockedOps.push(`setField(${op.field ?? "?"}) — unknown descriptor field`)
        continue
      }
      const field = resolved.canonical
      const nextVal = coerceValue(field, op.value)
      let n = 0
      for (const i of indexes) {
        const row = items[i]
        if (!row) continue
        if (row[field] === nextVal) continue
        row[field] = nextVal
        n++
      }
      changedCount += n
      summaryParts.push(`${field} set to ${formatValue(nextVal)}`)
      continue
    }

    if (type === "clearField") {
      const resolved = resolveFieldName(op.field)
      if (resolved.blocked) {
        moneyHint = true
        blockedOps.push(`clearField(${op.field}) blocked — money/dates/quantities stay in the grid`)
        continue
      }
      if (resolved.unknown || !resolved.canonical) {
        blockedOps.push(`clearField(${op.field ?? "?"}) — unknown descriptor field`)
        continue
      }
      const field = resolved.canonical
      const empty = BOOLEAN_FIELDS.has(field) ? false : ""
      let n = 0
      for (const i of indexes) {
        const row = items[i]
        if (!row) continue
        if (row[field] === empty) continue
        row[field] = empty
        n++
      }
      changedCount += n
      summaryParts.push(`${field} cleared`)
      continue
    }

    if (type === "copyField" || type === "moveField") {
      const fromResolved = resolveFieldName(op.fromField)
      const toResolved = resolveFieldName(op.toField)
      if (fromResolved.blocked || toResolved.blocked) {
        moneyHint = true
        blockedOps.push(
          `${type}(${op.fromField} → ${op.toField}) blocked — money/dates/quantities stay in the grid`,
        )
        continue
      }
      if (
        fromResolved.unknown ||
        toResolved.unknown ||
        !fromResolved.canonical ||
        !toResolved.canonical
      ) {
        blockedOps.push(
          `${type}(${op.fromField ?? "?"} → ${op.toField ?? "?"}) — unknown descriptor field`,
        )
        continue
      }
      const fromField = fromResolved.canonical
      const toField = toResolved.canonical
      let n = 0
      for (const i of indexes) {
        const row = items[i]
        if (!row) continue
        const raw = row[fromField]
        const nextVal = BOOLEAN_FIELDS.has(toField)
          ? coerceValue(toField, raw)
          : raw == null
            ? ""
            : String(raw)
        if (row[toField] !== nextVal) {
          row[toField] = nextVal
          n++
        }
        if (type === "moveField") {
          const empty = BOOLEAN_FIELDS.has(fromField) ? false : ""
          if (row[fromField] !== empty) {
            row[fromField] = empty
            n++
          }
        }
      }
      changedCount += n
      summaryParts.push(
        type === "moveField"
          ? `${fromField} moved into ${toField}`
          : `${fromField} copied into ${toField}`,
      )
    }
  }

  return {
    items,
    matchedCount: indexes.length,
    changedCount,
    summaryParts,
    blockedOps,
    moneyHint,
  }
}

export function formatAdjustDiffSummary(result: AdjustApplyResult): string {
  const parts =
    result.summaryParts.length > 0
      ? result.summaryParts.join("; ")
      : "no descriptor changes"
  const lines = [
    `${result.matchedCount} line(s) in scope: ${parts}`,
  ]
  if (result.blockedOps.length) {
    lines.push(`Skipped: ${result.blockedOps.join("; ")}`)
  }
  if (result.moneyHint) {
    lines.push(
      "Money/burst edits belong in the grid (per-cell or bulk burst edit) — descriptor ops only applied here.",
    )
  }
  return lines.join("\n")
}

export function parseAdjustScope(raw: unknown): AdjustScope | null {
  if (raw === "all" || raw === undefined || raw === null) return "all"
  if (typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (obj.isBonus === true) return { isBonus: true }
  if (Array.isArray(obj.rowIndexes)) {
    return {
      rowIndexes: obj.rowIndexes.filter(
        (n): n is number => typeof n === "number" && Number.isInteger(n),
      ),
    }
  }
  if (obj.where && typeof obj.where === "object" && !Array.isArray(obj.where)) {
    const where = obj.where as Record<string, unknown>
    return {
      where: {
        field: String(where.field ?? ""),
        equals: where.equals,
      },
    }
  }
  return null
}

export function parseAdjustOps(raw: unknown): AdjustOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const ops: AdjustOp[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const e = entry as Record<string, unknown>
    const type = e.type
    if (
      type !== "setField" &&
      type !== "clearField" &&
      type !== "copyField" &&
      type !== "moveField"
    ) {
      continue
    }
    ops.push({
      type,
      field: typeof e.field === "string" ? e.field : undefined,
      value: e.value,
      fromField: typeof e.fromField === "string" ? e.fromField : undefined,
      toField: typeof e.toField === "string" ? e.toField : undefined,
    })
  }
  return ops.length > 0 ? ops : null
}
