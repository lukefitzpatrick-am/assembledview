/**
 * Process-level cache of feature_switches rows (pure, testable).
 *
 * One read per instance per TTL (60 seconds). A toggle on this instance
 * invalidates at once; other instances pick it up within the TTL. Reads that
 * fail (0111 not applied, database down) cache `null` for the TTL too, so
 * every switch falls back to its env var without hammering the database.
 */
import type { FeatureRow } from "./registry"

export const FEATURE_SWITCH_TTL_MS = 60_000

/** Returns the rows, or null when the table can't be read. */
export type FeatureRowReader = () => Promise<ReadonlyMap<string, FeatureRow> | null>

export type FeatureRowStore = {
  read: () => Promise<ReadonlyMap<string, FeatureRow> | null>
  invalidate: () => void
}

export function createFeatureRowStore(
  reader: FeatureRowReader,
  options: { ttlMs?: number; now?: () => number } = {},
): FeatureRowStore {
  const ttl = options.ttlMs ?? FEATURE_SWITCH_TTL_MS
  const now = options.now ?? (() => Date.now())
  let cached: { at: number; rows: ReadonlyMap<string, FeatureRow> | null } | null = null
  let inflight: Promise<ReadonlyMap<string, FeatureRow> | null> | null = null
  let generation = 0

  async function load(): Promise<ReadonlyMap<string, FeatureRow> | null> {
    const gen = generation
    let rows: ReadonlyMap<string, FeatureRow> | null
    try {
      rows = await reader()
    } catch (err) {
      console.warn("[features] switch read failed; using env values", err)
      rows = null
    }
    if (gen === generation) cached = { at: now(), rows }
    return rows
  }

  return {
    async read() {
      if (cached && now() - cached.at < ttl) return cached.rows
      if (!inflight) {
        inflight = load().finally(() => {
          inflight = null
        })
      }
      return inflight
    },
    invalidate() {
      generation += 1
      cached = null
      inflight = null
    },
  }
}
