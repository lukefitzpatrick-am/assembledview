export type DonutSliceInput = { key: string; label?: string; value: number }

export type DonutSlice = {
  key: string
  label: string
  value: number
  percentage: number
}

const DEFAULT_OTHER_KEY = "other"

/** Collapse long tails into an "other" bucket for donut charts. */
export function buildDonutSlices(
  raw: DonutSliceInput[] | undefined,
  maxSlices: number,
  topNBeforeOther: number,
  labelFn: (key: string) => string = (k) => k,
): { slices: DonutSlice[]; total: number } {
  if (!raw?.length) return { slices: [], total: 0 }

  const rows = raw.map((r) => ({
    key: r.key,
    label: r.label?.trim() ? r.label : labelFn(r.key),
    value: Number(r.value) || 0,
  }))
  const positive = rows.filter((r) => r.value > 0)
  const total = positive.reduce((s, r) => s + r.value, 0)
  if (total <= 0) return { slices: [], total: 0 }

  const sorted = [...positive].sort((a, b) => b.value - a.value)

  let merged: Array<{ key: string; label: string; value: number }>
  if (sorted.length <= maxSlices) {
    merged = sorted
  } else {
    const top = sorted.slice(0, topNBeforeOther)
    const restSum = sorted.slice(topNBeforeOther).reduce((s, r) => s + r.value, 0)
    merged = [
      ...top,
      { key: DEFAULT_OTHER_KEY, label: "Other", value: restSum },
    ]
  }

  const slices: DonutSlice[] = merged.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    percentage: total > 0 ? (r.value / total) * 100 : 0,
  }))

  return { slices, total }
}
