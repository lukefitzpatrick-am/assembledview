/**
 * Fingerprint of a line's burst date span for `billing_overrides.date_basis`.
 * Stable across reloads so stale overrides can be detected when dates move.
 *
 * Browser-safe: Web Crypto SHA-256 only (no Node `crypto` import).
 */

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toISOString().slice(0, 10)
}

export type BurstDateLike = {
  startDate?: string | Date | null
  endDate?: string | Date | null
  start_date?: string | Date | null
  end_date?: string | Date | null
}

function burstPairsPayload(bursts: BurstDateLike[]): string {
  const pairs = (bursts ?? [])
    .map((b) => {
      const start = toIsoDate(b.startDate ?? b.start_date ?? "")
      const end = toIsoDate(b.endDate ?? b.end_date ?? "")
      if (!start && !end) return null
      return `${start}|${end}`
    })
    .filter((p): p is string => Boolean(p))
    .sort((a, b) => a.localeCompare(b))

  return pairs.join(";")
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let out = ""
  for (let i = 0; i < arr.length; i++) {
    out += arr[i]!.toString(16).padStart(2, "0")
  }
  return out
}

/**
 * SHA-256 hex of sorted `start|end` pairs from the line's current bursts.
 */
export async function computeBillingOverrideDateBasis(
  bursts: BurstDateLike[]
): Promise<string> {
  const payload = burstPairsPayload(bursts)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error("crypto.subtle is required to compute billing override date_basis")
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(payload))
  return bytesToHex(digest)
}
