import "server-only"

import { runAvaAgent } from "@/lib/ava/agentLoop"
import { buildLoadSkillPayload } from "@/lib/ava/tools/loadSkill"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import type { PageContext } from "@/lib/ava/types"
import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import { fetchCampaignKpis } from "@/lib/kpi/campaignKpi"

import { parseCampaignReadAgentJson } from "./beats"
import { buildKpiReviewPayloadForRead } from "./kpiRead"
import { CAMPAIGN_READ_GENERATE_SURFACE } from "./generateTools"
import {
  completeCampaignReadDraft,
  failCampaignRead,
  failStaleGeneratingReads,
  insertCampaignReadGenerating,
} from "./repo"
import type { CampaignRead, CampaignReadBeats } from "./types"

export { CAMPAIGN_READ_GENERATE_TOOLS, CAMPAIGN_READ_GENERATE_SURFACE } from "./generateTools"

export type CampaignReadAgentResult = {
  replyText: string
  toolsCalled: string[]
  tokens: number
}

export type CampaignReadAgentRunner = (input: {
  systemPrompt: string
  userMessage: string
  context: AvaToolContext
}) => Promise<string | CampaignReadAgentResult>

function asAgentResult(value: string | CampaignReadAgentResult): CampaignReadAgentResult {
  if (typeof value === "string") {
    return { replyText: value, toolsCalled: [], tokens: 0 }
  }
  return {
    replyText: value.replyText,
    toolsCalled: value.toolsCalled ?? [],
    tokens: Number.isFinite(value.tokens) ? value.tokens : 0,
  }
}

async function defaultAgentRunner(input: {
  systemPrompt: string
  userMessage: string
  context: AvaToolContext
}): Promise<CampaignReadAgentResult> {
  const result = await runAvaAgent({
    systemPrompt: input.systemPrompt,
    messages: [{ role: "user", content: input.userMessage }],
    context: input.context,
    enableWebSearch: false,
  })
  return {
    replyText: result.replyText,
    toolsCalled: result.toolCalls.map((call) => call.name),
    tokens: result.usage.inputTokens + result.usage.outputTokens,
  }
}

function buildGenerateSystemPrompt(): string {
  const skill = buildLoadSkillPayload("assembled-campaign-read", "voice")
  if ("error" in skill && skill.error) {
    throw new Error(String(skill.error))
  }
  return [
    skill.content,
    "You are writing a stored campaign read, not a chat reply.",
    "Call only get_campaign_context, get_delivery_snapshot, and get_campaign_insights.",
    "Pace vs expected comes from the delivery snapshot totals (spend to date vs expected to date), not a portfolio pacing tool.",
    "Each delivery line has delivery_state reported | no_rows_yet | no_source | spend_only. no_source = has no delivery reporting connected yet. no_rows_yet = has not reported yet. spend_only = spend is fixed-cost accrual; no delivery reporting connected. spend_only spend counts in delivered and expected (same as the Where we are strip). Never treat no_source / no_rows_yet as zero delivery, and never pick them as worst when a reported line is behind.",
    "What was planned uses liveLineBudgetTotal (sum of live line budgets), stated as such — not the MBA booked total. Happened / vsPlan use reportedTotals (reported + spend_only spend).",
    "KPI best/worst only from review rows with eligibleForBestWorst true. Never narrate Not tracked for this source as zero, as worst, or as no conversions have landed.",
    "Coming up describes what needs to happen. Never promise follow-up or name a person or partner as being contacted.",
    "Then reply with JSON only — no preamble, no markdown headers.",
  ].join("\n\n")
}


export function buildCampaignReadPageContext(input: {
  mbaNumber: string
  versionNumber: number
  clientSlug?: string
}): PageContext {
  return {
    route: {
      pathname: `/dashboard/${input.clientSlug ?? "client"}/${input.mbaNumber}`,
      clientSlug: input.clientSlug,
      mbaSlug: input.mbaNumber,
    },
    entities: {
      mbaNumber: input.mbaNumber,
      versionNumber: input.versionNumber,
      clientSlug: input.clientSlug,
    },
    generatedAt: new Date().toISOString(),
    state: { surface: CAMPAIGN_READ_GENERATE_SURFACE, version: input.versionNumber },
  }
}

