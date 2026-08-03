/**
 * MB-14 — post-persist billing_overrides refetch contradiction.
 *
 * Persist reported success but refetch returned empty rows (or threw). Recovery
 * keeps prior meta so the draft stays usable; the contradiction must be loud.
 */

export const BILLING_OVERRIDES_REFETCH_ANOMALY_KIND =
  "billing_overrides_refetch_anomaly"
export const BILLING_OVERRIDES_REFETCH_ANOMALY_AUDIENCE = "admin"

export type BillingOverridesRefetchAnomalyReason =
  | "empty_after_persist"
  | "refetch_threw"

export type BillingOverridesRefetchAnomalyPayload = {
  versionId: number | string
  mba: string
  reason: BillingOverridesRefetchAnomalyReason
  replacedMedia: number
  replacedFee: number
  reset: number
  refetchRowCount?: number
  error?: string
  retainedPriorMeta: boolean
  timestamp: string
}

export type PostPersistOverrideMetaDecision = {
  /** Keep the meta that drove the successful persist (do not replace with empty). */
  retainPriorMeta: boolean
  shouldReportAnomaly: boolean
  reason?: BillingOverridesRefetchAnomalyReason
}

export function decidePostPersistOverrideMetaUpdate(args: {
  metaByLineSize?: number
  refetchRowCount?: number
  refetchThrew?: boolean
  errorMessage?: string
}): PostPersistOverrideMetaDecision {
  if (args.refetchThrew) {
    return {
      retainPriorMeta: true,
      shouldReportAnomaly: true,
      reason: "refetch_threw",
    }
  }
  const metaSize = args.metaByLineSize ?? 0
  if (metaSize > 0) {
    return { retainPriorMeta: false, shouldReportAnomaly: false }
  }
  return {
    retainPriorMeta: true,
    shouldReportAnomaly: true,
    reason: "empty_after_persist",
  }
}

export function buildBillingOverridesRefetchAnomalyPayload(input: {
  versionId: number | string
  mba: string
  reason: BillingOverridesRefetchAnomalyReason
  replacedMedia: number
  replacedFee: number
  reset: number
  refetchRowCount?: number
  error?: string
  retainedPriorMeta: boolean
  at?: Date
}): BillingOverridesRefetchAnomalyPayload {
  const payload: BillingOverridesRefetchAnomalyPayload = {
    versionId: input.versionId,
    mba: input.mba,
    reason: input.reason,
    replacedMedia: input.replacedMedia,
    replacedFee: input.replacedFee,
    reset: input.reset,
    retainedPriorMeta: input.retainedPriorMeta,
    timestamp: (input.at ?? new Date()).toISOString(),
  }
  if (input.refetchRowCount != null) {
    payload.refetchRowCount = input.refetchRowCount
  }
  if (input.error != null && input.error !== "") {
    payload.error = input.error
  }
  return payload
}

export function logBillingOverridesRefetchAnomaly(
  payload: BillingOverridesRefetchAnomalyPayload
): void {
  console.warn(
    "[manual-billing] post-persist override refetch anomaly — retaining prior meta",
    {
      versionId: payload.versionId,
      mba: payload.mba,
      reason: payload.reason,
      replacedMedia: payload.replacedMedia,
      replacedFee: payload.replacedFee,
      reset: payload.reset,
      refetchRowCount: payload.refetchRowCount,
      error: payload.error,
    }
  )
}

/**
 * Loud recovery: console.warn + best-effort POST to persist app_notifications.
 * Never throws — recovery must not crash the save success path.
 */
export async function reportBillingOverridesRefetchAnomaly(
  payload: BillingOverridesRefetchAnomalyPayload
): Promise<void> {
  logBillingOverridesRefetchAnomaly(payload)
  try {
    const res = await fetch("/api/billing-overrides/refetch-anomaly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(
        "[manual-billing] failed to persist refetch-anomaly app_notifications",
        { status: res.status, versionId: payload.versionId, mba: payload.mba }
      )
    }
  } catch (err) {
    console.warn(
      "[manual-billing] failed to POST refetch-anomaly notification",
      {
        versionId: payload.versionId,
        mba: payload.mba,
        err: err instanceof Error ? err.message : err,
      }
    )
  }
}
