/**
 * Identity-preserving row updates for expert grids (F-28 Phase 1).
 *
 * Mutations must produce a new array while keeping unchanged row object
 * references so React.memo row components can skip re-render.
 */

export type NormalizeRowCacheEntry<T> = {
  source: T
  weekKeys: readonly string[]
  normalized: T
}

export type MapBuildCacheEntry<TSource, TMap> = {
  sourceKey: TSource
  weekKeys: readonly string[]
  map: TMap
}

/** Patch one row by index; untouched rows keep the same object identity. */
export function updateRowAtIndex<T>(
  rows: readonly T[],
  index: number,
  patch: Partial<T>
): T[] | null {
  if (index < 0 || index >= rows.length) return null
  const prev = rows[index]!
  const nextRow = { ...prev, ...patch }
  const out = rows.slice() as T[]
  out[index] = nextRow
  return out
}

/** Map one row through mapper; untouched rows keep the same object identity. */
export function mapRowAtIndex<T>(
  rows: readonly T[],
  index: number,
  mapper: (row: T) => T
): T[] | null {
  if (index < 0 || index >= rows.length) return null
  const prev = rows[index]!
  const nextRow = mapper(prev)
  if (nextRow === prev) return rows as T[]
  const out = rows.slice() as T[]
  out[index] = nextRow
  return out
}

/**
 * Apply finalize to each row. When finalize returns the same reference,
 * that slot keeps identity — callers should return `row` unchanged when
 * derived fields already match.
 */
export function finalizeRowsPreservingIdentity<T>(
  rows: readonly T[],
  finalize: (row: T) => T
): T[] {
  let changed = false
  const out = new Array<T>(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const next = finalize(row)
    out[i] = next
    if (next !== row) changed = true
  }
  return changed ? out : (rows as T[])
}

/**
 * Normalize rows with a per-id cache keyed on (source row reference, weekKeys).
 * Unchanged sources reuse the previous normalized object.
 *
 * Also reuses when the parent feeds back the previous *normalized* row
 * (common after pushRows → onRowsChange), so we do not rematerialise the
 * whole grid on every single-cell edit.
 */
export function normalizeRowsPreservingIdentity<T extends { id: string }>(
  rows: readonly T[],
  weekKeys: readonly string[],
  normalizeOne: (row: T, weekKeys: readonly string[]) => T,
  cache: Map<string, NormalizeRowCacheEntry<T>>
): { rows: T[]; cache: Map<string, NormalizeRowCacheEntry<T>> } {
  const nextCache = new Map<string, NormalizeRowCacheEntry<T>>()
  const out = new Array<T>(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const source = rows[i]!
    const prev = cache.get(source.id)
    if (prev && prev.weekKeys === weekKeys) {
      // Parent echoed the prior normalized row back unchanged.
      if (prev.normalized === source) {
        out[i] = source
        nextCache.set(source.id, {
          source,
          weekKeys,
          normalized: source,
        })
        continue
      }
      // Same raw source as last time — reuse prior normalized object.
      if (prev.source === source) {
        out[i] = prev.normalized
        nextCache.set(source.id, prev)
        continue
      }
    }
    const normalized = normalizeOne(source, weekKeys)
    const entry: NormalizeRowCacheEntry<T> = {
      source,
      weekKeys,
      normalized,
    }
    out[i] = normalized
    nextCache.set(source.id, entry)
  }
  return { rows: out, cache: nextCache }
}

/**
 * Build per-row derived maps (e.g. merge occupancy) while reusing prior map
 * objects when the row's source key and weekKeys are unchanged.
 */
export function buildMapsPreservingIdentity<
  T extends { id: string },
  TSource,
  TMap,
>(
  rows: readonly T[],
  weekKeys: readonly string[],
  getSourceKey: (row: T) => TSource,
  buildOne: (row: T) => TMap,
  cache: Map<string, MapBuildCacheEntry<TSource, TMap>>
): { maps: TMap[]; cache: Map<string, MapBuildCacheEntry<TSource, TMap>> } {
  const nextCache = new Map<string, MapBuildCacheEntry<TSource, TMap>>()
  const maps = new Array<TMap>(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const sourceKey = getSourceKey(row)
    const prev = cache.get(row.id)
    if (prev && prev.sourceKey === sourceKey && prev.weekKeys === weekKeys) {
      maps[i] = prev.map
      nextCache.set(row.id, prev)
      continue
    }
    const map = buildOne(row)
    const entry: MapBuildCacheEntry<TSource, TMap> = {
      sourceKey,
      weekKeys,
      map,
    }
    maps[i] = map
    nextCache.set(row.id, entry)
  }
  return { maps, cache: nextCache }
}
