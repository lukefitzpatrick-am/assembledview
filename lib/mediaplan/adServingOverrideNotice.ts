type OverrideBurst = {
  adServingRatePct?: number
  adServingImpressions?: number
}

type OverrideLineItem = {
  bursts?: OverrideBurst[]
}

function burstHasRealOverride(burst: OverrideBurst): boolean {
  return (
    (Number.isFinite(burst.adServingRatePct) &&
      (burst.adServingRatePct ?? 0) > 0) ||
    (Number.isFinite(burst.adServingImpressions) &&
      (burst.adServingImpressions ?? 0) > 0)
  )
}

export function expertApplyClearedAdServingOverride(
  prev: OverrideLineItem[],
  next: OverrideLineItem[]
): boolean {
  const prevHad = prev.some((lineItem) =>
    (lineItem.bursts ?? []).some(burstHasRealOverride)
  )

  if (!prevHad) return false

  const nextHas = next.some((lineItem) =>
    (lineItem.bursts ?? []).some(burstHasRealOverride)
  )

  return !nextHas
}
