/**
 * Typed money column_map targets for publisher schedule ingest.
 * Money never lands on line_item_panels — proposal/reconciliation only.
 */

export const MONEY_TARGETS = [
  "media_rate:weekly",
  "media_rate:lunar",
  "media_rate:per_spot",
  "media_rate:bought",
  "media_amount:stated",
  "charge:production",
  "charge:installation",
] as const

export type MoneyTarget = (typeof MONEY_TARGETS)[number]

/** Absolute relative delta that blocks Accept (file total vs computed). */
export const RECONCILIATION_BLOCK_PCT = 0.005

/** Per-line derived-vs-stated warning threshold (never blocks). */
export const DERIVED_WARNING_PCT = 0.005

export function isMoneyTarget(canon: string): boolean {
  return (MONEY_TARGETS as readonly string[]).includes(canon)
}

export function parseMoneyCell(raw: string): number | null {
  const t = String(raw ?? "")
    .replace(/[$,\s]/g, "")
    .trim()
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type ReconciliationGate = {
  ok: boolean
  /** Absolute dollars |computed − stated|. */
  delta: number | null
  /** Relative |computed − stated| / stated when stated > 0. */
  delta_pct: number | null
  reason: string | null
}

/**
 * File-total gate: when a stated total exists, Accept requires computed
 * within RECONCILIATION_BLOCK_PCT. Derived-vs-stated line warnings are separate.
 */
export function evaluateReconciliationGate(args: {
  total_media_amount: number
  file_stated_total: number | null
}): ReconciliationGate {
  const stated = args.file_stated_total
  if (stated == null || !(stated > 0)) {
    return { ok: true, delta: null, delta_pct: null, reason: null }
  }
  const delta = Math.abs(args.total_media_amount - stated)
  const delta_pct = delta / stated
  if (delta_pct > RECONCILIATION_BLOCK_PCT) {
    return {
      ok: false,
      delta,
      delta_pct,
      reason: `Computed media $${args.total_media_amount.toFixed(2)} diverges from file stated $${stated.toFixed(2)} by ${(delta_pct * 100).toFixed(2)}% (limit ${(RECONCILIATION_BLOCK_PCT * 100).toFixed(1)}%)`,
    }
  }
  return { ok: true, delta, delta_pct, reason: null }
}
