import { NextResponse } from "next/server"
import { getCodexBaseUrl } from "@/lib/api/codex"
import {
  axiosErrorResponse,
  codexApiClient,
  requireCodexInternalAccess,
  retryApiCall,
  withOverallTimeout,
} from "../_shared"

export const runtime = "nodejs"

const FORWARD_QUERY_KEYS = [
  "page",
  "per_page",
  "client_id",
  "source",
  "mba_number",
] as const

function capPerPage(raw: string | null): string | null {
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return "1"
  return String(Math.min(Math.floor(n), 100))
}

export async function GET(request: Request) {
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const upstream = new URL(`${getCodexBaseUrl()}/client_notes`)

    for (const key of FORWARD_QUERY_KEYS) {
      const value = url.searchParams.get(key)
      if (value == null || value === "") continue
      if (key === "per_page") {
        const capped = capPerPage(value)
        if (capped) upstream.searchParams.set(key, capped)
        continue
      }
      upstream.searchParams.set(key, value)
    }

    const response = await withOverallTimeout(
      retryApiCall(() => codexApiClient.get(upstream.toString()))
    )

    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch codex client notes:", error)
    return axiosErrorResponse(error, "Failed to fetch client notes")
  }
}
