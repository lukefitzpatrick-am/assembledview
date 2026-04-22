import { NextRequest, NextResponse } from "next/server"
import { parseSingleBillingMonthParam } from "@/lib/finance/billingApiParams"
import { resolveRelevantVersionAaMediaPlan } from "@/lib/finance/resolveRelevantVersionAaMediaPlan"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

function escapeDispositionFilename(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export async function GET(request: NextRequest) {
  const mbaRaw = request.nextUrl.searchParams.get("mba_number")
  const monthParsed = parseSingleBillingMonthParam(request.nextUrl.searchParams.get("billing_month"), {
    defaultWhenMissing: false,
  })

  if (!("ok" in monthParsed && monthParsed.ok)) {
    return NextResponse.json(monthParsed, { status: 400 })
  }

  const resolved = await resolveRelevantVersionAaMediaPlan(monthParsed.month, mbaRaw || "")
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, ...(resolved.field ? { field: resolved.field } : {}) },
      { status: resolved.status }
    )
  }

  const apiKey = process.env.XANO_API_KEY
  let upstream: Response
  try {
    upstream = await fetch(resolved.upstreamUrl, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    })
  } catch (e) {
    console.error("[finance-api] aa-media-plan upstream fetch error", {
      message: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json({ error: "Failed to reach file storage" }, { status: 502 })
  }

  if (!upstream.ok) {
    console.error("[finance-api] aa-media-plan upstream fetch failed", {
      status: upstream.status,
      url: resolved.upstreamUrl,
    })
    return NextResponse.json({ error: `Failed to fetch file (${upstream.status})` }, { status: 502 })
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  const fn = escapeDispositionFilename(resolved.filename)

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": resolved.contentType,
      "Content-Disposition": `attachment; filename="${fn}"`,
    },
  })
}
