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
import { and, eq, isNull, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { CampaignInsightOutcomeKind, CampaignInsightType } from "@/db/schema/insights"

type LegacyPerformanceNarrative = {
  keyInsight: string
  insights: readonly string[]
  recsInFlight: string
  recsNextPeriod: string
  execSummary?: string
  findings?: Array<PerformanceReportFinding | null | undefined>
}

export type PerformanceReportFinding = {
  action?: string | null
  actionOwner?: string | null
  action_owner?: string | null
  outcome?: string | null
  outcomeKind?: string | null
  outcome_kind?: string | null
}

export type CampaignInsightInsert = {
  mbaNumber: string
  clientId: number
  period: string
  insightType: CampaignInsightType
  body: string
  action: string | null
  actionOwner: string | null
  outcome: string | null
  outcomeKind: CampaignInsightOutcomeKind | null
  source: "ava"
  confidence: string | null
  createdBy: string
}

export type CommentaryInsightItem = {
  insight: string
  action: string
  actionOwner: string
  outcome: string
  outcomeKind: "achieved" | "expected"
}

export type PersistPerformanceReportInsightsInput = {
  narrative?: LegacyPerformanceNarrative
  /**
   * Review & Report items. One row each. The insight is the body. Action, owner
   * and outcome use the 0094 columns. Origin is stored on `confidence`.
   */
  commentaryItems?: CommentaryInsightItem[]
  mbaNumber: string
  reportMonth: string
  createdByEmail: string | undefined
  preview?: boolean
  dryRun?: boolean
}

export type PersistPerformanceReportInsightsDeps = {
  resolveClientIdFromMba: (mbaNumber: string) => Promise<number | null>
  insertInsight: (row: CampaignInsightInsert) => Promise<void>
  listExistingBodies?: (mbaNumber: string, period: string) => Promise<string[]>
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
const REVIEW_REPORT_ORIGIN = "origin:review-report"

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
  narrative: NonNullable<PersistPerformanceReportInsightsInput["narrative"]>
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

  return bodies.map((body, index) => {
    const inferred = inferInsightType(body)
    const finding = readFinding(input.narrative.findings?.[index])
    return {
      mbaNumber,
      clientId: input.clientId,
      period,
      insightType: inferred.insightType,
      body,
      action: finding.action,
      actionOwner: finding.actionOwner,
      outcome: finding.outcome,
      outcomeKind: finding.outcomeKind,
      source: "ava" as const,
      confidence: inferred.confidence,
      createdBy,
    }
  })
}

export function buildCommentaryInsightDrafts(input: {
  items: CommentaryInsightItem[]
  mbaNumber: string
  clientId: number
  reportMonth: string
  createdByEmail: string
}): CampaignInsightInsert[] {
  const mbaNumber = input.mbaNumber.trim().toLowerCase()
  const createdBy = input.createdByEmail.trim().toLowerCase()
  const period = reportMonthToPeriod(input.reportMonth)

  return input.items.flatMap((item) => {
    const body = item.insight.trim()
    if (!body) return []
    const inferred = inferInsightType(body)
    const confidence = inferred.confidence
      ? `${inferred.confidence}; ${REVIEW_REPORT_ORIGIN}`
      : REVIEW_REPORT_ORIGIN
    return [
      {
        mbaNumber,
        clientId: input.clientId,
        period,
        insightType: inferred.insightType,
        body,
        action: item.action.trim() || null,
        actionOwner: item.actionOwner.trim() || null,
        outcome: item.outcome.trim() || null,
        outcomeKind: item.outcomeKind,
        source: "ava" as const,
        confidence,
        createdBy,
      },
    ]
  })
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text : null
}

function readOutcomeKind(value: unknown): CampaignInsightOutcomeKind | null {
  if (value === "achieved" || value === "expected") return value
  return null
}

function readFinding(raw: PerformanceReportFinding | null | undefined): {
  action: string | null
  actionOwner: string | null
  outcome: string | null
  outcomeKind: CampaignInsightOutcomeKind | null
} {
  if (!raw) {
    return { action: null, actionOwner: null, outcome: null, outcomeKind: null }
  }
  return {
    action: readText(raw.action),
    actionOwner: readText(raw.actionOwner ?? raw.action_owner),
    outcome: readText(raw.outcome),
    outcomeKind: readOutcomeKind(raw.outcomeKind ?? raw.outcome_kind),
  }
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

async function defaultListExistingBodies(
  mbaNumber: string,
  period: string,
): Promise<string[]> {
  const mba = mbaNumber.trim().toLowerCase()
  const rows = await getDb()
    .select({ body: schema.campaignInsights.body })
    .from(schema.campaignInsights)
    .where(
      and(
        eq(schema.campaignInsights.mbaNumber, mba),
        eq(schema.campaignInsights.period, period),
        isNull(schema.campaignInsights.supersededBy),
      ),
    )
  return rows.map((row) => row.body)
}

async function defaultInsertInsight(row: CampaignInsightInsert): Promise<void> {
  await getDb().insert(schema.campaignInsights).values({
    mbaNumber: row.mbaNumber,
    clientId: row.clientId,
    period: row.period,
    insightType: row.insightType,
    body: row.body,
    action: row.action,
    actionOwner: row.actionOwner,
    outcome: row.outcome,
    outcomeKind: row.outcomeKind,
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
  const listExistingBodies = deps?.listExistingBodies ?? defaultListExistingBodies
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
    if (input.commentaryItems) {
      drafts = buildCommentaryInsightDrafts({
        items: input.commentaryItems,
        mbaNumber: input.mbaNumber,
        clientId,
        reportMonth: input.reportMonth,
        createdByEmail: email,
      })
    } else if (input.narrative) {
      drafts = buildPerformanceReportInsightDrafts({
        narrative: input.narrative,
        mbaNumber: input.mbaNumber,
        clientId,
        reportMonth: input.reportMonth,
        createdByEmail: email,
      })
    }
  } catch (err) {
    logError(err, { stage: "build_drafts", mbaNumber: input.mbaNumber })
    return { attempted: 0, written: 0, skipped: true, reason: "build_failed" }
  }

  let toWrite = drafts
  if (input.commentaryItems) {
    try {
      const existing = new Set(
        (await listExistingBodies(input.mbaNumber, reportMonthToPeriod(input.reportMonth))).map(
          (body) => body.trim(),
        ),
      )
      toWrite = drafts.filter((draft) => !existing.has(draft.body.trim()))
      if (drafts.length > 0 && toWrite.length === 0) {
        return {
          attempted: drafts.length,
          written: 0,
          skipped: true,
          reason: "duplicate_period",
        }
      }
    } catch (err) {
      logError(err, { stage: "list_existing", mbaNumber: input.mbaNumber })
      return { attempted: drafts.length, written: 0, skipped: true, reason: "list_existing_failed" }
    }
  }

  let written = 0
  for (const draft of toWrite) {
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
