import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"

export type ResolveAaMediaPlanResult =
  | { ok: true; upstreamUrl: string; filename: string; contentType: string }
  | { ok: false; status: number; error: string; field?: string }

function resolveXanoFileOrigin(): string | null {
  const keys = ["XANO_SAVE_FILE_BASE_URL", "XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
  for (const k of keys) {
    const v = process.env[k]
    if (v?.trim()) return v.replace(/\/$/, "")
  }
  return null
}

function buildPublicFileDownloadUrl(meta: Record<string, unknown>, fileOrigin: string): string | null {
  const directUrl = typeof meta.url === "string" && meta.url.trim() ? meta.url.trim() : null
  const path = typeof meta.path === "string" && meta.path.trim() ? meta.path.trim() : null
  if (directUrl) return directUrl
  if (path && fileOrigin) {
    return `${fileOrigin}${path.startsWith("/") ? "" : "/"}${path}`
  }
  return null
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_ .]/g, "_").trim().slice(0, 120) || "download"
}

/**
 * Finance billing uses the same “relevant version” rule: latest `version_number` per MBA whose
 * campaign overlaps the calendar month. Returns the stored `aa_media_plan` public file URL.
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

  if (!meta || typeof meta !== "object") {
    return {
      ok: false,
      status: 404,
      error: "AA media plan not uploaded for this plan/version.",
    }
  }

  const fileOrigin = resolveXanoFileOrigin()
  if (!fileOrigin) {
    return {
      ok: false,
      status: 503,
      error: "File storage base URL is not configured (e.g. XANO_SAVE_FILE_BASE_URL).",
    }
  }

  const upstreamUrl = buildPublicFileDownloadUrl(meta, fileOrigin)
  if (!upstreamUrl) {
    return {
      ok: false,
      status: 404,
      error: "AA media plan metadata is missing a download URL or path.",
    }
  }

  const filename =
    typeof meta.name === "string" && meta.name.trim()
      ? meta.name.trim()
      : `AA-${safeFilenamePart(mba)}-${billingMonth}.xlsx`

  const contentType =
    typeof meta.mime === "string" && meta.mime.trim()
      ? meta.mime.trim()
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

  return { ok: true, upstreamUrl, filename, contentType }
}
