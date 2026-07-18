import { roundMoney2 } from "@/lib/format/money"
import {
  CREATE_MEDIA_TOGGLE_KEYS,
  type CreateMediaToggleKey,
} from "@/lib/mediaplan/createMediaToggleKeys"

export const UNMAPPED_MP_KEY = "__unmapped__" as const

/**
 * Residual tie-break / display order — derived from create form catalog via
 * CREATE_MEDIA_TOGGLE_KEYS (not a hand-maintained twin).
 */
export const MP_KEY_ORDER = CREATE_MEDIA_TOGGLE_KEYS

export type { CreateMediaToggleKey }

export const ENGINE_TO_MP: Record<string, CreateMediaToggleKey | typeof UNMAPPED_MP_KEY> = {
  tv: "mp_television",
  paytv: "mp_television",
  bvod: "mp_bvod",
  svod: "mp_bvod", // revisit if product prefers mp_digivideo
  youtube: "mp_digivideo",
  radio: "mp_radio",
  streaming: "mp_digiaudio",
  podcasts: "mp_digiaudio",
  news_print: "mp_newspaper",
  news_digital: "mp_digidisplay",
  mags_print: "mp_magazines",
  mags_digital: "mp_digidisplay",
  ooh_street: "mp_ooh",
  ooh_billboard: "mp_ooh",
  ooh_shopping: "mp_ooh",
  ooh_transit: "mp_ooh",
  facebook: "mp_socialmedia",
  instagram: "mp_socialmedia",
  digital_other: UNMAPPED_MP_KEY,
  search: "mp_search",
  cinema: "mp_cinema",
}

export type EngineSplitChannel = {
  engine_channel_id: string
  pct: number
  dollars: number
}

export type CreateTargetRow = {
  mp_key: string
  dollars: number
  pct: number
}

export type MapSplitResult = {
  campaign_budget: number
  create_targets: CreateTargetRow[]
}

const DEFAULT_KNOWN = new Set<string>(CREATE_MEDIA_TOGGLE_KEYS)

function resolveMpKey(
  engineChannelId: string,
  knownCreateKeys: ReadonlySet<string>
): string {
  const mapped = ENGINE_TO_MP[engineChannelId] ?? UNMAPPED_MP_KEY
  if (mapped === UNMAPPED_MP_KEY) return UNMAPPED_MP_KEY
  if (!knownCreateKeys.has(mapped)) return UNMAPPED_MP_KEY
  return mapped
}

