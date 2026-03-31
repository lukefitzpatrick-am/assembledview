/**
 * =============================================================================
 * TODO: DELETE THIS FILE before going to production — diagnostic only.
 *       Exposes partial env metadata and live Xano reachability to admins.
 *       Remove `app/api/debug/env-check/` entirely once debugging is done.
 * =============================================================================
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { parseXanoListPayload } from "@/lib/api/xano"
import { getXanoClientsCollectionUrl, xanoMediaPlansUrl } from "@/lib/api/xanoClients"

export const runtime = "nodejs"

const FETCH_TIMEOUT_MS = 10_000

function previewEnvValue(value: string | undefined): { defined: boolean; preview: string } {
  if (value === undefined) {
    return { defined: false, preview: "undefined" }
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { defined: false, preview: "undefined" }
  }
  return {
    defined: true,
    preview: trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed,
  }
}

function collectXanoEnvEntries(): Array<{ key: string; defined: boolean; preview: string }> {
  const keys = Object.keys(process.env)
    .filter((k) => k.startsWith("XANO_"))
    .sort()
  return keys.map((key) => {
    const { defined, preview } = previewEnvValue(process.env[key])
    return { key, defined, preview }
  })
}

async function getWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const xanoEnvVars = collectXanoEnvEntries()

  let clientsUrl: string | null = null
  let clientsUrlError: string | null = null
  try {
    clientsUrl = getXanoClientsCollectionUrl()
  } catch (e) {
    clientsUrlError = e instanceof Error ? e.message : String(e)
  }

  let mediaPlanVersionsUrl: string | null = null
  let mediaPlanVersionsUrlError: string | null = null
  try {
    mediaPlanVersionsUrl = xanoMediaPlansUrl("media_plan_versions")
  } catch (e) {
    mediaPlanVersionsUrlError = e instanceof Error ? e.message : String(e)
  }

  let clientsFetch: {
    url: string
    status: number | null
    arrayLength: number | null
    error: string | null
  } = { url: clientsUrl ?? "", status: null, arrayLength: null, error: null }

  if (clientsUrl) {
    try {
      const res = await getWithTimeout(clientsUrl, {
        headers: { Accept: "application/json" },
      })
      clientsFetch.status = res.status
      if (res.ok) {
        const data = await res.json().catch(() => null)
        clientsFetch.arrayLength = parseXanoListPayload(data).length
      } else {
        clientsFetch.arrayLength = null
      }
    } catch (e) {
      clientsFetch.error = e instanceof Error ? e.message : String(e)
    }
  } else {
    clientsFetch.error = clientsUrlError ?? "clients URL not resolved"
  }

  let mediaPlanVersionsFetch: {
    url: string
    status: number | null
    error: string | null
  } = { url: mediaPlanVersionsUrl ?? "", status: null, error: null }

  if (mediaPlanVersionsUrl) {
    try {
      const res = await getWithTimeout(mediaPlanVersionsUrl, {
        headers: { Accept: "application/json" },
      })
      mediaPlanVersionsFetch.status = res.status
    } catch (e) {
      mediaPlanVersionsFetch.error = e instanceof Error ? e.message : String(e)
    }
  } else {
    mediaPlanVersionsFetch.error = mediaPlanVersionsUrlError ?? "media plan versions URL not resolved"
  }

  const clientRowFetch: {
    url: string
    status: number | null
    error: string | null
    note: string
  } = {
    url: clientsUrl ?? "",
    status: null,
    error: null,
    note: "fetchXanoClientRowByUrlSlug uses getXanoClientsCollectionUrl() — same URL as clients test",
  }

  if (clientsUrl) {
    try {
      const res = await getWithTimeout(clientsUrl, {
        headers: { Accept: "application/json" },
      })
      clientRowFetch.status = res.status
    } catch (e) {
      clientRowFetch.error = e instanceof Error ? e.message : String(e)
    }
  } else {
    clientRowFetch.error = clientsUrlError ?? "URL not resolved"
  }

  return NextResponse.json({
    xanoEnvVars,
    getXanoClientsCollectionUrl: {
      url: clientsUrl,
      error: clientsUrlError,
    },
    getClientDashboardDataMediaPlansUrl: {
      description:
        "Same as fetchMediaPlanVersionsArray / xanoMediaPlansUrl('media_plan_versions')",
      url: mediaPlanVersionsUrl,
      error: mediaPlanVersionsUrlError,
    },
    fetchTests: {
      clientsCollectionGet: clientsFetch,
      mediaPlanVersionsGet: mediaPlanVersionsFetch,
      fetchXanoClientRowByUrlSlugGet: clientRowFetch,
    },
  })
}