export async function writeCampaignReadFromAgent(input: {
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
  userSub?: string
  clientSlug?: string
  runAgent?: CampaignReadAgentRunner
}): Promise<{
  beats: CampaignReadBeats
  sources: string[] | null
  toolsCalled: string[]
  tokens: number
}> {
  const mbaNumber = input.mbaNumber.trim()
  const versionNumber = input.versionNumber

  let kpiPayload: unknown = []
  try {
    const [kpis, snapshot] = await Promise.all([
      fetchCampaignKpis(mbaNumber, versionNumber),
      loadDeliverySnapshot({ mbaNumber, versionNumber }),
    ])
    kpiPayload = buildKpiReviewPayloadForRead({
      channels: snapshot.channels,
      kpis,
    })
  } catch (err) {
    console.error("[campaign-read] KPI review load failed", {
      mbaNumber,
      versionNumber,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const pageContext = buildCampaignReadPageContext({
    mbaNumber,
    versionNumber,
    clientSlug: input.clientSlug,
  })

  const context: AvaToolContext = {
    pageContext,
    clientSlug: input.clientSlug,
    mbaNumber,
    versionNumber,
    enabledMediaTypes: undefined,
    userSub: input.userSub,
    userEmail: input.generatedByEmail,
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
  }

  const userMessage = [
    `Write the campaign read for MBA ${mbaNumber} version ${versionNumber}.`,
    "Campaign KPI review rows (buildKpiReview for this MBA — copy numbers, do not invent):",
    JSON.stringify(kpiPayload),
    "Pace vs expected: use get_delivery_snapshot totals (spend to date vs expected to date).",
    "Use liveLineBudgetTotal for What was planned. Use reportedTotals for delivered/expected (includes spend_only). Honour delivery_state. Best/worst KPIs only when eligibleForBestWorst is true.",
  ].join("\n")

  const runner = input.runAgent ?? defaultAgentRunner
  const result = asAgentResult(
    await runner({
      systemPrompt: buildGenerateSystemPrompt(),
      userMessage,
      context,
    }),
  )

  const parsed = parseCampaignReadAgentJson(result.replyText)
  return {
    beats: parsed.beats,
    sources: parsed.sources,
    toolsCalled: result.toolsCalled,
    tokens: result.tokens,
  }
}

/** @deprecated Prefer startCampaignReadGeneration + runCampaignReadJob. Kept for existing tests. */
export async function generateCampaignReadDraft(input: {
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
  userSub?: string
  clientSlug?: string
  runAgent?: CampaignReadAgentRunner
}): Promise<CampaignRead> {
  const pending = await insertCampaignReadGenerating({
    mbaNumber: input.mbaNumber,
    versionNumber: input.versionNumber,
    generatedByEmail: input.generatedByEmail,
  })
  return runCampaignReadJob({
    id: pending.id,
    mbaNumber: input.mbaNumber,
    versionNumber: input.versionNumber,
    generatedByEmail: input.generatedByEmail,
    userSub: input.userSub,
    clientSlug: input.clientSlug,
    runAgent: input.runAgent,
  })
}

export async function startCampaignReadGeneration(input: {
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
}): Promise<CampaignRead> {
  await failStaleGeneratingReads()
  return insertCampaignReadGenerating(input)
}

export async function runCampaignReadJob(input: {
  id: number
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
  userSub?: string
  clientSlug?: string
  runAgent?: CampaignReadAgentRunner
}): Promise<CampaignRead> {
  const started = Date.now()
  let toolsCalled: string[] = []
  let tokens = 0
  let outcome: "draft" | "failed" = "failed"
  try {
    const written = await writeCampaignReadFromAgent(input)
    toolsCalled = written.toolsCalled
    tokens = written.tokens
    const item = await completeCampaignReadDraft({
      id: input.id,
      beats: written.beats,
      sources: written.sources,
    })
    outcome = "draft"
    return item
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const failed = await failCampaignRead({ id: input.id, message })
    return failed
  } finally {
    console.log("[campaign-read] generate", {
      mba: input.mbaNumber,
      version: input.versionNumber,
      ms: Date.now() - started,
      tools: toolsCalled,
      tokens,
      outcome,
    })
  }
}
