import { createHash } from "crypto"

/**
 * Process-local duplicate protection for accidental double-submit (same inputs + same dataset hash).
 * Does not replace a unique index in Xano for distributed enforcement.
 */

type GuardEntry = { createdAt: number }
const store = new Map<string, GuardEntry>()
const WINDOW_MS = 90_000

function prune(): void {
  const now = Date.now()
  for (const [k, v] of store) {
    if (now - v.createdAt > WINDOW_MS) store.delete(k)
  }
}

function dedupeKeyBlob(input: {
  userKey: string
  fy: number
  scenario: string
  clientFilter: string
  searchText: string
  includeDebug: boolean
  datasetHash: string
}): string {
  const raw = [
    input.userKey,
    String(input.fy),
    input.scenario,
    input.clientFilter.trim().toLowerCase(),
    input.searchText.trim().toLowerCase(),
    String(input.includeDebug),
    input.datasetHash,
  ].join("\u001e")
  return createHash("sha256").update(raw).digest("hex")
}

export type SnapshotDedupeDimensions = {
  userKey: string
  fy: number
  scenario: string
  clientFilter: string
  searchText: string
  includeDebug: boolean
  datasetHash: string
}

export function checkSnapshotDuplicateGuard(
  input: SnapshotDedupeDimensions & { forceDuplicate: boolean }
): { allowed: true } | { allowed: false; retry_after_ms: number } {
  if (input.forceDuplicate) return { allowed: true }
  prune()
  const key = dedupeKeyBlob(input)
  const now = Date.now()
  const prev = store.get(key)
  if (prev && now - prev.createdAt < WINDOW_MS) {
    return { allowed: false, retry_after_ms: Math.max(0, WINDOW_MS - (now - prev.createdAt)) }
  }
  return { allowed: true }
}

export function recordSnapshotDedupeGuard(input: SnapshotDedupeDimensions): void {
  prune()
  const key = dedupeKeyBlob(input)
  store.set(key, { createdAt: Date.now() })
}
