/**
 * AVA writes Insight, Action and Outcome commentary for the campaign report.
 * Numbers must already be in the assembled report, the published campaign read,
 * or the live priors. A failed draft is retried once. Timeout or a second
 * failure returns null. Nothing is invented.
 */
import "server-only"

import { getAnthropicClient, AVA_MODEL } from "@/lib/ava/anthropic"
import { buildLoadSkillPayload } from "@/lib/ava/tools/loadSkill"
import { getPublishedCampaignRead } from "@/lib/campaign-read/repo"
import { listRecentLiveInsightsForMba } from "@/lib/insights/queryCampaignInsights"
import {
  findUnattributedPriorRestatement,
  type PriorInsightRef,
} from "@/lib/insights/priorInsightGuard"
import { findInventedMoneyInNarrative } from "@/lib/reports/performanceReportHardNumbers"
import {
  formatReportCtr,
  formatReportInt,
  formatReportMoney,
  formatReportPace,
  formatReportRate,
} from "@/lib/reports/campaignReport/formatters"
import type {
  CampaignReportPayload,
  ReportCommentary,
} from "@/lib/reports/campaignReport/assembleCampaignReportData"
import type { ResolvedCampaignReportPeriod } from "@/lib/reports/campaignReport/periods"
import { z } from "zod"

const TIMEOUT_MS = 60_000
const COMMENTARY_SKILL = "assembled-insight-commentary"
const REPORT_SKILL = "assembled-performance-review-report"

const commentarySchema = z.object({
  summary: z.string().min(1).max(160),
  items: z
    .array(
      z.object({
        insight: z.string().min(1).max(240),
        action: z.string().min(1).max(160),
        actionOwner: z.string().min(1).max(40),
        outcome: z.string().min(1).max(160),
        outcomeKind: z.enum(["achieved", "expected"]),
      }),
    )
    .min(2)
    .max(4),
})

export type GenerateReportCommentaryInput = {
  mbaNumber: string
  period: ResolvedCampaignReportPeriod
  reportData: CampaignReportPayload
}

export type CommentaryCompletion = (input: {
  system: string
  user: string
  signal: AbortSignal
}) => Promise<string>

export type GenerateReportCommentaryDeps = {
  complete?: CommentaryCompletion
  loadPriors?: (mbaNumber: string) => Promise<PriorInsightRef[]>
  loadPublishedRead?: (
    mbaNumber: string,
    versionNumber: number | null,
  ) => Promise<string | null>
  timeoutMs?: number
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
}

