import {
  paceVsExpected,
  windowPhrase,
  type PacingWindow,
} from "@/lib/pacing/expectedForWindow"
import type { ProgressCardProps } from "./ProgressCard"

/**
 * One delivery progress card compared with what was expected for the selected
 * window. Status, bar, % figure and variance all read delivered ÷ expected.
 * The whole-line planned total is shown for information only.
 */
export function paceProgressCard(input: {
  title: string
  delivered: number
  expected: number
  plannedTotal: number
  /** Campaign start to Melbourne yesterday, no filter. Defaults to `expected` when the window is not filtered. */
  expectedToDate?: number
  window: PacingWindow
  format: (value: number) => string
  sparkline?: number[]
  dense?: boolean
  titleTooltip?: string
  /** Lead word for the delivered figure ("Delivered", "Estimated", "Reported"). */
  lead?: string
  /** Big number; defaults to the formatted delivered figure. */
  value?: string
  /** Extra note appended to the detail line. */
  note?: string | null
}): ProgressCardProps {
  const {
    title,
    delivered,
    expected,
    plannedTotal,
    window,
    format,
    sparkline,
    dense,
    titleTooltip,
    lead = "Delivered",
    note,
  } = input
  const pace = paceVsExpected(delivered, expected)
  const phrase = windowPhrase(window)
  const parts = [
    `${lead} ${format(delivered)}`,
    `Expected ${format(expected)} ${phrase}`,
    `${format(plannedTotal)} planned in total`,
  ]
  if (note) parts.push(note)
  return {
    title,
    ...(titleTooltip ? { titleTooltip } : {}),
    value: input.value ?? format(delivered),
    detail: parts.join(" · "),
    progress: pace.progress,
    ...(pace.pct != null ? { pct: pace.pct } : {}),
    expected,
    expectedToDate: input.expectedToDate ?? (window.filtered ? undefined : expected),
    plannedTotal,
    variance: pace.variance,
    varianceLabel: `vs expected ${phrase}`,
    status: pace.status,
    ...(sparkline ? { sparkline } : {}),
    ...(dense ? { dense } : {}),
  }
}
