/**
 * P14 (B10 finding 1): a package line has no unit target, like a fixed-cost
 * buy. Pacing, client dashboards, decks and the CM360 estimate don't read a
 * package quantity as impressions, clicks or views.
 *
 * Tied to the `expert_package_quantity` switch: package quantities only reach
 * these readers once that switch saves them (live data on 3 Nov 2026 has no
 * digital, social, search or programmatic package line with a quantity). One
 * switch means the grids and the readers can't disagree. Off: every reader
 * acts exactly as before.
 */

export type PackageUnitTargetOptions = {
  /** True when `expert_package_quantity` is on. */
  packageNoUnitTarget?: boolean
}

export function isPackageBuyType(buyType: unknown): boolean {
  return String(buyType ?? "").trim().toLowerCase() === "package"
}

/** True only when the switch is on and the buy type is package. */
export function packageHasNoUnitTarget(buyType: unknown, options?: PackageUnitTargetOptions): boolean {
  return options?.packageNoUnitTarget === true && isPackageBuyType(buyType)
}

/** Burst fields the delivery readers take a planned deliverable from. */
const BURST_DELIVERABLE_KEYS = [
  "calculatedValue",
  "calculated_value_number",
  "deliverables",
  "deliverable",
  "deliverablesAmount",
  "conversions",
] as const

/**
 * B23fix: copies of the bursts with every deliverable field they carry set
 * to 0 when the rule applies (no keys added). Otherwise the same array,
 * untouched, so with the switch off every output is identical.
 */
export function burstsWithoutUnitTarget<T>(
  bursts: T[],
  buyType: unknown,
  options?: PackageUnitTargetOptions,
): T[] {
  if (!packageHasNoUnitTarget(buyType, options)) return bursts
  return bursts.map((b) => {
    if (!b || typeof b !== "object") return b
    const copy = { ...(b as Record<string, unknown>) }
    for (const key of BURST_DELIVERABLE_KEYS) {
      if (key in copy) copy[key] = 0
    }
    return copy as T
  })
}