function extractSection(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(heading)
  if (start < 0) return null
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(/\n## /)
  const body = next < 0 ? rest : rest.slice(0, next)
  return `${heading}${body}`.trim()
}

function skillContent(skillId: string): string | null {
  const payload = buildLoadSkillPayload(skillId)
  if ("error" in payload && payload.error) {
    console.error("[campaign-report] skill load failed", { skillId, error: payload.error })
    return null
  }
  return payload.content ?? null
}

export function buildCommentarySystemPrompt(): string | null {
  const commentary = skillContent(COMMENTARY_SKILL)
  const report = skillContent(REPORT_SKILL)
  if (!commentary || !report) return null

  const stage =
    extractSection(report, "## Stage 3") ??
    extractSection(report, "## Stage 2: commentary")
  if (!stage) {
    console.error("[campaign-report] commentary stage missing from report skill")
    return null
  }

  return [
    commentary,
    stage,
    [
      "The app is building the Review & Report deck with no chat step.",
      "Reply with one JSON object only. No preamble and no markdown fence.",
      "Shape: { summary: string, items: { insight, action, actionOwner, outcome, outcomeKind }[] }.",
      "items length is 2 to 4. outcomeKind is achieved or expected.",
      "Caps: summary 160, insight 240, action 160, outcome 160, actionOwner 40 characters.",
      "Every dollar amount and every percent must already appear in the user message. Do not compute a new figure.",
      "Do not restate a prior insight unless the same sentence says what was believed before and what has changed.",
      "If a needed figure is missing, say it is not available. Never invent a number.",
    ].join(" "),
  ].join("\n\n")
}

function pctDisplay(fraction: number | null): string | null {
  if (fraction == null || !Number.isFinite(fraction)) return null
  return `${(fraction * 100).toFixed(1)}%`
}

function metricDisplays(metrics: CampaignReportPayload["totals"]["metrics"]) {
  return {
    cpmDisplay: formatReportRate(metrics.cpm),
    cpcDisplay: formatReportRate(metrics.cpc),
    ctrDisplay: formatReportCtr(metrics.ctr),
    spendPaceDisplay: formatReportPace(metrics.spendPacePct),
    videoViews3sDisplay:
      metrics.videoViews3s == null ? null : formatReportInt(metrics.videoViews3s),
  }
}

function modelView(payload: CampaignReportPayload) {
  return {
    mbaNumber: payload.mbaNumber,
    clientName: payload.clientName,
    campaignName: payload.campaignName,
    asOf: payload.asOf,
    period: payload.period,
    totals: {
      ...payload.totals,
      spendDisplay: formatReportMoney(payload.totals.spend),
      plannedDisplay: formatReportMoney(payload.totals.plannedBudget),
      previousSpendDisplay:
        payload.totals.previousSpend == null
          ? null
          : formatReportMoney(payload.totals.previousSpend),
      expectedSpendDisplay:
        payload.totals.expectedSpendToDate == null
          ? null
          : formatReportMoney(payload.totals.expectedSpendToDate),
      impressionsDisplay: formatReportInt(payload.totals.impressions),
      clicksDisplay: formatReportInt(payload.totals.clicks),
      timeElapsedDisplay: pctDisplay(payload.totals.timeElapsedPct),
      ...metricDisplays(payload.totals.metrics),
    },
    channels: payload.channels.map((channel) => ({
      ...channel,
      spendDisplay: formatReportMoney(channel.spend),
      plannedDisplay: formatReportMoney(channel.plannedBudget),
      previousSpendDisplay:
        channel.previousSpend == null ? null : formatReportMoney(channel.previousSpend),
      impressionsDisplay: formatReportInt(channel.impressions),
      ...metricDisplays(channel.metrics),
    })),
    kpis: payload.kpis.filter((kpi) => !kpi.omitted),
  }
}

function buildUserMessage(input: {
  view: ReturnType<typeof modelView>
  publishedRead: string | null
  priors: PriorInsightRef[]
  retryReasons?: string
}): string {
  const parts = [
    "Write the commentary from this input only.",
    "Report data:",
    JSON.stringify(input.view),
    input.publishedRead
      ? `Published campaign read:\n${input.publishedRead}`
      : "Published campaign read: none.",
    input.priors.length
      ? `Live priors from get_campaign_insights:\n${JSON.stringify(
          input.priors.map((prior) => ({ id: prior.id, body: prior.body })),
        )}`
      : "Live priors: none.",
  ]
  if (input.retryReasons) {
    parts.push(
      "The previous draft was rejected. Fix these points and return JSON only:",
      input.retryReasons,
    )
  }
  return parts.join("\n\n")
}

export function reportAllowedCorpus(
  payload: CampaignReportPayload,
  extras?: { publishedRead?: string | null; priors?: PriorInsightRef[] },
): string {
  return allowedCorpus({
    view: modelView(payload),
    publishedRead: extras?.publishedRead ?? null,
    priors: extras?.priors ?? [],
  })
}

/** Shape and length only. Money and prior-insight guards run against the assembled report. */
export function parseReportCommentary(
  raw: unknown,
): { ok: true; commentary: ReportCommentary } | { ok: false; reasons: string } {
  const parsed = commentarySchema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    return { ok: false, reasons: `JSON did not match ReportCommentary. ${detail}` }
  }

  const commentary: ReportCommentary = {
    summary: singleLine(parsed.data.summary),
    items: parsed.data.items.map((item) => ({
      insight: singleLine(item.insight),
      action: singleLine(item.action),
      actionOwner: singleLine(item.actionOwner),
      outcome: singleLine(item.outcome),
      outcomeKind: item.outcomeKind,
    })),
  }

  const lengthReasons: string[] = []
  if (commentary.summary.length > 160) lengthReasons.push("summary is over 160 characters")
  commentary.items.forEach((item, index) => {
    if (item.insight.length > 240) lengthReasons.push(`items.${index}.insight is over 240 characters`)
    if (item.action.length > 160) lengthReasons.push(`items.${index}.action is over 160 characters`)
    if (item.outcome.length > 160) lengthReasons.push(`items.${index}.outcome is over 160 characters`)
    if (item.actionOwner.length > 40) {
      lengthReasons.push(`items.${index}.actionOwner is over 40 characters`)
    }
  })
  if (lengthReasons.length) return { ok: false, reasons: lengthReasons.join("; ") }
  return { ok: true, commentary }
}

function allowedCorpus(input: {
  view: ReturnType<typeof modelView>
  publishedRead: string | null
  priors: PriorInsightRef[]
}): string {
  return [
    JSON.stringify(input.view),
    input.publishedRead ?? "",
    ...input.priors.map((prior) => prior.body),
  ].join("\n")
}

export function commentaryNarrativeFields(
  commentary: ReportCommentary,
): Record<string, string | string[]> {
  return {
    summary: commentary.summary,
    insight: commentary.items.map((item) => item.insight),
    action: commentary.items.map((item) => item.action),
    outcome: commentary.items.map((item) => item.outcome),
    actionOwner: commentary.items.map((item) => item.actionOwner),
  }
}

