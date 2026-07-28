/**
 * Read-only billing integrity tripwire: group channel rows by
 * (mba_number, media_plan_version) and flag duplicates, version-less
 * production accumulation, and orphan version FKs.
 */

export type IntegrityKind =
  | "duplicate"
  | "version_less"
  | "orphan"
  /** Plan C S2-P6 — recomputed plan_*_rows hash ≠ stored snapshot_checksum */
  | "checksum_drift"
  /** Plan C S2-P6 — plan_*_rows exist while billing_rows_migrated=false */
  | "writer_bypass"

export type IntegritySeverity = "live" | "history"

export type IntegrityRow = {
  id?: unknown
  mba_number?: unknown
  media_plan_version?: unknown
  line_item_id?: unknown
}

export type IntegrityFinding = {
  table: string
  mba_number: string
  /** media_plan_versions.id (FK), or null for version_less */
  version: number | null
  rows: number
  distinctIds: number
  kind: IntegrityKind
  severity: IntegritySeverity
  /** checksum_drift only */
  storedChecksum?: string | null
  recomputedChecksum?: string | null
}

export type VersionMeta = {
  id: number
  mba_number: string
  version_number: number
}

export type FlagIntegrityInput = {
  table: string
  rows: readonly IntegrityRow[]
  /** Known media_plan_versions.id values */
  knownVersionIds: ReadonlySet<number>
  /** id → version row meta (for live vs history) */
  knownVersions: ReadonlyMap<number, VersionMeta>
  /** mba_number → master's current version_number */
  currentVersionByMba: ReadonlyMap<string, number>
  /**
   * When true (production table), flag rows with missing/undefined
   * media_plan_version as version_less.
   */
  checkVersionLess?: boolean
}

function isMissingVersion(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "string" && v.trim() === "") return true
  return false
}

function normalizeMba(v: unknown): string {
  return String(v ?? "").trim()
}

function normalizeVersionId(v: unknown): number | null {
  if (isMissingVersion(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function lineItemIdOf(row: IntegrityRow): string {
  return String(row.line_item_id ?? "").trim()
}

function resolveSeverity(
  mba: string,
  versionId: number | null,
  knownVersions: ReadonlyMap<number, VersionMeta>,
  currentVersionByMba: ReadonlyMap<string, number>
): IntegritySeverity {
  if (versionId == null) return "live"
  const meta = knownVersions.get(versionId)
  if (!meta) return "live"
  const current = currentVersionByMba.get(mba)
  if (current == null) return "live"
  return meta.version_number === current ? "live" : "history"
}

type GroupAgg = {
  rows: number
  distinct: Set<string>
}

/**
 * Flag integrity findings for one channel table.
 * A single (mba, version) group may emit both duplicate and orphan findings.
 */
export function flagIntegrityFindings(input: FlagIntegrityInput): IntegrityFinding[] {
  const {
    table,
    rows,
    knownVersionIds,
    knownVersions,
    currentVersionByMba,
    checkVersionLess = false,
  } = input

  const findings: IntegrityFinding[] = []
  const versioned = new Map<string, GroupAgg>()
  const versionLess = new Map<string, GroupAgg>()

  for (const row of rows) {
    const mba = normalizeMba(row.mba_number)
    if (!mba) continue

    const versionId = normalizeVersionId(row.media_plan_version)
    const id = lineItemIdOf(row)

    if (versionId == null) {
      if (!checkVersionLess) continue
      let agg = versionLess.get(mba)
      if (!agg) {
        agg = { rows: 0, distinct: new Set() }
        versionLess.set(mba, agg)
      }
      agg.rows += 1
      if (id) agg.distinct.add(id)
      continue
    }

    const key = `${mba}\0${versionId}`
    let agg = versioned.get(key)
    if (!agg) {
      agg = { rows: 0, distinct: new Set() }
      versioned.set(key, agg)
    }
    agg.rows += 1
    if (id) agg.distinct.add(id)
  }

  for (const [mba, agg] of versionLess) {
    findings.push({
      table,
      mba_number: mba,
      version: null,
      rows: agg.rows,
      distinctIds: agg.distinct.size,
      kind: "version_less",
      severity: "live",
    })
  }

  for (const [key, agg] of versioned) {
    const sep = key.indexOf("\0")
    const mba = key.slice(0, sep)
    const versionId = Number(key.slice(sep + 1))
    const distinctIds = agg.distinct.size
    const severity = resolveSeverity(mba, versionId, knownVersions, currentVersionByMba)

    if (agg.rows > distinctIds) {
      findings.push({
        table,
        mba_number: mba,
        version: versionId,
        rows: agg.rows,
        distinctIds,
        kind: "duplicate",
        severity,
      })
    }

    if (!knownVersionIds.has(versionId)) {
      findings.push({
        table,
        mba_number: mba,
        version: versionId,
        rows: agg.rows,
        distinctIds,
        kind: "orphan",
        severity,
      })
    }
  }

  return findings
}

export type IntegritySeverityCounts = {
  live: number
  history: number
}

export function countFindingsBySeverity(
  findings: readonly IntegrityFinding[]
): IntegritySeverityCounts {
  let live = 0
  let history = 0
  for (const f of findings) {
    if (f.severity === "live") live += 1
    else history += 1
  }
  return { live, history }
}

/** Project a raw Xano row down to the tripwire field set. */
export function projectIntegrityRow(raw: unknown): IntegrityRow {
  if (!raw || typeof raw !== "object") return {}
  const r = raw as Record<string, unknown>
  return {
    id: r.id,
    mba_number: r.mba_number,
    media_plan_version: r.media_plan_version,
    line_item_id: r.line_item_id,
  }
}

export function logIntegrityFinding(finding: IntegrityFinding): void {
  console.log(
    `[billing-integrity] ${JSON.stringify({
      table: finding.table,
      mba_number: finding.mba_number,
      version: finding.version,
      rows: finding.rows,
      distinctIds: finding.distinctIds,
      kind: finding.kind,
      severity: finding.severity,
      ...(finding.kind === "checksum_drift"
        ? {
            storedChecksum: finding.storedChecksum ?? null,
            recomputedChecksum: finding.recomputedChecksum ?? null,
          }
        : {}),
    })}`
  )
}
