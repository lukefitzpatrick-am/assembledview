import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { assembleCampaignReportData } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
import { checkCampaignReportRateLimit } from "@/lib/reports/campaignReport/rateLimit"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const PERIOD_KINDS = new Set<CampaignReportPeriodKind>([
  "this_month",
  "last_month",
  "campaign_to_date",
  "custom",
])

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 })
}

function yyyymmdd(): string {
  return getMelbourneTodayISO().replace(/-/g, "")
}

function asString(value: unknown, max = 200): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  if (!s) return undefined
  return s.length <= max ? s : s.slice(0, max)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
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

  const periodKindRaw = asString(body.periodKind, 40)
  if (!periodKindRaw || !PERIOD_KINDS.has(periodKindRaw as CampaignReportPeriodKind)) {
    return badRequest(
      "periodKind must be this_month, last_month, campaign_to_date, or custom",
    )
  }
  const periodKind = periodKindRaw as CampaignReportPeriodKind

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  try {
    const payload = await assembleCampaignReportData({
      mbaNumber,
      clientName: asString(body.clientName, 120),
      campaignName: asString(body.campaignName, 200),
      versionNumber: asNumber(body.versionNumber),
      campaignStartISO: asString(body.campaignStartISO, 32),
      campaignEndISO: asString(body.campaignEndISO, 32),
      periodKind,
      customStartISO: asString(body.customStartISO, 32),
      customEndISO: asString(body.customEndISO, 32),
      mpSearchEnabled: body.mpSearchEnabled !== false,
    })

    const buf = await buildCampaignReportDeck(payload)
    const filename = campaignReportFilename({
      mbaNumber: payload.mbaNumber,
      periodSlug: payload.period.slug,
      yyyymmdd: yyyymmdd(),
    })

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
