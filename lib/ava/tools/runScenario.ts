import type AvaTool from "./types"
import type {
  BackOnTrackPlan,
  KpiGoalInput,
  KpiGoalMetric,
  KpiGoalResult,
  ScenarioLevers,
  ScenarioLine,
  ScenarioResult,
} from "@/lib/pacing/scenario/types"
import { applyScenario } from "@/lib/pacing/scenario/applyScenario"
import { backOnTrackPlan } from "@/lib/pacing/scenario/backOnTrackPlan"
import { EMPTY_LEVERS } from "@/lib/pacing/scenario/emptyLevers"
import { kpiGoalPerDay } from "@/lib/pacing/scenario/kpiGoalPerDay"
import { narrate } from "@/lib/pacing/scenario/narrate"
import { getAsOfDate } from "@/lib/pacing/maths"
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
import {
  asNumber,
  asRecord,
  asString,
  isUnscopedAvaAccess,
  jsonContent,
  resolveScopedMba,
} from "./helpers"

const LINE_ALIASES: Record<string, string[]> = {
  search: ["search", "google", "google ads", "sem"],
  meta: ["meta", "facebook", "social"],
  facebook: ["meta", "facebook", "social"],
  social: ["social", "meta", "facebook", "tiktok"],
  tiktok: ["tiktok"],
  programmatic: ["programmatic", "dv360", "display"],
}

export type RunScenarioPayload = {
  result: ScenarioResult
  goal: KpiGoalResult | null
  plan: BackOnTrackPlan | null
  narrative: string
  rateNotes: string[]
}

export function matchScenarioLine(
  token: string,
  lines: readonly ScenarioLine[],
): ScenarioLine | undefined {
  const raw = token.trim().toLowerCase()
  if (!raw) return undefined
  const exact = lines.find((line) => line.lineItemId.toLowerCase() === raw)
  if (exact) return exact
  const needles = LINE_ALIASES[raw] ?? [raw]
  let best: { line: ScenarioLine; score: number } | undefined
  for (const line of lines) {
    const hay = `${line.channel} ${line.platform} ${line.lineItemId}`.toLowerCase()
    let score = 0
    for (const needle of needles) {
      if (hay.includes(needle)) score += needle.length
    }
    if (score > 0 && (!best || score > best.score)) best = { line, score }
  }
  return best?.line
}

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, "")
  const k = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/i)
  if (k) return Math.round(Number(k[1]) * 1000)
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseScenarioLeversFromPrompt(
  prompt: string,
  lines: readonly ScenarioLine[],
): ScenarioLevers {
  const levers: ScenarioLevers = {
    moves: [],
    caps: [],
    pauses: [],
    extendDays: 0,
    burstDateChanges: [],
  }
  const text = prompt.trim()

  const move = text.match(
    /move\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+and\b|$)/i,
  )
  if (move) {
    const amount = parseMoneyToken(move[1] ?? "")
    const from = matchScenarioLine(move[2] ?? "", lines)
    const to = matchScenarioLine(move[3] ?? "", lines)
    if (amount != null && amount > 0 && from && to && from.lineItemId !== to.lineItemId) {
      levers.moves.push({ from: from.lineItemId, to: to.lineItemId, amount })
    }
  }

  const cap = text.match(/cap\s+(.+?)\s+at\s+(\$?[\d,]+(?:\.\d+)?(?:\s*k)?)/i)
  if (cap) {
    const line = matchScenarioLine(cap[1] ?? "", lines)
    const dailyCap = parseMoneyToken(cap[2] ?? "")
    if (line && dailyCap != null && dailyCap > 0) {
      levers.caps.push({ lineItemId: line.lineItemId, dailyCap })
    }
  }

  const pause = text.match(/pause\s+(.+?)(?:\s+and\b|$)/i)
  if (pause) {
    const line = matchScenarioLine(pause[1] ?? "", lines)
    if (line) levers.pauses.push(line.lineItemId)
  }

  const extend = text.match(/extend(?:\s+by)?\s+(\d+)\s+days?/i)
  if (extend) {
    const days = Number(extend[1])
    if (Number.isFinite(days) && days > 0) levers.extendDays = days
  }

  return levers
}

