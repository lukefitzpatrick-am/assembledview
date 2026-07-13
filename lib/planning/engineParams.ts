/**
 * Tunable BCS coefficients — code defaults are the source of truth until
 * PLANNING_ENGINE_PARAMS is seeded; seed values must match these verbatim.
 *
 * Sources:
 * - weight_* → OBJECTIVE_PRESETS.consideration / createInitialState (store.ts)
 * - aff_scale, attn_scale, cost_scale → computeBcs (bcs-engine.ts)
 * - alloc_power, alloc_top_n → allocate (bcs-engine.ts)
 * - salience_*, gap_*, capture_*, create_*, weight_floor → deriveBcsParams (store.ts)
 */

export const CODE_ENGINE_PARAMS = {
  weight_A: 30,
  weight_T: 25,
  weight_E: 30,
  weight_C: 15,
  aff_scale: 0.7,
  attn_scale: 3.2,
  cost_scale: 18,
  alloc_power: 1.5,
  alloc_top_n: 8,
  salience_boost_high: 8,
  salience_boost_low: -6,
  gap_boost_cap: 12,
  gap_boost_factor: 0.25,
  capture_boost: 6,
  create_boost: -4,
  capture_threshold: 60,
  create_threshold: 30,
  weight_floor: 5,
} as const

export type EngineParamKey = keyof typeof CODE_ENGINE_PARAMS

export type EngineParams = { [K in EngineParamKey]: number }

/** Warehouse / meta shape — sparse map of param_key → number. */
export type EngineParamsMap = Partial<Record<string, number>>

export function resolveEngineParams(
  fromMeta: EngineParamsMap | null | undefined
): EngineParams {
  const resolved = { ...CODE_ENGINE_PARAMS } as EngineParams
  if (!fromMeta || Object.keys(fromMeta).length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[planning/engineParams] using code defaults (meta.engine_params absent or empty)"
      )
    }
    return resolved
  }

  const missing: string[] = []
  for (const key of Object.keys(CODE_ENGINE_PARAMS) as EngineParamKey[]) {
    const raw = fromMeta[key]
    if (typeof raw === "number" && Number.isFinite(raw)) {
      resolved[key] = raw
    } else {
      missing.push(key)
    }
  }
  if (missing.length > 0 && process.env.NODE_ENV === "development") {
    console.info(
      `[planning/engineParams] fallback to code defaults for: ${missing.join(", ")}`
    )
  }
  return resolved
}

export function defaultWeightsFromParams(params: EngineParams): {
  A: number
  T: number
  E: number
  C: number
} {
  return {
    A: params.weight_A,
    T: params.weight_T,
    E: params.weight_E,
    C: params.weight_C,
  }
}
