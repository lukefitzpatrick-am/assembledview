/**
 * MB-9 — one vocabulary for manual billing status across header, container pills,
 * line badges, and timing editor. Conceptual state → display word (same string everywhere).
 *
 * Mapping (commit message / brain):
 *   manual timing          → Manual
 *   prepaid (media)        → Media prepaid
 *   prepaid (media + fee)  → Prepaid
 *   fee adjusted           → Fee adjusted
 *   client pays            → Client pays
 */

import {
  prebillBadgeLabelFromFlags,
  prebillBadgeTooltip,
  type PrebillBadgeFlags,
  type PrebillBadgeLabel,
} from "@/lib/billing/prebillScope"

export const MANUAL_BILLING_VOCAB = {
  manualTiming: "Manual",
  prepaidMedia: "Media prepaid",
  prepaidMediaAndFee: "Prepaid",
  feeAdjusted: "Fee adjusted",
  clientPays: "Client pays",
} as const

export type ManualBillingStatusLabel =
  | (typeof MANUAL_BILLING_VOCAB)[keyof typeof MANUAL_BILLING_VOCAB]

export function manualTimingBadgeLabel(): typeof MANUAL_BILLING_VOCAB.manualTiming {
  return MANUAL_BILLING_VOCAB.manualTiming
}

export function feeAdjustedBadgeLabel(): typeof MANUAL_BILLING_VOCAB.feeAdjusted {
  return MANUAL_BILLING_VOCAB.feeAdjusted
}

export function clientPaysBadgeLabel(): typeof MANUAL_BILLING_VOCAB.clientPays {
  return MANUAL_BILLING_VOCAB.clientPays
}

/** Line / container / timing prebill word — same as {@link prebillBadgeLabelFromFlags}. */
export function prebillStatusLabelFromFlags(
  flags: PrebillBadgeFlags
): PrebillBadgeLabel | null {
  return prebillBadgeLabelFromFlags(flags)
}

export { prebillBadgeTooltip }

/** Calm campaign-level header: "Manual billing — 1 line" / "Manual billing — N lines". */
export function manualBillingHeaderLabel(manualLineCount: number): string {
  const n = Math.max(0, Math.floor(manualLineCount))
  if (n === 1) return "Manual billing — 1 line"
  return `Manual billing — ${n} lines`
}
