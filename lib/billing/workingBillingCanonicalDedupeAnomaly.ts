/**
 * MB-30 — durable audit when working-billing merge collapsed duplicate
 * canonical line ids. Ticket stays open; this is telemetry, not the fix.
 */

export const WORKING_BILLING_CANONICAL_DEDUPE_KIND =
  "working_billing_canonical_dedupe"
export const WORKING_BILLING_CANONICAL_DEDUPE_AUDIENCE = "admin"

export type WorkingBillingCanonicalDedupePayload = {
  versionId: number | string
  mba: string
  collapses: Array<{
    mediaKey: string
    monthYear: string
    canonicalId: string
    keptId: string
    droppedIds: string[]
  }>
  /** Template progBvod ids at append — helps distinguish new-N ghost vs id-field drift. */
  templateProgBvodIds?: string[]
  timestamp: string
}

export function buildWorkingBillingCanonicalDedupePayload(input: {
  versionId: string | number
  mba: string
  collapses: WorkingBillingCanonicalDedupePayload["collapses"]
  templateProgBvodIds?: string[]
}): WorkingBillingCanonicalDedupePayload {
  return {
    versionId: input.versionId,
    mba: input.mba,
    collapses: input.collapses,
    ...(input.templateProgBvodIds ? { templateProgBvodIds: input.templateProgBvodIds } : {}),
    timestamp: new Date().toISOString(),
  }
}

/**
 * Loud guard: console already fired in merge; best-effort POST app_notifications.
 * Never throws — must not break append.
 */
export async function reportWorkingBillingCanonicalDedupe(
  payload: WorkingBillingCanonicalDedupePayload
): Promise<void> {
  try {
    const res = await fetch("/api/billing-overrides/working-dedupe-anomaly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(
        "[MB-30] failed to persist working-dedupe app_notifications",
        { status: res.status, versionId: payload.versionId, mba: payload.mba }
      )
    }
  } catch (err) {
    console.warn("[MB-30] failed to POST working-dedupe notification", {
      versionId: payload.versionId,
      mba: payload.mba,
      err: err instanceof Error ? err.message : err,
    })
  }
}
