/**
 * Pure share-breakdown math for composition-chart legends.
 * Display-only — does not change planned/delivered totals.
 */

export interface ShareBreakdownItem {
  label: string
  value: number
  color: string
}

export interface ShareBreakdownRow {
  label: string
  value: number
  color: string
  /** Share of total, one decimal place. Rows sum to 100.0. */
  sharePct: number
  isOther?: boolean
}

const OTHER_CHIP = 'var(--muted-foreground)'

/**
 * Largest-remainder allocation so 1-decimal percentages sum to exactly 100.0.
 */
export function allocateSharePercents(values: number[], total: number): number[] {
  if (total <= 0 || values.length === 0) return values.map(() => 0)
  const exact = values.map((v) => (v / total) * 100)
  const floors = exact.map((e) => Math.floor(e * 10 + 1e-9) / 10)
  const floorSum = floors.reduce((s, n) => s + n, 0)
  let tenthsLeft = Math.round((100 - floorSum) * 10)
  const order = exact
    .map((e, i) => ({ i, frac: e - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const out = [...floors]
  let k = 0
  while (tenthsLeft > 0 && order.length > 0) {
    const idx = order[k % order.length]!.i
    out[idx] = Math.round((out[idx]! + 0.1) * 10) / 10
    tenthsLeft -= 1
    k += 1
  }
  while (tenthsLeft < 0 && order.length > 0) {
    const idx = order[(order.length - 1 - ((-tenthsLeft - 1) % order.length))]!.i
    if (out[idx]! >= 0.1) {
      out[idx] = Math.round((out[idx]! - 0.1) * 10) / 10
      tenthsLeft += 1
    } else {
      break
    }
  }
  return out
}

/**
 * Sort by value desc; collapse rows past maxRows into "Other (n)".
 * Returns null when total <= 0 (caller should render nothing).
 */
export function buildShareBreakdownRows(
  items: ShareBreakdownItem[],
  total: number,
  maxRows = 8,
): ShareBreakdownRow[] | null {
  if (!(total > 0) || !Number.isFinite(total)) return null
  const positive = items
    .filter((it) => it.value > 0 && Number.isFinite(it.value))
    .map((it) => ({
      label: it.label,
      value: it.value,
      color: it.color,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  if (positive.length === 0) return null

  let display: ShareBreakdownItem[]
  if (positive.length <= maxRows) {
    display = positive
  } else {
    const head = positive.slice(0, maxRows - 1)
    const rest = positive.slice(maxRows - 1)
    const otherValue = rest.reduce((s, r) => s + r.value, 0)
    display = [
      ...head,
      {
        label: `Other (${rest.length})`,
        value: otherValue,
        color: OTHER_CHIP,
      },
    ]
  }

  const percents = allocateSharePercents(
    display.map((d) => d.value),
    total,
  )

  return display.map((d, i) => ({
    label: d.label,
    value: d.value,
    color: d.color,
    sharePct: percents[i] ?? 0,
    isOther: d.label.startsWith('Other ('),
  }))
}