function orderIndex(mpKey: string): number {
  const i = MP_KEY_ORDER.indexOf(mpKey as CreateMediaToggleKey)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/** Largest dollars first; ties → earliest in MP_KEY_ORDER. Skip UNMAPPED. */
function mappedKeysByResidualPriority(buckets: Map<string, number>): string[] {
  return [...buckets.keys()]
    .filter((k) => k !== UNMAPPED_MP_KEY)
    .sort((a, b) => {
      const d = (buckets.get(b) ?? 0) - (buckets.get(a) ?? 0)
      if (d !== 0) return d
      return orderIndex(a) - orderIndex(b)
    })
}

/**
 * Apply signed residual to mapped buckets only; clamp ≥ 0; spill deficit.
 * Never use UNMAPPED as primary residual sink (only after all mapped are 0).
 */
function applyResidual(buckets: Map<string, number>, residual: number): void {
  let remaining = residual
  if (remaining === 0) return

  if (remaining > 0) {
    const mapped = mappedKeysByResidualPriority(buckets)
    const sink = mapped[0] ?? UNMAPPED_MP_KEY
    buckets.set(sink, roundMoney2((buckets.get(sink) ?? 0) + remaining))
    return
  }

  // Negative residual — subtract from largest mapped, clamp at 0, spill.
  for (const key of mappedKeysByResidualPriority(buckets)) {
    if (remaining >= 0) break
    const current = buckets.get(key) ?? 0
    const take = Math.min(current, -remaining)
    buckets.set(key, roundMoney2(current - take))
    remaining = roundMoney2(remaining + take)
  }

  if (remaining < 0) {
    const unmapped = buckets.get(UNMAPPED_MP_KEY) ?? 0
    const take = Math.min(unmapped, -remaining)
    buckets.set(UNMAPPED_MP_KEY, roundMoney2(unmapped - take))
    remaining = roundMoney2(remaining + take)
  }

  // If still negative after exhausting all buckets, pin largest mapped (or unmapped)
  // so sum stays honest only when absorbable — leftover deficit is a data bug.
  if (remaining < 0) {
    const mapped = mappedKeysByResidualPriority(buckets)
    const sink = mapped[0] ?? UNMAPPED_MP_KEY
    buckets.set(sink, roundMoney2((buckets.get(sink) ?? 0) + remaining))
    if ((buckets.get(sink) ?? 0) < 0) buckets.set(sink, 0)
  }
}

function rowsFromBuckets(
  buckets: Map<string, number>,
  campaignBudget: number
): CreateTargetRow[] {
  const keys: string[] = [
    ...MP_KEY_ORDER.filter((k) => buckets.has(k)),
    ...(buckets.has(UNMAPPED_MP_KEY) ? [UNMAPPED_MP_KEY] : []),
  ]
  // Include any unexpected keys (shouldn't happen) after known order
  for (const k of buckets.keys()) {
    if (!keys.includes(k)) keys.push(k)
  }

  return keys
    .filter((k) => (buckets.get(k) ?? 0) !== 0 || k === UNMAPPED_MP_KEY)
    .map((mp_key) => {
      const dollars = roundMoney2(buckets.get(mp_key) ?? 0)
      const pct =
        campaignBudget > 0 ? roundMoney2((dollars / campaignBudget) * 100) : 0
      return { mp_key, dollars, pct }
    })
    .filter((r) => r.dollars > 0 || r.mp_key === UNMAPPED_MP_KEY)
}

/**
 * Aggregate engine channels → create targets.
 * - Unknown engine id → UNMAPPED
 * - mp_key not in knownCreateKeys → UNMAPPED (stale freeze guard)
 * - roundMoney2 per contribution and per bucket
 * - residual (campaign_budget - sum) → largest mapped bucket; skip UNMAPPED;
 *   tie → first in MP_KEY_ORDER; clamp so no bucket goes < 0 (spill deficit)
 * - pct re-derived from reconciled dollars / campaign_budget
 */
export function mapEngineSplitToCreateTargets(
  channels: EngineSplitChannel[],
  opts: {
    campaignBudget?: number
    knownCreateKeys?: ReadonlySet<string>
  } = {}
): MapSplitResult {
  const knownCreateKeys = opts.knownCreateKeys ?? DEFAULT_KNOWN
  const buckets = new Map<string, number>()

  for (const ch of channels) {
    const mpKey = resolveMpKey(ch.engine_channel_id, knownCreateKeys)
    const contrib = roundMoney2(ch.dollars)
    buckets.set(mpKey, roundMoney2((buckets.get(mpKey) ?? 0) + contrib))
  }

  for (const [k, v] of [...buckets.entries()]) {
    buckets.set(k, roundMoney2(v))
  }

  const summed = roundMoney2(
    [...buckets.values()].reduce((s, v) => s + v, 0)
  )
  const campaign_budget = roundMoney2(
    opts.campaignBudget ?? summed
  )

  const residual = roundMoney2(
    campaign_budget -
      [...buckets.values()].reduce((s, v) => s + v, 0)
  )
  applyResidual(buckets, residual)

  // Drop zero unmapped if empty
  if ((buckets.get(UNMAPPED_MP_KEY) ?? 0) === 0) {
    buckets.delete(UNMAPPED_MP_KEY)
  }

  return {
    campaign_budget,
    create_targets: rowsFromBuckets(buckets, campaign_budget).filter(
      (r) => r.dollars > 0
    ),
  }
}

/**
 * Create-time: fold frozen mp_keys not in knownCreateKeys into UNMAPPED;
 * re-run residual so sum === campaign_budget.
 */
export function normalizeFrozenCreateTargets(
  rows: CreateTargetRow[],
  knownCreateKeys: ReadonlySet<string>,
  campaignBudget: number
): MapSplitResult {
  const buckets = new Map<string, number>()

  for (const row of rows) {
    const mpKey =
      row.mp_key === UNMAPPED_MP_KEY || knownCreateKeys.has(row.mp_key)
        ? row.mp_key
        : UNMAPPED_MP_KEY
    buckets.set(mpKey, roundMoney2((buckets.get(mpKey) ?? 0) + roundMoney2(row.dollars)))
  }

  const campaign_budget = roundMoney2(campaignBudget)
  const residual = roundMoney2(
    campaign_budget -
      [...buckets.values()].reduce((s, v) => s + v, 0)
  )
  applyResidual(buckets, residual)

  if ((buckets.get(UNMAPPED_MP_KEY) ?? 0) === 0) {
    buckets.delete(UNMAPPED_MP_KEY)
  }

  return {
    campaign_budget,
    create_targets: rowsFromBuckets(buckets, campaign_budget).filter(
      (r) => r.dollars > 0
    ),
  }
}
