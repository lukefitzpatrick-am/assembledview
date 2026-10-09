import type AvaTool from "./types"
import type { AvaToolContext } from "./types"
import { toChatFileAttachment } from "@/lib/ava/chatFileAttachment"
import { getPublishedCampaignRead } from "@/lib/campaign-read/repo"
import { findUnattributedPriorRestatement } from "@/lib/insights/priorInsightGuard"
import { listCampaignInsights } from "@/lib/insights/queryCampaignInsights"
import { findInventedMoneyInNarrative } from "@/lib/reports/performanceReportHardNumbers"
import { persistPerformanceReportInsights } from "@/lib/reports/persistPerformanceReportInsights"
import {
  assembleCampaignReportData,
  type ReportCommentary,
} from "@/lib/reports/campaignReport/assembleCampaignReportData"
import {
  generateCampaignReportForMba,
  type GenerateCampaignReportDeps,
  type GenerateCampaignReportInput,
  type GenerateCampaignReportResult,
} from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import {
  commentaryNarrativeFields,
  parseReportCommentary,
  reportAllowedCorpus,
} from "@/lib/reports/campaignReport/generateReportCommentary"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { PPTX_CONTENT_TYPE } from "@/lib/reports/storePerformanceReport"
import { asRecord, asString, jsonContent, resolveScopedMba } from "./helpers"

const PERIOD_KINDS: readonly CampaignReportPeriodKind[] = [
  "this_month",
  "last_month",
  "campaign_to_date",
  "custom",
]

class PerformanceReportGuardError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : "commentary rejected")
    this.name = "PerformanceReportGuardError"
  }
}

export type GeneratePerformanceReportDeps = {
  generateReport?: (
    input: GenerateCampaignReportInput,
    deps?: GenerateCampaignReportDeps,
  ) => Promise<GenerateCampaignReportResult>
  reportDeps?: GenerateCampaignReportDeps
  listPriors?: (mbaNumber: string) => Promise<{ id: number; body: string }[]>
  loadPublishedRead?: (mbaNumber: string, versionNumber: number) => Promise<string | null>
  persistInsights?: typeof persistPerformanceReportInsights
}

function parsePeriod(
  raw: unknown,
): { ok: true; period: GenerateCampaignReportInput["period"] } | { ok: false; content: string } {
  const row = asRecord(raw)
  const kind = asString(row.kind)
  if (!kind || !PERIOD_KINDS.includes(kind as CampaignReportPeriodKind)) {
    return {
      ok: false,
      content:
        "period.kind must be this_month, last_month, campaign_to_date or custom.",
    }
  }
  if (kind === "custom") {
    const start = asString(row.start)
    const end = asString(row.end)
    if (!start || !end) {
      return { ok: false, content: "A custom period requires start and end (YYYY-MM-DD)." }
    }
    return { ok: true, period: { kind, start, end } }
  }
  return { ok: true, period: { kind: kind as CampaignReportPeriodKind } }
}

/** AV-A8: figures must already be in the assembled report; priors need attribution. */
export function performanceReportCommentaryRejection(
  commentary: ReportCommentary,
  allowedText: string,
  priors: { id: number; body: string }[],
): Record<string, unknown> | null {
  const fields = commentaryNarrativeFields(commentary)
  const invented = findInventedMoneyInNarrative(fields, allowedText)
  if (invented) {
    return {
      error: "invented_money_figure",
      field: invented.field,
      match: invented.match,
      message: `Do not include a figure that is not already in the report (found "${invented.match}" in ${invented.field}). Rewrite using the assembled numbers only.`,
    }
  }
  const priorHit = findUnattributedPriorRestatement(fields, priors)
  if (priorHit) {
    return {
      error: "unattributed_prior_insight",
      field: priorHit.field,
      match: priorHit.match,
      insightId: priorHit.insightId,
      message: `Do not restate a prior insight as current analysis (near-verbatim match of insight #${priorHit.insightId} in ${priorHit.field}). Attribute what was believed before and what has changed, then regenerate.`,
    }
  }
  return null
}

async function defaultPriors(mbaNumber: string): Promise<{ id: number; body: string }[]> {
  const priors = await listCampaignInsights({
    mbaNumber,
    includeSuperseded: false,
    limit: 30,
  })
  return priors.map((prior) => ({ id: prior.id, body: prior.body }))
}

