import "server-only"

import { runAvaAgent } from "@/lib/ava/agentLoop"
import { buildLoadSkillPayload } from "@/lib/ava/tools/loadSkill"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import type { PageContext } from "@/lib/ava/types"
import { fetchCampaignKpis } from "@/lib/kpi/campaignKpi"

import { parseCampaignReadAgentJson } from "./beats"
import { insertCampaignReadDraft } from "./repo"
import type { CampaignRead } from "./types"

export type CampaignReadAgentRunner = (input: {
  systemPrompt: string
  userMessage: string
  context: AvaToolContext
}) => Promise<string>

async function defaultAgentRunner(input: {
  systemPrompt: string
  userMessage: string
  context: AvaToolContext
}): Promise<string> {
  const result = await runAvaAgent({
    systemPrompt: input.systemPrompt,
    messages: [{ role: "user", content: input.userMessage }],
    context: input.context,
    enableWebSearch: false,
  })
  return result.replyText
}

function buildGenerateSystemPrompt(): string {
  const skill = buildLoadSkillPayload("assembled-campaign-read", "voice")
  if ("error" in skill && skill.error) {
    throw new Error(String(skill.error))
  }
  return [
    skill.content,
    "You are writing a stored campaign read, not a chat reply.",
    "Call the paired tools first. Then reply with JSON only — no preamble, no markdown headers.",
  ].join("\n\n")
}

export async function generateCampaignReadDraft(input: {
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
  userSub?: string
  clientSlug?: string
  runAgent?: CampaignReadAgentRunner
}): Promise<CampaignRead> {
  const mbaNumber = input.mbaNumber.trim()
  const versionNumber = input.versionNumber

  let kpiPayload: unknown = []
  try {
    kpiPayload = await fetchCampaignKpis(mbaNumber, versionNumber)
  } catch (err) {
    console.error("[campaign-read] KPI load failed", {
      mbaNumber,
      versionNumber,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const pageContext: PageContext = {
    route: {
      pathname: `/dashboard/${input.clientSlug ?? "client"}/${mbaNumber}`,
      clientSlug: input.clientSlug,
      mbaSlug: mbaNumber,
    },
    entities: {
      mbaNumber,
      versionNumber,
      clientSlug: input.clientSlug,
    },
    generatedAt: new Date().toISOString(),
    state: { surface: "campaign-read-generate", version: versionNumber },
  }

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
    "Campaign KPIs (from campaign_kpi — copy numbers, do not invent):",
    JSON.stringify(kpiPayload),
  ].join("\n")

  const runner = input.runAgent ?? defaultAgentRunner
  const reply = await runner({
    systemPrompt: buildGenerateSystemPrompt(),
    userMessage,
    context,
  })

  const parsed = parseCampaignReadAgentJson(reply)
  return insertCampaignReadDraft({
    mbaNumber,
    versionNumber,
    beats: parsed.beats,
    sources: parsed.sources,
    generatedByEmail: input.generatedByEmail,
  })
}
