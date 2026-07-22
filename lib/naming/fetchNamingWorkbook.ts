import type { PlanGlobals } from "./fromPlan"
import type { NamingTokenPath } from "./generateFromPostedPlan"

export type FetchNamingWorkbookBody = {
  globals: PlanGlobals
  lineItems: Record<string, unknown[]>
  /** Optional — server fetches publishers (?full=1) by default. */
  publishers?: unknown[]
  /** Optional — server fetches media_container_best_practice by default. */
  containerBestPractice?: unknown[]
  options?: { useAva?: boolean; version?: string | number }
  version?: string | number
}

export type FetchNamingWorkbookResult = {
  blob: Blob
  fileName: string
  tokenPath: NamingTokenPath
}

/** Parse Content-Disposition filename (quoted or RFC5987). */
export function filenameFromContentDisposition(
  header: string | null | undefined,
  fallback = "naming.xlsx",
): string {
  if (!header) return fallback
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      // fall through
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header)
  if (quoted?.[1]) return quoted[1]
  const bare = /filename=([^;\s]+)/i.exec(header)
  if (bare?.[1]) return bare[1].replace(/^["']|["']$/g, "")
  return fallback
}

/**
 * POST unsaved plan state to /api/naming/generate and return the xlsx blob.
 * Server owns AVA tokens + publisher / best-practice reference data.
 * Do not send the full publisher list — omit publishers / containerBestPractice.
 */
export async function fetchNamingWorkbook(
  body: FetchNamingWorkbookBody,
): Promise<FetchNamingWorkbookResult> {
  // Strip reference payloads so the POST stays small (server fetches them).
  const { publishers: _p, containerBestPractice: _bp, ...rest } = body
  const res = await fetch("/api/naming/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rest),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string
      message?: string
    } | null
    throw new Error(
      data?.message || data?.error || `Naming generate failed (${res.status})`,
    )
  }

  const blob = await res.blob()
  const tokenHeader = (res.headers.get("X-Naming-Tokens") || "").trim().toLowerCase()
  const tokenPath: NamingTokenPath = tokenHeader === "ai" ? "ai" : "slug"
  const fileName = filenameFromContentDisposition(
    res.headers.get("Content-Disposition"),
    "naming.xlsx",
  )

  return { blob, fileName, tokenPath }
}
