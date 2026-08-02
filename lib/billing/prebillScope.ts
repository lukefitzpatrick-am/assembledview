/**
 * MB-8 — Prebill scope (media-only vs media + fee) and badge vocabulary.
 */

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

export type PrebillScope = "media_only" | "media_and_fee"

/** Badge word for a line's prebill state — same string on container / line / timing editor. */
export type PrebillBadgeLabel = "Prepaid" | "Media prepaid"

export type PrebillBadgeFlags = {
  /** Media AND fee dumped to earliest month (reason=prepayment on both). */
  prepaid?: boolean
  /** Media-only prebill; fees still on delivery timing. */
  mediaPrepaid?: boolean
}

/**
 * Session memory for Prebill choice: last pick + per-line confirmations
 * inside one Adjust-timing draft session.
 */
export type PrebillScopeSessionMemory = {
  lastChoice: PrebillScope
  /** Canonical line_item_id → confirmed scope (skip re-prompt). */
  byLine: Map<string, PrebillScope>
}

export function createPrebillScopeSessionMemory(
  defaultChoice: PrebillScope = "media_only"
): PrebillScopeSessionMemory {
  return { lastChoice: defaultChoice, byLine: new Map() }
}

export function clearPrebillScopeSessionMemory(memory: PrebillScopeSessionMemory): void {
  memory.byLine.clear()
  memory.lastChoice = "media_only"
}

/** Return remembered scope for this line, or null if the user must choose. */
export function rememberedPrebillScope(
  memory: PrebillScopeSessionMemory,
  lineItemId: string
): PrebillScope | null {
  const canon = toBillingOverrideLineItemId(lineItemId)
  return memory.byLine.get(canon) ?? null
}

export function rememberPrebillScope(
  memory: PrebillScopeSessionMemory,
  lineItemId: string,
  scope: PrebillScope
): void {
  const canon = toBillingOverrideLineItemId(lineItemId)
  memory.byLine.set(canon, scope)
  memory.lastChoice = scope
}

export function prebillBadgeLabelFromFlags(
  flags: PrebillBadgeFlags
): PrebillBadgeLabel | null {
  if (flags.prepaid) return "Prepaid"
  if (flags.mediaPrepaid) return "Media prepaid"
  return null
}

export function prebillBadgeTooltip(label: PrebillBadgeLabel): string {
  if (label === "Prepaid") {
    return "Media and agency fee are billed up front (prepayment) rather than spread across delivery months."
  }
  return "Media is billed up front; agency fee stays on delivery timing."
}

/** Derive flags from override reasons (computeCampaignFinancials path). */
export function prebillFlagsFromOverrideReasons(
  mediaReason: string | undefined | null,
  feeReason: string | undefined | null
): { prepaid: boolean; mediaPrepaid: boolean } {
  const mediaPrepay = mediaReason === "prepayment"
  const feePrepay = feeReason === "prepayment"
  return {
    prepaid: mediaPrepay && feePrepay,
    mediaPrepaid: mediaPrepay && !feePrepay,
  }
}
