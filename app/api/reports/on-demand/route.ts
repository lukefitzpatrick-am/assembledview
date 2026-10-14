import { after, NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { logJob } from "@/lib/log"
import { resolveCampaignReportPeriod } from "@/lib/reports/campaignReport/periods"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { checkCampaignReportRateLimit } from "@/lib/reports/campaignReport/rateLimit"
import { resolvePublishedCampaignReport } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import { enqueueOnDemandDeckRow } from "@/lib/reports/deckJobs/onDemandDeckStore"
import { runOnDemandDeck } from "@/lib/reports/deckJobs/runOnDemandDeck"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const PERIOD_KINDS = new Set<CampaignReportPeriodKind>([
  "this_month",
  "last_month",
  "campaign_to_date",
  "custom",
])

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

function sessionEmail(session: { user?: { email?: string | null } } | null | undefined): string | null {
  const email = session?.user?.email
  if (typeof email !== "string") return null
  const trimmed = email.trim().toLowerCase()
  return trimmed || null
}

async function resolveWindow(
  mbaNumber: string,
  period: { kind: CampaignReportPeriodKind; start?: string; end?: string },
): Promise<{ startISO: string; endISO: string }> {
  let campaignStartISO: string | null = null
  let campaignEndISO: string | null = null
  if (period.kind === "campaign_to_date") {
    const published = await resolvePublishedCampaignReport(mbaNumber)
    if (!published?.campaignStartISO) {
      throw new Error("A published version is required")
    }
    campaignStartISO = published.campaignStartISO
    campaignEndISO = published.campaignEndISO
  }
  const resolved = resolveCampaignReportPeriod({
    kind: period.kind,
    campaignStartISO,
    campaignEndISO,
    customStartISO: period.start,
    customEndISO: period.end,
  })
  return resolved.current
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const sessionKey = gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
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
  if (!raw || typeof raw !== "object") return badRequest("Body must be a JSON object")
  const body = raw as Record<string, unknown>

  const mbaNumber = asString(body.mbaNumber, 64)
  if (!mbaNumber) return badRequest("mbaNumber is required")

  const period = readPeriod(body)
  if ("error" in period) return badRequest(period.error)

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  let window: { startISO: string; endISO: string }
  try {
    window = await resolveWindow(mbaNumber, period)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid period"
    return badRequest(message)
  }

  try {
    const queued = await enqueueOnDemandDeckRow({
      mbaNumber,
      periodStart: window.startISO,
      periodEnd: window.endISO,
      requestedByEmail: sessionEmail(gate.session),
    })
    after(async () => {
      logJob("[on-demand-deck] job start", { runId: queued.runId, mbaNumber })
      try {
        await runOnDemandDeck(queued.runId)
      } catch (err) {
        console.error("[on-demand-deck] job failed", err)
      } finally {
        logJob("[on-demand-deck] job end", { runId: queued.runId, mbaNumber })
      }
    })
    return NextResponse.json({ runId: queued.runId, status: queued.status })
  } catch (err) {
    console.error("[on-demand-deck] create failed", err)
    return NextResponse.json({ error: "create_failed" }, { status: 502 })
  }
}
