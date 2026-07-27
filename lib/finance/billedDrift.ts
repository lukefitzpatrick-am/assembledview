/** Minimal line snapshot used for billed-set hashing (server + client + tests). */
export type BilledLineSnapshot = {
  item_code: string
  amount: number
  schedule_line_item_id?: string | null
}

const AMOUNT_EPS = 0.01

function lineKey(line: BilledLineSnapshot): string {
  const id = (line.schedule_line_item_id ?? "").trim()
  if (id) return `id:${id}`
  return `code:${(line.item_code ?? "").trim()}`
}

/** Canonical, order-independent fingerprint of the billed line set. */
export function canonicalizeBilledLineSet(lines: BilledLineSnapshot[]): string {
  return lines
    .map((l) => `${lineKey(l)}:${Number(l.amount).toFixed(2)}`)
    .toSorted((a, b) => a.localeCompare(b))
    .join("|")
}

/**
 * Stable short hash of the billed line set (FNV-1a dual, hex).
 * Pure JS so the same fingerprint works in Node route handlers and the client hub.
 */
export function hashBilledLineSet(lines: BilledLineSnapshot[]): string {
  const canonical = canonicalizeBilledLineSet(lines)
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5 ^ 0x9e3779b9
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193)
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")
}

export type DetectBilledDriftInput = {
  billed: boolean
  billedAmount: number | null | undefined
  billedLinesHash: string | null | undefined
  currentTotal: number
  currentLines: BilledLineSnapshot[]
}

export type DetectBilledDriftResult = {
  drift: boolean
  amountMismatch: boolean
  linesMismatch: boolean
  /** currentTotal - billedAmount when both known; else null */
  delta: number | null
}

/**
 * Compare the current recomputed month total / line set against the snapshot
 * stored when the month was marked billed. Does not mutate billed records.
 *
 * Legacy rows (billed but no stored amount/hash) return drift=false — we cannot
 * invent a baseline.
 */
export function detectBilledDrift(input: DetectBilledDriftInput): DetectBilledDriftResult {
  if (!input.billed) {
    return { drift: false, amountMismatch: false, linesMismatch: false, delta: null }
  }

  const hasAmount =
    typeof input.billedAmount === "number" && Number.isFinite(input.billedAmount)
  const hasHash =
    typeof input.billedLinesHash === "string" && input.billedLinesHash.length > 0

  if (!hasAmount && !hasHash) {
    return { drift: false, amountMismatch: false, linesMismatch: false, delta: null }
  }

  const delta = hasAmount ? input.currentTotal - (input.billedAmount as number) : null
  const amountMismatch = hasAmount && Math.abs(delta as number) > AMOUNT_EPS

  const currentHash = hashBilledLineSet(input.currentLines)
  const linesMismatch = hasHash && currentHash !== input.billedLinesHash

  return {
    drift: amountMismatch || linesMismatch,
    amountMismatch,
    linesMismatch,
    delta: hasAmount ? Math.round((delta as number) * 100) / 100 : null,
  }
}

export function toBilledLineSnapshots(
  lines: Array<{
    item_code?: string | null
    amount?: number | null
    schedule_line_item_id?: string | null
  }>
): BilledLineSnapshot[] {
  return lines.map((l) => ({
    item_code: typeof l.item_code === "string" ? l.item_code : "",
    amount: typeof l.amount === "number" && Number.isFinite(l.amount) ? l.amount : 0,
    schedule_line_item_id: l.schedule_line_item_id ?? null,
  }))
}
