/**
 * Resolve posted MBA scope for savePlanVersion.
 * `mbaScope` wins when present. `selectedMonthYears` is a one-release legacy
 * alias for `mbaScope.monthYears` only — it does not override per-line approval.
 */

import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
} from "@/lib/finance/manualBillingOverridesUi"

export type MbaScopeBody = {
  lineItemIds: string[] | null
  monthYears: string[] | null
}

export type PersistedMbaScope = MbaScopeBody & {
  partial: boolean
}

export type ResolvedMbaScope =
  | { source: "mbaScope"; scope: MbaScopeBody }
  | { source: "legacyMonths"; monthYears: string[] }
  | { source: "absent" }

export function resolveMbaScopeInput(args: {
  mbaScope?: MbaScopeBody | null
  selectedMonthYears?: readonly string[] | null
}): ResolvedMbaScope {
  if (args.mbaScope) {
    return {
      source: "mbaScope",
      scope: {
        lineItemIds: args.mbaScope.lineItemIds,
        monthYears: args.mbaScope.monthYears,
      },
    }
  }
  const legacy = (args.selectedMonthYears ?? [])
    .map((m) => String(m).trim())
    .filter(Boolean)
  if (legacy.length > 0) {
    return { source: "legacyMonths", monthYears: legacy }
  }
  return { source: "absent" }
}

export function selectedMonthYearsForFinancials(
  resolved: ResolvedMbaScope
): readonly string[] | undefined {
  if (resolved.source === "mbaScope") {
    return resolved.scope.monthYears ?? undefined
  }
  if (resolved.source === "legacyMonths") {
    return resolved.monthYears
  }
  return undefined
}

export function applyMbaScopeLineApprovals<
  T extends { lineItemId: string; approval?: "approved" | "excluded" },
>(lines: readonly T[], lineItemIds: string[] | null): T[] {
  if (lineItemIds == null) {
    return lines.map((l) => ({ ...l, approval: "approved" as const }))
  }
  const allowed = buildCanonicalBillingLineIdSet(lineItemIds)
  return lines.map((l) => {
    const id = String(l.lineItemId).trim()
    return {
      ...l,
      approval: canonicalBillingLineIdSetHas(allowed, id)
        ? ("approved" as const)
        : ("excluded" as const),
    }
  })
}

export function isCountableMbaScopeLine(line: {
  lineItemId: string
  channel: string
}): boolean {
  const id = String(line.lineItemId).trim()
  if (!id || id.startsWith("__service__")) return false
  return line.channel !== "production"
}

export function countableMbaScopeLineIds(
  lines: ReadonlyArray<{ lineItemId: string; channel: string }>
): string[] {
  return lines
    .filter(isCountableMbaScopeLine)
    .map((l) => String(l.lineItemId).trim())
}

export function billingMonthYearsFromSchedule(
  billingSchedule: ReadonlyArray<{ monthYear?: string | null }>
): string[] {
  const months = new Set<string>()
  for (const row of billingSchedule) {
    const key = String(row.monthYear ?? "").trim()
    if (key) months.add(key)
  }
  return [...months]
}

export function computeMbaScopePartial(args: {
  lineItemIds: string[] | null
  monthYears: string[] | null
  countableLineIds: readonly string[]
  allBillingMonthYears: readonly string[]
}): boolean {
  if (
    args.lineItemIds != null &&
    args.lineItemIds.length < args.countableLineIds.length
  ) {
    return true
  }
  if (
    args.monthYears != null &&
    args.monthYears.length < args.allBillingMonthYears.length
  ) {
    return true
  }
  return false
}

export function buildPersistedMbaScope(
  scope: MbaScopeBody,
  countableLineIds: readonly string[],
  allBillingMonthYears: readonly string[]
): PersistedMbaScope {
  return {
    lineItemIds: scope.lineItemIds,
    monthYears: scope.monthYears,
    partial: computeMbaScopePartial({
      lineItemIds: scope.lineItemIds,
      monthYears: scope.monthYears,
      countableLineIds,
      allBillingMonthYears,
    }),
  }
}

export function persistedMbaScopeFromResolved(
  resolved: ResolvedMbaScope,
  countableLineIds: readonly string[],
  allBillingMonthYears: readonly string[]
): PersistedMbaScope | null {
  if (resolved.source === "mbaScope") {
    return buildPersistedMbaScope(
      resolved.scope,
      countableLineIds,
      allBillingMonthYears
    )
  }
  if (resolved.source === "legacyMonths") {
    return buildPersistedMbaScope(
      { lineItemIds: null, monthYears: resolved.monthYears },
      countableLineIds,
      allBillingMonthYears
    )
  }
  return null
}
