/**
 * Plan C S2-P1 — durable line identity (`line_uid`).
 *
 * Minted once when a line is created; never reminted; never derived from
 * array index. Existing Xano rows (S2-P4) use {@link backfillLineUid}.
 */

import { createHash, randomUUID } from "node:crypto"

export type LineUidCarrier = {
  line_uid?: unknown
  lineUid?: unknown
  [key: string]: unknown
}

export type BackfillLineUidArgs = {
  mba_number: string
  media_plan_version: number | string
  line_item_id: string
  /** Xano table name, e.g. `media_plan_television`. */
  table: string
}

/** Fresh UUID for a newly created line. */
export function mintLineUid(): string {
  return randomUUID()
}

/** Read snake or camel `line_uid`; blank / missing → undefined. */
export function pickLineUid(item: LineUidCarrier | null | undefined): string | undefined {
  if (!item || typeof item !== "object") return undefined
  const raw = item.line_uid ?? item.lineUid
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Ensure every item has `line_uid`. Mints only where absent.
 * NEVER remints an existing uid. NEVER derives from array index.
 */
export function ensureLineUids<T extends LineUidCarrier>(
  lineItems: readonly T[] | null | undefined
): Array<T & { line_uid: string }> {
  const items = Array.isArray(lineItems) ? lineItems : []
  return items.map((item) => {
    const existing = pickLineUid(item)
    if (existing) {
      return { ...item, line_uid: existing }
    }
    return { ...item, line_uid: mintLineUid() }
  })
}

/**
 * Copy `line_uid` from parallel source objects onto built channel rows, then
 * mint any still missing. Used by channel save paths before replace POST.
 */
export function stampLineUidsFromSources<T extends LineUidCarrier>(
  rows: readonly T[],
  sources: readonly LineUidCarrier[]
): Array<T & { line_uid: string }> {
  const stamped = (Array.isArray(rows) ? rows : []).map((row, i) => {
    const fromSource = pickLineUid(sources[i])
    const fromRow = pickLineUid(row)
    const line_uid = fromSource ?? fromRow
    return line_uid ? { ...row, line_uid } : { ...row }
  })
  return ensureLineUids(stamped)
}

/**
 * Deterministic backfill for EXISTING Xano rows (S2-P4).
 * Hash of (mba_number, media_plan_version, line_item_id, table) so re-runs agree.
 */
export function backfillLineUid(args: BackfillLineUidArgs): string {
  const mba = String(args.mba_number ?? "").trim()
  const version = String(args.media_plan_version ?? "").trim()
  const lineItemId = String(args.line_item_id ?? "").trim()
  const table = String(args.table ?? "").trim()
  const payload = `${mba}\0${version}\0${lineItemId}\0${table}`
  return createHash("sha256").update(payload, "utf8").digest("hex")
}
