/**
 * Persist discrete performance-report insights into `campaign_insights`.
 *
 * Issued reports only (after a successful deck store). Preview / dry-run skip writes.
 * `execSummary` is a roll-up of the other fields — **not** persisted as its own row.
 * Insight writes are fail-soft: a DB / CHECK failure must never abort deck delivery.
 *
 * Allowed insight_type values (CHECK): delivery | audience | creative | channel | commercial.
 * No sixth type. Uncertain inference → delivery + confidence records the fallback.
 */
import { sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { CampaignInsightType } from "@/db/schema/insights"
import type { PerformanceReportPayload } from "@/lib/reports/buildPerformanceReport"

export type CampaignInsightInsert = {
  mbaNumber: string
  clientId: number
  period: string
  insightType: CampaignInsightType
  body: string
  source: "ava"
  confidence: string | null
  createdBy: string
}

export type PersistPerformanceReportInsightsInput = {
  narrative: Pick<
    PerformanceReportPayload,
    "keyInsight" | "insights" | "recsInFlight" | "recsNextPeriod"
  > & {
    /** Present on the payload but never written — documented intentionally. */
    execSummary?: string
  }
  mbaNumber: string
  reportMonth: string
  createdByEmail: string | undefined
  preview?: boolean
  dryRun?: boolean
}

export type PersistPerformanceReportInsightsDeps = {
  resolveClientIdFromMba: (mbaNumber: string) => Promise<number | null>
  insertInsight: (row: CampaignInsightInsert) => Promise<void>
  logError?: (err: unknown, context?: Record<string, unknown>) => void
}

export type PersistPerformanceReportInsightsResult = {
  attempted: number
  written: number
  skipped: boolean
  reason?: string
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const TYPE_FALLBACK_CONFIDENCE = "insight_type_fallback:delivery"

const TYPE_RULES: { type: CampaignInsightType; patterns: RegExp[] }[] = [
  {
    type: "creative",
    patterns: [
      /\bcreative\b/i,
      /\bfatigue\b/i,
      /\basset\b/i,
      /\bcopy\b/i,
      /\bformat\b/i,
      /\brotation\b/i,
    ],
  },
  {
    type: "audience",
    patterns: [
      /\baudience\b/i,
      /\bfrequency\b/i,
      /\breach\b/i,
      /\btarget(?:ing)?\b/i,
      /\bprospect(?:ing)?\b/i,
      /\bdemographic\b/i,
    ],
  },
  {
    type: "commercial",
    patterns: [
      /\bbudget\b/i,
      /\bfee\b/i,
      /\broi\b/i,
      /\bcpa\b/i,
      /\bcpc\b/i,
      /\bcpm\b/i,
      /\bcvr\b/i,
      /\bcommercial\b/i,
      /\bcost\b/i,
      /\befficien(?:cy|t)\b/i,
      /\bshift\s+\d+%\b/i,
    ],
  },
  {
    type: "channel",
    patterns: [
      /\bchannel\b/i,
      /\bsearch\b/i,
      /\bsocial\b/i,
      /\bmeta\b/i,
      /\btiktok\b/i,
      /\bbvod\b/i,
      /\bprogrammatic\b/i,
      /\booh\b/i,
      /\bradio\b/i,
      /\bmix\b/i,
    ],
  },
  {
    type: "delivery",
    patterns: [
      /\bdeliver(?:y|ed|ables?)?\b/i,
      /\bpacing\b/i,
      /\bunderspend\b/i,
      /\boverdeliver/i,
      /\bflight(?:ing)?\b/i,
      /\bimpressions?\b/i,
      /\bspend\b/i,
      /\binventory\b/i,
    ],
  },
]

/** Convert report month labels like "Jul 2026" into `YYYY-MM`. */
export function reportMonthToPeriod(reportMonth: string): string {
  const raw = String(reportMonth ?? "").trim()
  const iso = raw.match(/^(\d{4})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}`

  const named = raw.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (named) {
    const month = MONTH_INDEX[named[1]!.toLowerCase()]
    if (month) return `${named[2]}-${String(month).padStart(2, "0")}`
  }

  // Last resort: keep a stable lowercase slug so the write can still proceed.
  return raw.toLowerCase().replace(/\s+/g, "-").slice(0, 7) || "unknown"
}

export function inferInsightType(body: string): {
  insightType: CampaignInsightType
  confidence: string | null
} {
  const text = String(body ?? "").trim()
  const hits = TYPE_RULES.filter((rule) =>
    rule.patterns.some((re) => re.test(text)),
  ).map((rule) => rule.type)

  const unique = [...new Set(hits)]
  if (unique.length === 1) {
    return { insightType: unique[0]!, confidence: null }
  }
  // Prefer a non-delivery hit when mixed, else fall back.
  const preferred = unique.find((t) => t !== "delivery")
  if (preferred && unique.length <= 2) {
    return { insightType: preferred, confidence: null }
  }
  return {
    insightType: "delivery",
    confidence: TYPE_FALLBACK_CONFIDENCE,
  }
}

export function buildPerformanceReportInsightDrafts(input: {
  narrative: PersistPerformanceReportInsightsInput["narrative"]
  mbaNumber: string
  clientId: number
  reportMonth: string
  createdByEmail: string
}): CampaignInsightInsert[] {
  const mbaNumber = input.mbaNumber.trim().toLowerCase()
  const createdBy = input.createdByEmail.trim().toLowerCase()
  const period = reportMonthToPeriod(input.reportMonth)
  const bodies = [
    input.narrative.keyInsight,
    ...input.narrative.insights,
    input.narrative.recsInFlight,
    input.narrative.recsNextPeriod,
  ]

  return bodies.map((body) => {
    const inferred = inferInsightType(body)
    return {
      mbaNumber,
      clientId: input.clientId,
      period,
      insightType: inferred.insightType,
      body,
      source: "ava" as const,
      confidence: inferred.confidence,
      createdBy,
    }
  })
}

async function defaultResolveClientIdFromMba(mbaNumber: string): Promise<number | null> {
  const mba = mbaNumber.trim().toLowerCase()
  if (!mba) return null
  const [row] = await getDb()
    .select({ clientId: schema.mediaPlanMasters.clientId })
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba}`)
    .limit(1)
  const id = row?.clientId
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : null
}

async function defaultInsertInsight(row: CampaignInsightInsert): Promise<void> {
  await getDb().insert(schema.campaignInsights).values({
    mbaNumber: row.mbaNumber,
    clientId: row.clientId,
    period: row.period,
    insightType: row.insightType,
    body: row.body,
    source: row.source,
    confidence: row.confidence,
    createdBy: row.createdBy,
  })
}

function defaultLogError(err: unknown, context?: Record<string, unknown>): void {
  console.error("[performance-report] campaign_insights write failed", {
    ...context,
    error: err instanceof Error ? err.message : String(err),
  })
}

/**
 * Best-effort persist of discrete insights from an issued performance report.
 * Never throws — deck delivery owns the success path.
 */
export async function persistPerformanceReportInsights(
  input: PersistPerformanceReportInsightsInput,
  deps?: Partial<PersistPerformanceReportInsightsDeps>,
): Promise<PersistPerformanceReportInsightsResult> {
  const resolveClientIdFromMba =
    deps?.resolveClientIdFromMba ?? defaultResolveClientIdFromMba
  const insertInsight = deps?.insertInsight ?? defaultInsertInsight
  const logError = deps?.logError ?? defaultLogError

  if (input.preview || input.dryRun) {
    return { attempted: 0, written: 0, skipped: true, reason: "preview_or_dry_run" }
  }

  const email = String(input.createdByEmail ?? "").trim()
  if (!email) {
    logError(new Error("missing createdByEmail"), { mbaNumber: input.mbaNumber })
    return { attempted: 0, written: 0, skipped: true, reason: "missing_created_by" }
  }

  let clientId: number | null = null
  try {
    clientId = await resolveClientIdFromMba(input.mbaNumber)
  } catch (err) {
    logError(err, { stage: "resolve_client_id", mbaNumber: input.mbaNumber })
    return { attempted: 0, written: 0, skipped: true, reason: "client_id_resolve_failed" }
  }

  if (clientId == null) {
    logError(new Error("client_id not found for mba"), { mbaNumber: input.mbaNumber })
    return { attempted: 0, written: 0, skipped: true, reason: "client_id_missing" }
  }

  let drafts: CampaignInsightInsert[] = []
  try {
    drafts = buildPerformanceReportInsightDrafts({
      narrative: input.narrative,
      mbaNumber: input.mbaNumber,
      clientId,
      reportMonth: input.reportMonth,
      createdByEmail: email,
    })
  } catch (err) {
    logError(err, { stage: "build_drafts", mbaNumber: input.mbaNumber })
    return { attempted: 0, written: 0, skipped: true, reason: "build_failed" }
  }

  let written = 0
  for (const draft of drafts) {
    try {
      await insertInsight(draft)
      written += 1
    } catch (err) {
      logError(err, {
        stage: "insert",
        mbaNumber: draft.mbaNumber,
        insightType: draft.insightType,
      })
    }
  }

  return { attempted: drafts.length, written, skipped: false }
}
