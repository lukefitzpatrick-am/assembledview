import { NextRequest, NextResponse } from "next/server"

import { parseCspReports, takeCspReportSlot } from "@/lib/security/cspReport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024

function empty(status: number): NextResponse {
  return new NextResponse(null, { status })
}

/**
 * POST /api/csp-report — browsers send content security policy violations here
 * (S27, lib/security/headers). Public by design: browsers send reports without
 * a session, so middleware lets this path through. It holds no tenant data and
 * writes nothing but a log line. Rate limited, body capped, nothing echoed back.
 */
export async function POST(request: NextRequest) {
  if (!takeCspReportSlot()) return empty(429)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return empty(413)
  // shortcut: a body with no content-length is read whole before the cap; Vercel's 4.5 MB request limit bounds it.
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return empty(413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return empty(400)
  }
  const violations = parseCspReports(body)
  if (violations.length === 0) return empty(400)
  for (const v of violations) console.warn("[csp-report]", JSON.stringify(v))
  return empty(204)
}
