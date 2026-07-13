import { NextRequest, NextResponse } from "next/server"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import { buildLoadSkillPayload } from "@/lib/ava/tools/loadSkill"
import { checkInsightRateLimit } from "@/lib/planning/insightRateLimit"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const STR_CAP = 200
const CHANNEL_CAP = 80

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 })
}

function asTrimmedString(value: unknown, max = STR_CAP): string | undefined {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => asTrimmedString(v))
    .filter((v): v is string => Boolean(v))
}

type InsightChannel = {
  label: string
  level1: string
  rowType: string
  reachPct: number
  index: number | null
  isRmMeasured: boolean
}

type InsightBody = {
  brief: {
    clientName?: string
    category?: string
    objectiveKind?: string
    budget?: number
    startDate?: string
    endDate?: string
  }
  audience: {
    name: string
    segmentLabel: string
    states: string[]
    gender: string
    ageBands: string[]
    reachBasis: string
  }
  stats: {
    audienceWc: number
    universeWc: number
    pctOfUniverse: number | null
    unweightedN: number
    robustnessLabel: string
    suppressedCells: number
    waveLabel: string
  }
  channels: InsightChannel[]
}

function parseBody(raw: unknown): { ok: true; body: InsightBody } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "Body must be a JSON object" }
  }
  const o = raw as Record<string, unknown>

  const briefRaw =
    o.brief && typeof o.brief === "object" ? (o.brief as Record<string, unknown>) : {}
  const audienceRaw =
    o.audience && typeof o.audience === "object"
      ? (o.audience as Record<string, unknown>)
      : null
  const statsRaw =
    o.stats && typeof o.stats === "object" ? (o.stats as Record<string, unknown>) : null
  if (!audienceRaw) return { ok: false, reason: "audience is required" }
  if (!statsRaw) return { ok: false, reason: "stats is required" }

  const name = asTrimmedString(audienceRaw.name)
  if (!name) return { ok: false, reason: "audience.name is required" }

  const channelsRaw = Array.isArray(o.channels) ? o.channels : []
  const channels: InsightChannel[] = []
  for (const row of channelsRaw.slice(0, CHANNEL_CAP)) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const label = asTrimmedString(r.label)
    if (!label) continue
    const reachPct = asNumber(r.reachPct)
    if (reachPct == null) continue
    const indexRaw = r.index
    const index =
      indexRaw == null ? null : asNumber(indexRaw) != null ? Math.round(asNumber(indexRaw)!) : null
    channels.push({
      label,
      level1: asTrimmedString(r.level1) ?? "Other",
      rowType: asTrimmedString(r.rowType) ?? "leaf",
      reachPct: Math.round(reachPct * 10) / 10,
      index,
      isRmMeasured: Boolean(r.isRmMeasured),
    })
  }

  return {
    ok: true,
    body: {
      brief: {
        clientName: asTrimmedString(briefRaw.clientName),
        category: asTrimmedString(briefRaw.category),
        objectiveKind: asTrimmedString(briefRaw.objectiveKind),
        budget: asNumber(briefRaw.budget),
        startDate: asTrimmedString(briefRaw.startDate),
        endDate: asTrimmedString(briefRaw.endDate),
      },
      audience: {
        name,
        segmentLabel: asTrimmedString(audienceRaw.segmentLabel) ?? "All People",
        states: asStringArray(audienceRaw.states).slice(0, 8),
        gender: asTrimmedString(audienceRaw.gender) ?? "all",
        ageBands: asStringArray(audienceRaw.ageBands).slice(0, 12),
        reachBasis: asTrimmedString(audienceRaw.reachBasis) ?? "addressable",
      },
      stats: {
        audienceWc: asNumber(statsRaw.audienceWc) ?? 0,
        universeWc: asNumber(statsRaw.universeWc) ?? 0,
        pctOfUniverse: asNumber(statsRaw.pctOfUniverse) ?? null,
        unweightedN: asNumber(statsRaw.unweightedN) ?? 0,
        robustnessLabel: asTrimmedString(statsRaw.robustnessLabel) ?? "Unknown",
        suppressedCells: asNumber(statsRaw.suppressedCells) ?? 0,
        waveLabel: asTrimmedString(statsRaw.waveLabel) ?? "",
      },
      channels,
    },
  }
}

const FRAMING = `You are AVA generating an in-page audience insight inside the Demand Flow planner. The JSON below is the planner's full composition for this audience: Roy Morgan channel-level reach % and affinity indexes (index 100 = national base) for every channel, plus the audience definition and robustness. This is channel-consumption composition — attitudinal/behavioural variables are not in this dataset, so do not invent them; note the limit in WATCH-OUTS. Follow the skill's output format. Australian English. No em dashes.`

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkInsightRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many insight requests. Try again in a minute.",
      },
      { status: 429 }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  const parsed = parseBody(raw)
  if (!parsed.ok) return badRequest(parsed.reason)

  const skillPayload = buildLoadSkillPayload("assembled-audience-insight")
  if ("error" in skillPayload && skillPayload.error) {
    return NextResponse.json(
      { error: "skill_unavailable", message: skillPayload.error },
      { status: 500 }
    )
  }

  const system = [skillPayload.content, "", FRAMING].join("\n")

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: AVA_MODEL,
      max_tokens: 1500,
      system,
      messages: [
        {
          role: "user",
          content: JSON.stringify(parsed.body),
        },
      ],
    })

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim()

    if (!text) {
      return NextResponse.json(
        { error: "generation_failed", message: "AVA returned an empty insight." },
        { status: 502 }
      )
    }

    return NextResponse.json({ insight: text })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: "upstream_failed", message },
      { status: 502 }
    )
  }
}