function rateNotesFor(lines: readonly ScenarioLine[]): string[] {
  return lines.flatMap((line) => {
    if (!line.rate) {
      return [`${line.lineItemId} has no rate — deliverable conversion was skipped.`]
    }
    if (line.rate.basis === "plan") {
      return [`${line.lineItemId} used the plan rate (no delivered rate).`]
    }
    return []
  })
}

function findLine(
  lines: readonly ScenarioLine[],
  lineItemId: string | undefined,
): ScenarioLine | undefined {
  if (!lineItemId) return undefined
  const id = lineItemId.trim().toLowerCase()
  return lines.find((line) => line.lineItemId.toLowerCase() === id)
}

export function runScenarioFromLines(args: {
  lines: readonly ScenarioLine[]
  asOf: string
  levers?: ScenarioLevers
  goal?: { lineItemId: string; goal?: KpiGoalInput }
  backOnTrack?: { lineItemId: string; withinDays: number }
}): RunScenarioPayload {
  const levers = args.levers ?? EMPTY_LEVERS
  const result = applyScenario([...args.lines], levers, args.asOf)
  const goalLine = findLine(args.lines, args.goal?.lineItemId)
  const goal = goalLine ? kpiGoalPerDay(goalLine, args.goal?.goal) : null
  const planLine = findLine(args.lines, args.backOnTrack?.lineItemId)
  const plan =
    planLine && args.backOnTrack
      ? backOnTrackPlan(planLine, args.backOnTrack.withinDays)
      : null
  const rateNotes = rateNotesFor(args.lines)
  const narrative = [narrate(result), goal?.text, plan?.text, ...rateNotes]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
  return { result, goal, plan, narrative, rateNotes }
}

function parseMove(raw: unknown): ScenarioLevers["moves"][number] | null {
  const rec = asRecord(raw)
  const from = asString(rec.from)
  const to = asString(rec.to)
  const amount = asNumber(rec.amount)
  if (!from || !to || amount == null || amount === 0) return null
  return { from, to, amount }
}

function parseCap(raw: unknown): ScenarioLevers["caps"][number] | null {
  const rec = asRecord(raw)
  const lineItemId = asString(rec.lineItemId)
  const dailyCap = asNumber(rec.dailyCap)
  if (!lineItemId || dailyCap == null || dailyCap <= 0) return null
  return { lineItemId, dailyCap }
}

function parseBurstChange(
  raw: unknown,
): ScenarioLevers["burstDateChanges"][number] | null {
  const rec = asRecord(raw)
  const lineItemId = asString(rec.lineItemId)
  const index = asNumber(rec.index)
  const start = asString(rec.start)
  const end = asString(rec.end)
  if (!lineItemId || index == null || !start || !end) return null
  return { lineItemId, index, start, end }
}

function parseLeversArg(raw: unknown): ScenarioLevers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_LEVERS
  const rec = raw as Record<string, unknown>
  const moves = Array.isArray(rec.moves)
    ? rec.moves.map(parseMove).filter((row): row is NonNullable<typeof row> => row != null)
    : []
  const caps = Array.isArray(rec.caps)
    ? rec.caps.map(parseCap).filter((row): row is NonNullable<typeof row> => row != null)
    : []
  const pauses = Array.isArray(rec.pauses)
    ? rec.pauses.map((item) => asString(item)).filter((id): id is string => Boolean(id))
    : []
  const burstDateChanges = Array.isArray(rec.burstDateChanges)
    ? rec.burstDateChanges
        .map(parseBurstChange)
        .filter((row): row is NonNullable<typeof row> => row != null)
    : []
  return {
    moves,
    caps,
    pauses,
    extendDays: asNumber(rec.extendDays) ?? 0,
    burstDateChanges,
  }
}

function parseKpiGoal(raw: unknown): KpiGoalInput | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const rec = raw as Record<string, unknown>
  const value = asNumber(rec.value)
  const kpiRec = asRecord(rec.kpi)
  const metricRaw = asString(kpiRec.metric)
  const metric: KpiGoalMetric | undefined =
    metricRaw === "vtr" || metricRaw === "ctr" || metricRaw === "conversion_rate"
      ? metricRaw
      : undefined
  const target = asNumber(kpiRec.target)
  const kpi = metric
    ? {
        metric,
        target: target ?? Number.NaN,
        impressions: asNumber(kpiRec.impressions),
        clicks: asNumber(kpiRec.clicks),
      }
    : undefined
  if (value == null && !kpi) return undefined
  return { value, kpi }
}

