import { assignEntityColors } from "@/lib/charts/registry"

export type SpendTreemapInput = {
  name: string
  value: number
  percentage?: number
}

/** TreemapChart slices — spend by publisher/client with entity colours. */
export function reshapeSpendTreemap(
  data: SpendTreemapInput[],
  colorByName?: Record<string, string>,
): Array<{ label: string; value: number; color: string }> {
  const colorMap = assignEntityColors(
    data.map((d) => d.name),
    "media",
  )
  return data.map((d) => ({
    label: d.name,
    value: Number(d.value) || 0,
    color:
      colorByName?.[d.name] ??
      colorMap.get(d.name) ??
      "var(--av-axis)",
  }))
}

/** Sparkline datum rows from a numeric series. */
export function reshapeSparkline(values: number[]) {
  return values.map((value, idx) => ({ idx, value }))
}
