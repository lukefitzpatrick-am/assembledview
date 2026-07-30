/**
 * Field-level compare + in-memory ring buffer for DATA_BACKEND=shadow diffs.
 * Process-local only (survives within a warm lambda / Node process).
 */

export type FieldDiff = {
  field: string
  xano: unknown
  postgres: unknown
}

export type RowFieldDiff = {
  id: string | number
  fields: FieldDiff[]
}

export type ShadowDiffEvent = {
  at: number
  table: string
  xanoCount: number
  postgresCount: number
  missingInPostgres: Array<string | number>
  missingInXano: Array<string | number>
  fieldDiffs: RowFieldDiff[]
}

const MAX_EVENTS = 2000
const store: ShadowDiffEvent[] = []

function rowId(row: Record<string, unknown>): string | number | null {
  const id = row.id
  if (typeof id === "number" && Number.isFinite(id)) return id
  if (typeof id === "string" && id.trim() !== "") return id
  return null
}

/** Normalize timestamps so unix vs ISO do not flood the diff log. */
export function normalizeComparableValue(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") {
    if (value > 1e12) return new Date(value).toISOString()
    if (value > 1e9) return new Date(value * 1000).toISOString()
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const t = Date.parse(trimmed)
      if (!Number.isNaN(t)) return new Date(t).toISOString()
    }
    return trimmed
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return value
}

function asRecordList(payload: unknown): Record<string, unknown>[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (() => {
          const p = payload as Record<string, unknown>
          for (const key of ["data", "items", "result", "records"] as const) {
            if (Array.isArray(p[key])) return p[key] as unknown[]
          }
          return []
        })()
      : []
  return list.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === "object" && !Array.isArray(row)
  )
}

export function compareReferenceRows(
  table: string,
  xanoPayload: unknown,
  postgresRows: Record<string, unknown>[]
): ShadowDiffEvent {
  const xanoRows = asRecordList(xanoPayload)
  const xanoById = new Map<string | number, Record<string, unknown>>()
  const pgById = new Map<string | number, Record<string, unknown>>()

  for (const row of xanoRows) {
    const id = rowId(row)
    if (id != null) xanoById.set(id, row)
  }
  for (const row of postgresRows) {
    const id = rowId(row)
    if (id != null) pgById.set(id, row)
  }

  const missingInPostgres: Array<string | number> = []
  const missingInXano: Array<string | number> = []
  const fieldDiffs: RowFieldDiff[] = []

  for (const id of xanoById.keys()) {
    if (!pgById.has(id)) missingInPostgres.push(id)
  }
  for (const id of pgById.keys()) {
    if (!xanoById.has(id)) missingInXano.push(id)
  }

  for (const [id, xanoRow] of xanoById) {
    const pgRow = pgById.get(id)
    if (!pgRow) continue
    const fields: FieldDiff[] = []
    const keys = new Set([...Object.keys(xanoRow), ...Object.keys(pgRow)])
    for (const field of keys) {
      if (field === "id") continue
      const xv = normalizeComparableValue(xanoRow[field])
      const pv = normalizeComparableValue(pgRow[field])
      if (xv !== pv) {
        fields.push({ field, xano: xanoRow[field] ?? null, postgres: pgRow[field] ?? null })
      }
    }
    if (fields.length > 0) fieldDiffs.push({ id, fields })
  }

  return {
    at: Date.now(),
    table,
    xanoCount: xanoRows.length,
    postgresCount: postgresRows.length,
    missingInPostgres,
    missingInXano,
    fieldDiffs,
  }
}

export function recordShadowDiff(event: ShadowDiffEvent): void {
  store.push(event)
  if (store.length > MAX_EVENTS) {
    store.splice(0, store.length - MAX_EVENTS)
  }
  const mismatchCount =
    event.missingInPostgres.length +
    event.missingInXano.length +
    event.fieldDiffs.length
  if (mismatchCount > 0) {
    console.warn("[migration-shadow-diff]", {
      table: event.table,
      xanoCount: event.xanoCount,
      postgresCount: event.postgresCount,
      missingInPostgres: event.missingInPostgres.length,
      missingInXano: event.missingInXano.length,
      rowsWithFieldDiffs: event.fieldDiffs.length,
      sampleFieldDiffs: event.fieldDiffs.slice(0, 5),
    })
  }
}

export type ShadowDiffSummary = {
  since: string
  until: string
  eventCount: number
  byTable: Array<{
    table: string
    events: number
    lastAt: string
    totalMissingInPostgres: number
    totalMissingInXano: number
    totalRowsWithFieldDiffs: number
    lastEvent: {
      xanoCount: number
      postgresCount: number
      missingInPostgres: number
      missingInXano: number
      rowsWithFieldDiffs: number
      sampleFieldDiffs: RowFieldDiff[]
    }
  }>
}

export function summarizeShadowDiffs(windowMs = 24 * 60 * 60 * 1000): ShadowDiffSummary {
  const until = Date.now()
  const since = until - windowMs
  const recent = store.filter((e) => e.at >= since)
  const byTableMap = new Map<string, ShadowDiffEvent[]>()
  for (const event of recent) {
    const list = byTableMap.get(event.table) ?? []
    list.push(event)
    byTableMap.set(event.table, list)
  }

  const byTable = [...byTableMap.entries()]
    .map(([table, events]) => {
      const last = events[events.length - 1]!
      return {
        table,
        events: events.length,
        lastAt: new Date(last.at).toISOString(),
        totalMissingInPostgres: events.reduce((n, e) => n + e.missingInPostgres.length, 0),
        totalMissingInXano: events.reduce((n, e) => n + e.missingInXano.length, 0),
        totalRowsWithFieldDiffs: events.reduce((n, e) => n + e.fieldDiffs.length, 0),
        lastEvent: {
          xanoCount: last.xanoCount,
          postgresCount: last.postgresCount,
          missingInPostgres: last.missingInPostgres.length,
          missingInXano: last.missingInXano.length,
          rowsWithFieldDiffs: last.fieldDiffs.length,
          sampleFieldDiffs: last.fieldDiffs.slice(0, 10),
        },
      }
    })
    .sort((a, b) => a.table.localeCompare(b.table))

  return {
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
    eventCount: recent.length,
    byTable,
  }
}

/** Test helper — clears the in-memory buffer. */
export function __resetShadowDiffStoreForTests(): void {
  store.length = 0
}
