/**
 * Publisher identity rules (INVARIANTS: publisher names and ids are unique).
 *
 * Two publishers must never share a `publisher_name` or a `publisherid`,
 * compared case-insensitively after trimming. This module is pure (no DB, no
 * server-only) so the API write path, the admin publishers page banner and the
 * Advertising Associates resolver all apply the same rule.
 */

export type PublisherIdentityRow = {
  id?: number | string | null
  publisher_name?: string | null
  publisherid?: string | null
  billingagency?: string | null
}

export type PublisherIdentityField = "publisher_name" | "publisherid"

/** Comparison key: trimmed, lower-case. Blank values give "". */
export function publisherIdentityKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

/** Numeric primary key, or null when missing or not a positive number. */
export function publisherRowId(row: Pick<PublisherIdentityRow, "id">): number | null {
  const n = Number(row.id)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Lowest primary key first; rows without an id keep their input order at the end. */
export function sortPublishersByRowId<T extends PublisherIdentityRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, id: publisherRowId(row) }))
    .sort((a, b) => {
      if (a.id != null && b.id != null && a.id !== b.id) return a.id - b.id
      if (a.id != null && b.id == null) return -1
      if (a.id == null && b.id != null) return 1
      return a.index - b.index
    })
    .map((x) => x.row)
}

export type PublisherIdentityConflicts<T extends PublisherIdentityRow = PublisherIdentityRow> = {
  publisher_name: T[]
  publisherid: T[]
}

/**
 * Other publishers whose name or publisherid matches the candidate's
 * (case-insensitive, trimmed). `selfId` is the row being edited and is
 * never a conflict with itself; pass null on create.
 */
export function findPublisherIdentityConflicts<T extends PublisherIdentityRow>(
  candidate: Pick<PublisherIdentityRow, "publisher_name" | "publisherid">,
  existing: readonly T[],
  selfId: number | null,
): PublisherIdentityConflicts<T> {
  const nameKey = publisherIdentityKey(candidate.publisher_name)
  const idKey = publisherIdentityKey(candidate.publisherid)
  const out: PublisherIdentityConflicts<T> = { publisher_name: [], publisherid: [] }
  for (const row of sortPublishersByRowId(existing)) {
    const rowId = publisherRowId(row)
    if (selfId != null && rowId === selfId) continue
    if (nameKey && publisherIdentityKey(row.publisher_name) === nameKey) out.publisher_name.push(row)
    if (idKey && publisherIdentityKey(row.publisherid) === idKey) out.publisherid.push(row)
  }
  return out
}

function describeRow(row: PublisherIdentityRow): string {
  const id = publisherRowId(row)
  const name = String(row.publisher_name ?? "").trim() || "(no name)"
  const pid = String(row.publisherid ?? "").trim() || "(no id)"
  return `${name} (publisher ID "${pid}"${id != null ? `, record #${id}` : ""})`
}

/** One error message per field that clashes; empty object when there is no clash. */
export function publisherIdentityConflictMessages(
  candidate: Pick<PublisherIdentityRow, "publisher_name" | "publisherid">,
  conflicts: PublisherIdentityConflicts,
): Partial<Record<PublisherIdentityField, string>> {
  const out: Partial<Record<PublisherIdentityField, string>> = {}
  if (conflicts.publisher_name.length > 0) {
    out.publisher_name =
      `Publisher name "${String(candidate.publisher_name ?? "").trim()}" is already used by ` +
      `${conflicts.publisher_name.map(describeRow).join("; ")}. Publisher names must be unique ` +
      `(case and spaces are ignored).`
  }
  if (conflicts.publisherid.length > 0) {
    out.publisherid =
      `Publisher ID "${String(candidate.publisherid ?? "").trim()}" is already used by ` +
      `${conflicts.publisherid.map(describeRow).join("; ")}. Publisher IDs must be unique ` +
      `(case and spaces are ignored).`
  }
  return out
}

export type PublisherDuplicateGroup<T extends PublisherIdentityRow = PublisherIdentityRow> = {
  field: PublisherIdentityField
  /** Normalised key the rows share (trimmed, lower-case). */
  key: string
  /** Lowest primary key first. */
  publishers: T[]
}

/**
 * Existing duplicates in a publisher list: every name or publisherid shared by
 * two or more rows. Sorted by field (name first) then key.
 */
