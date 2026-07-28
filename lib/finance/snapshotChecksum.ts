/**
 * Stable checksum helpers for Plan C document provenance stamps.
 * Canonical JSON: recursively sorted object keys; arrays keep order.
 */

import { createHash } from "node:crypto"

export function canonicalStableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    out[key] = canonicalize(obj[key])
  }
  return out
}

/** SHA-256 hex digest of the canonical JSON for `value`. */
export function snapshotChecksum(value: unknown): string {
  return createHash("sha256").update(canonicalStableStringify(value), "utf8").digest("hex")
}

/** First 8 hex chars of {@link snapshotChecksum} — used in PDF footers. */
export function snapshotChecksumShort(value: unknown): string {
  return snapshotChecksum(value).slice(0, 8)
}