function validateCommentary(
  raw: unknown,
  corpus: string,
  priors: PriorInsightRef[],
): { ok: true; commentary: ReportCommentary } | { ok: false; reasons: string } {
  const parsed = parseReportCommentary(raw)
  if (!parsed.ok) return parsed
  const commentary = parsed.commentary

  const invented = findInventedMoneyInNarrative(commentaryNarrativeFields(commentary), corpus)
  if (invented) {
    return {
      ok: false,
      reasons: `Do not introduce ${invented.match} in ${invented.field}. Use only figures already in the input.`,
    }
  }

  const prior = findUnattributedPriorRestatement(commentaryNarrativeFields(commentary), priors)
  if (prior) {
    return {
      ok: false,
      reasons: `Do not restate prior insight ${prior.insightId} in ${prior.field} without saying what was believed before and what changed.`,
    }
  }

  return { ok: true, commentary }
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : trimmed) ?? ""
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("model reply had no JSON object")
  return JSON.parse(raw.slice(start, end + 1))
}

async function defaultComplete(input: {
  system: string
  user: string
  signal: AbortSignal
}): Promise<string> {
  const client = getAnthropicClient()
  const response = await client.messages.create(
    {
      model: AVA_MODEL,
      max_tokens: 1200,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    },
    { signal: input.signal },
  )
  const block = response.content.find((part) => part.type === "text")
  return block && block.type === "text" ? block.text : ""
}

async function defaultPriors(mbaNumber: string): Promise<PriorInsightRef[]> {
  try {
    const rows = await listRecentLiveInsightsForMba(mbaNumber, 15)
    return rows.map((row) => ({ id: row.id, body: row.body }))
  } catch (err) {
    console.error("[campaign-report] priors failed", {
      mbaNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

async function defaultPublishedRead(
  mbaNumber: string,
  versionNumber: number | null,
): Promise<string | null> {
  if (versionNumber == null || !Number.isFinite(versionNumber)) return null
  try {
    const read = await getPublishedCampaignRead(mbaNumber, versionNumber)
    const text = read?.bodyMarkdown?.trim()
    return text || null
  } catch (err) {
    console.error("[campaign-report] published read failed", {
      mbaNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function abortError(): Error {
  const err = new Error("commentary timed out")
  err.name = "AbortError"
  return err
}

async function completeWithin(
  complete: CommentaryCompletion,
  input: { system: string; user: string; signal: AbortSignal },
): Promise<string> {
  return await new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => reject(abortError())
    input.signal.addEventListener("abort", onAbort, { once: true })
    complete(input).then(
      (value) => {
        input.signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (err) => {
        input.signal.removeEventListener("abort", onAbort)
        reject(err)
      },
    )
  })
}

export async function generateReportCommentary(
  input: GenerateReportCommentaryInput,
  deps?: GenerateReportCommentaryDeps,
): Promise<ReportCommentary | null> {
  const started = Date.now()
  const timeoutMs = deps?.timeoutMs ?? TIMEOUT_MS
  let attempts = 0
  let outcome = "null"
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const system = buildCommentarySystemPrompt()
    if (!system) return null

    const loadPriors = deps?.loadPriors ?? defaultPriors
    const loadRead = deps?.loadPublishedRead ?? defaultPublishedRead
    const complete = deps?.complete ?? defaultComplete
    const [priors, publishedRead] = await Promise.all([
      loadPriors(input.mbaNumber),
      loadRead(input.mbaNumber, input.reportData.versionNumber),
    ])

    timer = setTimeout(() => controller.abort(), timeoutMs)
    const view = modelView(input.reportData)
    let retryReasons: string | undefined

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (controller.signal.aborted) return null
      attempts += 1
      const user = buildUserMessage({ view, publishedRead, priors, retryReasons })
      let text = ""
      try {
        text = await completeWithin(complete, {
          system,
          user,
          signal: controller.signal,
        })
      } catch (err) {
        const name = err instanceof Error ? err.name : ""
        if (name === "AbortError" || controller.signal.aborted) return null
        console.error("[campaign-report] commentary model failed", {
          mbaNumber: input.mbaNumber,
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      }

      let raw: unknown
      try {
        raw = parseModelJson(text)
      } catch (err) {
        retryReasons = err instanceof Error ? err.message : "Reply was not JSON."
        continue
      }

      const checked = validateCommentary(
        raw,
        allowedCorpus({ view, publishedRead, priors }),
        priors,
      )
      if (checked.ok) {
        outcome = "written"
        return checked.commentary
      }
      retryReasons = checked.reasons
    }

    return null
  } finally {
    if (timer) clearTimeout(timer)
    console.log("[campaign-report] commentary", {
      mba: input.mbaNumber,
      ms: Date.now() - started,
      attempts,
      outcome,
      timeoutMs,
    })
  }
}
