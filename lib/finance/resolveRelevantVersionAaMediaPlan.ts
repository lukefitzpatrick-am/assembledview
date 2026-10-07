import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"

export type ResolveAaMediaPlanResult =
  | { ok: true; file: Record<string, unknown> }
  | { ok: false; status: number; error: string; field?: string }

/**
 * Finance billing uses the same relevant-version rule: latest `version_number` per MBA whose
 * campaign overlaps the calendar month. Returns the stored `aa_media_plan` jsonb.
 * The caller streams it through `servePlanFile` (stored http url only).
 */
export async function resolveRelevantVersionAaMediaPlan(
  billingMonth: string,
  mbaNumber: string
): Promise<ResolveAaMediaPlanResult> {
  const mba = String(mbaNumber ?? "").trim()
  if (!mba) {
    return { ok: false, status: 400, error: "mba_number is required.", field: "mba_number" }
  }

  const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(billingMonth)
  if ("error" in versionsResult) {
    return {
      ok: false,
      status: versionsResult.status,
      error: versionsResult.error,
      field: "billing_month",
    }
  }

  const versions = versionsResult.relevantVersions as Record<string, unknown>[]
  const row = versions.find((v) => String(v.mba_number ?? "").trim() === mba)
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: "No finance-relevant media plan version for this MBA and billing month.",
    }
  }

  const meta =
    (row.aa_media_plan as Record<string, unknown> | null | undefined) ??
    (row.aaMediaPlan as Record<string, unknown> | null | undefined)

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {
      ok: false,
      status: 404,
      error: "AA media plan not uploaded for this plan/version.",
    }
  }

  return { ok: true, file: meta }
}
