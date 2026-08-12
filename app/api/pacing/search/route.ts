import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import { getUserRoles } from "@/lib/rbac"
import { getSearchPacingData } from "@/lib/snowflake/search-pacing-service"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
// NOTE: Vercel functions default to 15s; pacing can exceed this during cold warehouse resume.
export const maxDuration = 60

const INTERNAL_TIMEOUT_MS = 55_000

type RequestBody = {
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
}

async function readJsonBody(request: NextRequest): Promise<RequestBody> {
  const raw = await request.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as RequestBody
  } catch {
    throw new Error("Invalid JSON body")
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const t0 = Date.now()

  // Auth: keep aligned with app API expectations (JSON on unauthenticated requests).
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  // Resolve admin scope BEFORE parse failures (P3) — junk/legacy ids must not
  // give admins an opaque 403 ahead of role checks.
  const roles = getUserRoles(session.user)
  const isAdmin = roles.includes("admin")

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), INTERNAL_TIMEOUT_MS)

  try {
    const body = await readJsonBody(request)
    const rawLineItemIds = Array.isArray(body?.lineItemIds) ? body.lineItemIds : []

    // Derive MBA from each id server-side — never trust a client-supplied id→MBA map.
    const derivedMbas = new Set<string>()
    const parseableLineItemIds: string[] = []
    const unparseableLineItemIds: string[] = []

    for (const raw of rawLineItemIds) {
      const lineItemId = String(raw ?? "")
      const mba = parseMbaNumberFromLineItemId(lineItemId)
      if (!mba) {
        unparseableLineItemIds.push(lineItemId)
        continue
      }
      derivedMbas.add(mba)
      parseableLineItemIds.push(lineItemId)
    }

    if (unparseableLineItemIds.length > 0) {
      if (isAdmin) {
        console.warn("[api/pacing/search] skipping unparseable lineItemIds", {
          requestId,
          unparseableLineItemIds,
        })
      } else {
        // Client-role: fail-closed, but name which id failed to parse.
        return NextResponse.json(
          {
            error: "forbidden",
            message: "lineItemId failed to parse",
            failedLineItemId: unparseableLineItemIds[0],
            failedLineItemIds: unparseableLineItemIds,
          },
          { status: 403 },
        )
      }
    }

    for (const mba of derivedMbas) {
      const access = await checkClientMbaAccess(request, mba)
      if (!access.ok) return access.response
    }

    const data = await getSearchPacingData({
      lineItemIds: parseableLineItemIds,
      startDate: body?.startDate,
      endDate: body?.endDate,
      requestId,
      signal: ac.signal,
    })

    // Maintain route semantics: validation errors should be 400.
    if (data?.error) {
      const msg = String(data.error)
      const isBadRequest =
        msg.includes("lineItemIds is required") || msg.includes("Invalid date range") || msg.includes("endDate must be")
      if (isBadRequest) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
    }

    const response = NextResponse.json(data)
    response.headers.set("Cache-Control", "no-store, max-age=0")

    if (process.env.NODE_ENV !== "production") {
      console.info("[api/pacing/search] done", {
        requestId,
        startDate: body?.startDate ?? null,
        endDate: body?.endDate ?? null,
        lineItemIdsCount: parseableLineItemIds.length,
        skippedUnparseable: unparseableLineItemIds.length,
        daily: Array.isArray(data?.daily) ? data.daily.length : 0,
        ms: Date.now() - t0,
      })
    }

    return response
  } catch (err) {
    const isAbortError = Boolean(err && typeof err === "object" && (err as any).name === "AbortError")
    if (isAbortError || ac.signal.aborted) {
      return NextResponse.json({ error: "Timed out" }, { status: 504 })
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/pacing/search] error", { requestId, ms: Date.now() - t0, message })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  } finally {
    clearTimeout(timer)
  }
}
