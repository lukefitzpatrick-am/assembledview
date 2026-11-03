/**
 * MB-30 (B20): telemetry for old-id alias matching in edit's working billing.
 * Written to `app_notifications` under its own kind (decision Q5), through
 * the same route as the canonical dedupe guard
 * (`POST /api/billing-overrides/working-dedupe-anomaly`, tenant-gated).
 *
 * - `aliasAdoptions`: a working row took the current id of its line.
 * - `placeholderSkips`: a placeholder `new-N` row was not added to a bucket
 *   that already had rows (decision Q1).
 * - `savedPairs` (source `saved`, switch `billing_ghost_row_guard`): the
 *   loaded billing schedule holds an old id and its current id for the same
 *   line with money in the same month (decision Q16).
 *
 * Best effort and never throws. Each distinct report is sent once per page
 * session, because the merge runs again on every billing change.
 */

import type { BillingAliasReconcileEntry } from "@/lib/billing/appendAutoReferenceIntoWorking"

export const WORKING_BILLING_ALIAS_RECONCILE_KIND = "working_billing_alias_reconcile"

export type WorkingBillingAliasReconcileSource = "merge" | "attach" | "modal_open" | "saved"

export type WorkingBillingAliasSavedPair = {
  mediaKey: string
  oldId: string
  currentId: string
  months: Array<{ monthYear: string; oldAmount: number; currentAmount: number }>
  oldTotal: number
}

export type WorkingBillingAliasReconcileSummary = {
  aliasAdoptions: Array<{ mediaKey: string; fromId: string; toId: string; months: string[] }>
  placeholderSkips: Array<{ mediaKey: string; id: string; months: string[] }>
  savedPairs?: WorkingBillingAliasSavedPair[]
}

export type WorkingBillingAliasReconcilePayload = WorkingBillingAliasReconcileSummary & {
  kind: typeof WORKING_BILLING_ALIAS_RECONCILE_KIND
  versionId: number | string
  mba: string
  source: WorkingBillingAliasReconcileSource
  timestamp: string
}

/** One row per line (media key and ids), with the months it happened in, sorted. */
export function summariseAliasReconcileEntries(
  entries: readonly BillingAliasReconcileEntry[]
): WorkingBillingAliasReconcileSummary {
  const adoptions = new Map<string, { mediaKey: string; fromId: string; toId: string; months: Set<string> }>()
  const skips = new Map<string, { mediaKey: string; id: string; months: Set<string> }>()
  for (const e of entries) {
    if (e.kind === "alias_adoption") {
      const key = `${e.mediaKey}\u0000${e.fromId}\u0000${e.toId}`
      const row = adoptions.get(key) ?? { mediaKey: e.mediaKey, fromId: e.fromId, toId: e.toId, months: new Set() }
      if (e.monthYear) row.months.add(e.monthYear)
      adoptions.set(key, row)
    } else {
      const key = `${e.mediaKey}\u0000${e.id}`
      const row = skips.get(key) ?? { mediaKey: e.mediaKey, id: e.id, months: new Set() }
      if (e.monthYear) row.months.add(e.monthYear)
      skips.set(key, row)
    }
  }
  const byKey = <T extends { mediaKey: string }>(a: T, b: T, ka: string, kb: string) =>
    a.mediaKey === b.mediaKey ? ka.localeCompare(kb) : a.mediaKey.localeCompare(b.mediaKey)
  return {
    aliasAdoptions: [...adoptions.values()]
      .map((r) => ({ mediaKey: r.mediaKey, fromId: r.fromId, toId: r.toId, months: [...r.months].sort() }))
      .sort((a, b) => byKey(a, b, a.fromId, b.fromId)),
    placeholderSkips: [...skips.values()]
      .map((r) => ({ mediaKey: r.mediaKey, id: r.id, months: [...r.months].sort() }))
      .sort((a, b) => byKey(a, b, a.id, b.id)),
  }
}

export function buildWorkingBillingAliasReconcilePayload(input: {
  versionId: string | number
  mba: string
  source: WorkingBillingAliasReconcileSource
  summary: WorkingBillingAliasReconcileSummary
}): WorkingBillingAliasReconcilePayload {
  return {
    kind: WORKING_BILLING_ALIAS_RECONCILE_KIND,
    versionId: input.versionId,
    mba: input.mba,
    source: input.source,
    aliasAdoptions: input.summary.aliasAdoptions,
    placeholderSkips: input.summary.placeholderSkips,
    ...(input.summary.savedPairs && input.summary.savedPairs.length > 0
      ? { savedPairs: input.summary.savedPairs }
      : {}),
    timestamp: new Date().toISOString(),
  }
}

const sentThisSession = new Set<string>()

/** Test hook: forget what this session already sent. */
export function resetAliasReconcileSentForTests(): void {
  sentThisSession.clear()
}

/**
 * Summarise, skip when empty or already sent this session, then POST.
 * Returns the payload it sent, or null.
 */
export async function reportWorkingBillingAliasReconcile(input: {
  versionId: string | number
  mba: string
  source: WorkingBillingAliasReconcileSource
  entries: readonly BillingAliasReconcileEntry[]
  /** Ghost pairs found in the loaded schedule (source `saved`). */
  savedPairs?: readonly WorkingBillingAliasSavedPair[]
  fetchImpl?: typeof fetch
}): Promise<WorkingBillingAliasReconcilePayload | null> {
  const summary: WorkingBillingAliasReconcileSummary = {
    ...summariseAliasReconcileEntries(input.entries),
    ...(input.savedPairs && input.savedPairs.length > 0 ? { savedPairs: [...input.savedPairs] } : {}),
  }
  if (
    summary.aliasAdoptions.length === 0 &&
    summary.placeholderSkips.length === 0 &&
    (summary.savedPairs?.length ?? 0) === 0
  ) {
    return null
  }
  const onceKey = JSON.stringify([input.versionId, input.mba, input.source, summary])
  if (sentThisSession.has(onceKey)) return null
  sentThisSession.add(onceKey)
  const payload = buildWorkingBillingAliasReconcilePayload({
    versionId: input.versionId,
    mba: input.mba,
    source: input.source,
    summary,
  })
  console.info("[MB-30] working billing alias reconcile", payload)
  try {
    const res = await (input.fetchImpl ?? fetch)("/api/billing-overrides/working-dedupe-anomaly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn("[MB-30] failed to persist alias reconcile app_notifications", {
        status: res.status,
        versionId: payload.versionId,
        mba: payload.mba,
      })
    }
  } catch (err) {
    console.warn("[MB-30] failed to POST alias reconcile notification", {
      versionId: payload.versionId,
      mba: payload.mba,
      err: err instanceof Error ? err.message : err,
    })
  }
  return payload
}
