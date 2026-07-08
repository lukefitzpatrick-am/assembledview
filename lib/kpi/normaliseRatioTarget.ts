/**
 * Ratio targets (ctr, conversion_rate, vtr): legacy percentage-point form when >= 1
 * (4.5 means 4.5%, same as formatRatioAsPercent / kpiCellColor). CPV is dollars —
 * do not apply this heuristic to cpv.
 */
export function normaliseRatioTarget(target: number): number {
  return target >= 1 ? target / 100 : target;
}
