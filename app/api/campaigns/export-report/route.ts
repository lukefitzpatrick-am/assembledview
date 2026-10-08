import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { generateCampaignReportForMba } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import { persistPerformanceReportInsights } from "@/lib/reports/persistPerformanceReportInsights"
import { checkCampaignReportRateLimit } from "@/lib/reports/campaignReport/rateLimit"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const PERIOD_KINDS = new Set<CampaignReportPeriodKind>([
  "this_month",
  "last_month",
  "campaign_to_date",
  "custom",
])

const IGNORED_BODY_FIELDS = [
  "clientName",
  "campaignName",
  "versionNumber",
  "campaignStartISO",
  "campaignEndISO",
  "mpSearchEnabled",
  "periodKind",
  "customStartISO",
  "customEndISO",
] as const

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 })
}

function asString(value: unknown, max = 200): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  if (!s) return undefined
  return s.length <= max ? s : s.slice(0, max)
}

function readPeriod(body: Record<string, unknown>):
  | { kind: CampaignReportPeriodKind; start?: string; end?: string }
  | { error: string } {
  const period = body.period
  if (period && typeof period === "object") {
    const record = period as Record<string, unknown>
    const kind = asString(record.kind, 40)
    if (!kind || !PERIOD_KINDS.has(kind as CampaignReportPeriodKind)) {
      return {
        error: "period.kind must be this_month, last_month, campaign_to_date, or custom",
      }
    }
    return {
      kind: kind as CampaignReportPeriodKind,
      start: asString(record.start, 32),
      end: asString(record.end, 32),
    }
  }

  const legacyKind = asString(body.periodKind, 40)
  if (legacyKind && PERIOD_KINDS.has(legacyKind as CampaignReportPeriodKind)) {
    return {
      kind: legacyKind as CampaignReportPeriodKind,
      start: asString(body.customStartISO, 32),
      end: asString(body.customEndISO, 32),
    }
  }

  return {
    error: "period.kind must be this_month, last_month, campaign_to_date, or custom",
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkCampaignReportRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many export requests. Try again in a minute.",
      },
      { status: 429 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  if (!raw || typeof raw !== "object") {
    return badRequest("Body must be a JSON object")
  }
  const body = raw as Record<string, unknown>

  const mbaNumber = asString(body.mbaNumber, 64)
  if (!mbaNumber) return badRequest("mbaNumber is required")

  const period = readPeriod(body)
  if ("error" in period) return badRequest(period.error)

  const ignored = IGNORED_BODY_FIELDS.filter((key) => body[key] != null && body[key] !== "")
  if (ignored.length > 0) {
    console.log("[export-report] deprecated body fields ignored", { mbaNumber, fields: ignored })
  }

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  try {
    const started = Date.now()
    const result = await generateCampaignReportForMba({
      mbaNumber,
      period,
      store: false,
      withCommentary: true,
    })
    console.log("[export-report] timing", {
      mbaNumber,
      ms: Date.now() - started,
      commentary: result.commentaryGenerated ? "written" : "null",
      skipped: result.skipped ?? null,
    })

    if (result.skipped) {
      return NextResponse.json(
        { error: "skipped", message: result.skipped },
        { status: 409 },
      )
    }

    if (result.commentary && result.commentary.items.length > 0) {
      const email = gate.session?.user?.email
      try {
        await persistPerformanceReportInsights({
          commentaryItems: result.commentary.items,
          mbaNumber,
          reportMonth: result.periodMonth,
          createdByEmail: typeof email === "string" ? email : undefined,
        })
      } catch (persistErr) {
        console.error("[export-report] insight persist failed", {
          mbaNumber,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        })
      }
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[export-report]", err)
    const message = err instanceof Error ? err.message : "Failed to build report"
    if (/required|must be|Invalid/i.test(message)) {
      return badRequest(message)
    }
    return NextResponse.json(
      { error: "export_failed", message },
      { status: 502 },
    )
  }
}
