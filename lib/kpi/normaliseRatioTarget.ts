/**
 * Ratio targets (ctr, conversion_rate, vtr, viewability): storage is decimal.
 * CPV is dollars — do not apply percent helpers to cpv.
 *
 * AV-25 v2: no magnitude heuristic. Legacy `>= 1` rows need dual-store migration.
 */
import { asStoredRatioDecimal } from "./percentUnits"

export function normaliseRatioTarget(target: number): number {
  return asStoredRatioDecimal(target)
}