export function listPublisherDuplicates<T extends PublisherIdentityRow>(
  publishers: readonly T[],
): PublisherDuplicateGroup<T>[] {
  const groups: PublisherDuplicateGroup<T>[] = []
  for (const field of ["publisher_name", "publisherid"] as const) {
    const byKey = new Map<string, T[]>()
    for (const row of sortPublishersByRowId(publishers)) {
      const key = publisherIdentityKey(row[field])
      if (!key) continue
      const list = byKey.get(key)
      if (list) list.push(row)
      else byKey.set(key, [row])
    }
    const keys = [...byKey.keys()].filter((k) => (byKey.get(k)?.length ?? 0) > 1).sort()
    for (const key of keys) groups.push({ field, key, publishers: byKey.get(key) ?? [] })
  }
  return groups
}

/** Billing agency comparison key (trimmed, lower-case). */
export function billingAgencyKey(row: Pick<PublisherIdentityRow, "billingagency">): string {
  return String(row.billingagency ?? "").trim().toLowerCase()
}

export type PublisherDuplicatePick<T extends PublisherIdentityRow> = {
  publisher: T
  /** True when the rows disagree on billing agency. */
  billingAgencyConflict: boolean
}

/**
 * Deterministic pick from rows that share a name: the lowest primary key.
 * When they agree on billing agency the pick does not change any billing
 * outcome. When they disagree, `billingAgencyConflict` is true so the caller
 * can warn. Returns null for an empty list.
 */
export function pickPublisherFromDuplicates<T extends PublisherIdentityRow>(
  rows: readonly T[],
): PublisherDuplicatePick<T> | null {
  if (rows.length === 0) return null
  const sorted = sortPublishersByRowId(rows)
  const agencies = new Set(sorted.map(billingAgencyKey))
  return { publisher: sorted[0], billingAgencyConflict: agencies.size > 1 }
}

/** Names already warned about in this process, so a plan with many lines warns once per name. */
const warnedConflictingNames = new Set<string>()

/** Test hook: forget which conflicting names were already warned about. */
export function resetPublisherNameConflictWarningsForTests(): void {
  warnedConflictingNames.clear()
}

/**
 * The publisher a name resolves to when several rows share it (case and
 * spaces ignored). Publisher names are unique (docs/brain/INVARIANTS.md);
 * until existing duplicates are cleaned up the lowest `publishers.id` wins,
 * stable and never last-wins. When the rows agree on billing agency the pick
 * cannot change a billing outcome. When they disagree a server warning names
 * them, once per name per process.
 */
export function resolvePublisherNameGroup<T extends PublisherIdentityRow>(
  name: string,
  rows: readonly T[] | undefined,
): T | undefined {
  if (!rows || rows.length === 0) return undefined
  const pick = pickPublisherFromDuplicates(rows)
  if (!pick) return undefined
  if (pick.billingAgencyConflict) {
    const warnKey = publisherIdentityKey(name)
    if (!warnedConflictingNames.has(warnKey)) {
      warnedConflictingNames.add(warnKey)
      const listed = sortPublishersByRowId(rows)
        .map(
          (r) =>
            `#${publisherRowId(r) ?? "?"} ${String(r.publisherid ?? "").trim()} (${String(r.billingagency ?? "").trim() || "no billing agency"})`,
        )
        .join(", ")
      console.warn(
        `[publishers] ${rows.length} publishers share the name "${String(name).trim()}" with different billing agencies: ${listed}. ` +
          `Using the lowest id #${publisherRowId(pick.publisher) ?? "?"}. Publisher names must be unique; fix the duplicate in Publishers.`,
      )
    }
  }
  return pick.publisher
}

/**
 * Name to publisher map with no silent last-wins: rows whose `keyOf(name)`
 * collide resolve through `resolvePublisherNameGroup` (lowest id, warning on
 * a billing agency conflict). `keyOf` defaults to trim; blank keys are skipped.
 */
export function buildPublisherByNameMap<T extends PublisherIdentityRow>(
  publishers: readonly T[],
  keyOf: (name: string) => string = (name) => name.trim(),
): Map<string, T> {
  const groups = new Map<string, T[]>()
  for (const p of sortPublishersByRowId(publishers)) {
    const key = keyOf(String(p.publisher_name ?? ""))
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  const out = new Map<string, T>()
  for (const [key, rows] of groups) {
    const picked = resolvePublisherNameGroup(String(rows[0]?.publisher_name ?? key), rows)
    if (picked) out.set(key, picked)
  }
  return out
}