export async function executeGeneratePerformanceReport(
  input: unknown,
  context: AvaToolContext,
  deps?: GeneratePerformanceReportDeps,
): Promise<{ content: string; attachments?: ReturnType<typeof toChatFileAttachment>[]; isError: boolean }> {
  const usingStandIn = Boolean(deps?.generateReport || deps?.reportDeps?.storeReport)
  if (!usingStandIn && !process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      content: "Performance report export is unavailable: BLOB_READ_WRITE_TOKEN is not configured.",
      isError: true,
    }
  }

  const args = asRecord(input)
  const period = parsePeriod(args.period)
  if (!period.ok) return { content: period.content, isError: true }

  const parsed = parseReportCommentary(args.commentary)
  if (!parsed.ok) return { content: parsed.reasons, isError: true }
  const commentary = parsed.commentary

  const scopedMba = resolveScopedMba(context, asString(args.mbaNumber) ?? asString(args.mba))
  if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
  if (!scopedMba.mba) {
    return {
      content: "mbaNumber is required to generate a performance report (page context or argument).",
      isError: true,
    }
  }

  let priors: { id: number; body: string }[] = []
  try {
    priors = await (deps?.listPriors ?? defaultPriors)(scopedMba.mba)
  } catch (priorErr) {
    console.error("[generate_performance_report] prior insight load failed", {
      mbaNumber: scopedMba.mba,
      error: priorErr instanceof Error ? priorErr.message : String(priorErr),
    })
  }

  const versionHint = context.versionNumber ?? context.pageContext?.entities?.versionNumber
  let publishedRead: string | null = null
  if (typeof versionHint === "number" && Number.isFinite(versionHint)) {
    try {
      const loadRead = deps?.loadPublishedRead ?? (async (mba: string, version: number) => {
        const published = await getPublishedCampaignRead(mba, version)
        return published?.bodyMarkdown ?? null
      })
      publishedRead = await loadRead(scopedMba.mba, versionHint)
    } catch (readErr) {
      console.error("[generate_performance_report] campaign read load failed", {
        mbaNumber: scopedMba.mba,
        error: readErr instanceof Error ? readErr.message : String(readErr),
      })
    }
  }

  const generate = deps?.generateReport ?? generateCampaignReportForMba
  const reportDeps: GenerateCampaignReportDeps = {
    ...deps?.reportDeps,
    assemble: async (assembleInput) => {
      const assemble = deps?.reportDeps?.assemble ?? assembleCampaignReportData
      const payload = await assemble(assembleInput)
      const rejection = performanceReportCommentaryRejection(
        commentary,
        reportAllowedCorpus(payload, { publishedRead, priors }),
        priors,
      )
      if (rejection) throw new PerformanceReportGuardError(rejection)
      return payload
    },
  }

  try {
    const result = await generate(
      {
        mbaNumber: scopedMba.mba,
        period: period.period,
        store: true,
        withCommentary: false,
        commentary,
      },
      deps?.generateReport ? undefined : reportDeps,
    )

    if (result.skipped) {
      return { content: result.skipped, isError: true }
    }

    const skipInsightPersist = args.preview === true || args.dryRun === true
    if (!skipInsightPersist && result.commentary && result.commentary.items.length > 0) {
      try {
        await (deps?.persistInsights ?? persistPerformanceReportInsights)({
          commentaryItems: result.commentary.items,
          mbaNumber: scopedMba.mba,
          reportMonth: result.periodMonth,
          createdByEmail: context.userEmail,
          preview: false,
          dryRun: false,
        })
      } catch (insightErr) {
        console.error("[generate_performance_report] insight persist threw", {
          mbaNumber: scopedMba.mba,
          error: insightErr instanceof Error ? insightErr.message : String(insightErr),
        })
      }
    }

    if (!result.blobPathname) {
      return { content: "Performance report was built but not stored.", isError: true }
    }

    const attachment = toChatFileAttachment({
      fileName: result.fileName,
      url: `/api/reports/download?path=${encodeURIComponent(result.blobPathname)}`,
      contentType: PPTX_CONTENT_TYPE,
      sizeBytes: result.buffer.byteLength,
    })

    return {
      content: jsonContent({
        filename: result.fileName,
        pathname: result.blobPathname,
        note: "A download card is shown in the chat UI. Reply briefly (for example, Report ready). Do not paste a download URL. The deck is the campaign report, with the commentary that was approved.",
      }),
      attachments: [attachment],
      isError: false,
    }
  } catch (error) {
    if (error instanceof PerformanceReportGuardError) {
      return { content: jsonContent(error.payload), isError: true }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { content: `Failed to generate performance report: ${message}`, isError: true }
  }
}

export const generatePerformanceReportTool: AvaTool = {
  definition: {
    name: "generate_performance_report",
    description:
      "Build the campaign report deck (.pptx) for the MBA on the page and return a download card. Call ONLY after the user has explicitly confirmed the commentary in chat. Input is the period and the approved ReportCommentary (summary plus 2 to 4 Insight, Action and Outcome items). The server assembles CPM, CPC, CTR, 3-second views and spend pace. Do not invent a dollar amount or a percent that is not already in the delivery data. Do not copy a prior insight as a current finding without attribution.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "Optional MBA. Defaults to the page.",
        },
        period: {
          type: "object",
          description:
            "Report window. kind is this_month, last_month, campaign_to_date, or custom. Custom requires start and end as YYYY-MM-DD.",
          properties: {
            kind: {
              type: "string",
              enum: ["this_month", "last_month", "campaign_to_date", "custom"],
            },
            start: { type: "string" },
            end: { type: "string" },
          },
          required: ["kind"],
          additionalProperties: false,
        },
        commentary: {
          type: "object",
          description:
            "Approved commentary. summary ≤160. items is 2 to 4. insight ≤240, action ≤160, outcome ≤160, actionOwner ≤40. outcomeKind is achieved or expected.",
          properties: {
            summary: { type: "string" },
            items: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  insight: { type: "string" },
                  action: { type: "string" },
                  actionOwner: { type: "string" },
                  outcome: { type: "string" },
                  outcomeKind: { type: "string", enum: ["achieved", "expected"] },
                },
                required: ["insight", "action", "actionOwner", "outcome", "outcomeKind"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "items"],
          additionalProperties: false,
        },
      },
      required: ["period", "commentary"],
      additionalProperties: false,
    },
  },
  execute(input, context) {
    return executeGeneratePerformanceReport(input, context)
  },
}