function allowedClientSlugsFor(
  context: Parameters<typeof isUnscopedAvaAccess>[0],
  clientSlug?: string,
): Set<string> | null {
  if (!isUnscopedAvaAccess(context)) {
    return new Set(
      (context.clientSlugs ?? []).map((s) => slugifyPlanClientName(s)).filter(Boolean),
    )
  }
  if (clientSlug) {
    return new Set(
      [slugifyPlanClientName(clientSlug), slugifyClientNameForUrl(clientSlug)].filter(
        Boolean,
      ),
    )
  }
  return null
}

export const runScenarioTool: AvaTool = {
  definition: {
    name: "run_scenario",
    description:
      "Run a what-if pacing scenario for one MBA: budget moves, daily caps, pauses, flight extend, KPI-per-day, or back-on-track. Loads campaign scenario lines (never the portfolio book). Offered on pacing and dashboard pages.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context.",
        },
        levers: {
          type: "object",
          description:
            "Optional scenario levers. Omit to run the current flight (daily need on remaining budget).",
          properties: {
            moves: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  amount: { type: "number" },
                },
                required: ["from", "to", "amount"],
                additionalProperties: false,
              },
            },
            caps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lineItemId: { type: "string" },
                  dailyCap: { type: "number" },
                },
                required: ["lineItemId", "dailyCap"],
                additionalProperties: false,
              },
            },
            pauses: { type: "array", items: { type: "string" } },
            extendDays: { type: "number" },
            burstDateChanges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lineItemId: { type: "string" },
                  index: { type: "number" },
                  start: { type: "string" },
                  end: { type: "string" },
                },
                required: ["lineItemId", "index", "start", "end"],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        goal: {
          type: "object",
          description: "Optional KPI remaining / per-day for one line.",
          properties: {
            lineItemId: { type: "string" },
            goal: {
              description: "Absolute remaining target, or { value, kpi }.",
            },
          },
          required: ["lineItemId"],
          additionalProperties: false,
        },
        backOnTrack: {
          type: "object",
          description: "Close the expected-to-date gap on one line within N days.",
          properties: {
            lineItemId: { type: "string" },
            withinDays: { type: "number" },
          },
          required: ["lineItemId", "withinDays"],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const scopedMba = resolveScopedMba(context, asString(args.mbaNumber))
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    const mba = scopedMba.mba
    if (!mba) {
      return {
        content: "mbaNumber is required (pass it or open a pacing / campaign page).",
        isError: true,
      }
    }

    try {
      const { buildCampaignDetail, CampaignDetailError } = await import(
        "@/lib/pacing/detail/buildCampaignDetail"
      )
      const asOf = getAsOfDate()
      const payload = await buildCampaignDetail({
        mbaNumber: mba,
        asOfDate: asOf,
        allowedClientSlugs: allowedClientSlugsFor(context, context.clientSlug),
      })
      const goalRec = asRecord(args.goal)
      const backRec = asRecord(args.backOnTrack)
      const out = runScenarioFromLines({
        lines: payload.scenarioLines,
        asOf,
        levers: parseLeversArg(args.levers),
        goal: asString(goalRec.lineItemId)
          ? { lineItemId: asString(goalRec.lineItemId)!, goal: parseKpiGoal(goalRec.goal) }
          : undefined,
        backOnTrack: asString(backRec.lineItemId)
          ? {
              lineItemId: asString(backRec.lineItemId)!,
              withinDays: asNumber(backRec.withinDays) ?? 0,
            }
          : undefined,
      })
      return { content: jsonContent(out), isError: false }
    } catch (err) {
      const status =
        err instanceof Error && err.name === "CampaignDetailError" && "status" in err
          ? Number((err as { status: number }).status)
          : undefined
      const message = err instanceof Error ? err.message : String(err)
      if (status === 403) {
        return { content: `MBA "${mba}" is outside this session's access scope.`, isError: true }
      }
      if (status === 404 || /campaign_not_found/i.test(message)) {
        return { content: `No live campaign found for MBA ${mba}.`, isError: true }
      }
      return { content: `Failed to run scenario: ${message}`, isError: true }
    }
  },
}
