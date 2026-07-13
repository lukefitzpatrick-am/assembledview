import type AvaTool from "./types"
import { getAvaXanoSummary } from "@/lib/xano/ava"
import { getAsOfDate } from "@/lib/pacing/maths"
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs"
import { summarisePacingSnapshot, type CompactPacingRow } from "./summaries"
import {
  asRecord,
  asString,
  isUnscopedAvaAccess,
  jsonContent,
  resolveScopedClientSlug,
  resolveScopedMba,
} from "./helpers"

export { summarisePacingSnapshot } from "./summaries"

function pickRowFields(channel: string, row: Record<string, unknown>): CompactPacingRow {
  return {
    channel,
    mbaNumber: asString(row.mbaNumber) ?? asString(row.mba_number) ?? "",
    clientName: asString(row.clientName) ?? asString(row.mp_client_name) ?? "",
    campaignName: asString(row.campaignName) ?? asString(row.mp_campaignname) ?? "",
    lineItemId: asString(row.lineItemId) ?? asString(row.line_item_id) ?? "",
    status:
      asString(row.lineItemStatus) ??
      asString(row.status) ??
      asString(row.pacingStatus) ??
      "unknown",
    spendToDate:
      typeof row.spendToDateLineTotal === "number"
        ? row.spendToDateLineTotal
        : typeof row.spendToDate === "number"
          ? row.spendToDate
          : null,
    budget:
      typeof row.totalLineItemBudget === "number"
        ? row.totalLineItemBudget
        : typeof row.budget === "number"
          ? row.budget
          : null,
  }
}

export const getPacingSnapshotTool: AvaTool = {
  definition: {
    name: "get_pacing_snapshot",
    description:
      "Pacing story for a client or MBA: plan summary from Xano plus compact cached pacing rows across search/social/programmatic/ad-serving/direct. Prefer when the user asks how delivery or pacing looks.",
    input_schema: {
      type: "object",
      properties: {
        clientSlug: {
          type: "string",
          description: "Client slug or name. Defaults to page context.",
        },
        mbaNumber: {
          type: "string",
          description: "Optional MBA filter. Defaults to page context.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const scopedClient = resolveScopedClientSlug(context, asString(args.clientSlug))
    if (!scopedClient.ok) return { content: scopedClient.error, isError: true }
    const scopedMba = resolveScopedMba(context, asString(args.mbaNumber))
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }

    const clientSlug = scopedClient.slug
    const mbaNumber = scopedMba.mba
    if (!clientSlug && !mbaNumber) {
      return {
        content: "Provide clientSlug or mbaNumber (or open a page with one in context).",
        isError: true,
      }
    }

    try {
      const asOfDate = getAsOfDate()
      let allowedClientSlugs: Set<string> | null = null
      if (!isUnscopedAvaAccess(context)) {
        allowedClientSlugs = new Set(
          (context.clientSlugs ?? []).map((s) => slugifyPlanClientName(s)).filter(Boolean),
        )
      } else if (clientSlug) {
        allowedClientSlugs = new Set(
          [slugifyPlanClientName(clientSlug), slugifyClientNameForUrl(clientSlug)].filter(
            Boolean,
          ),
        )
      }

      const [planSummary, search, social, programmatic, adServing, direct] = await Promise.all([
        mbaNumber
          ? getAvaXanoSummary({ clientSlug, mbaNumber, versionNumber: context.versionNumber })
          : Promise.resolve(""),
        getCachedSearchPacingRows(asOfDate, allowedClientSlugs),
        getCachedSocialPacingRows(asOfDate, allowedClientSlugs),
        getCachedProgrammaticPacingRows(asOfDate, allowedClientSlugs),
        getCachedAdServingPacingRows(asOfDate, allowedClientSlugs),
        getCachedDirectPacingRows(asOfDate, allowedClientSlugs, false),
      ])

      const rows: CompactPacingRow[] = [
        ...(search ?? []).map((r) => pickRowFields("search", r as unknown as Record<string, unknown>)),
        ...(social ?? []).map((r) => pickRowFields("social", r as unknown as Record<string, unknown>)),
        ...(programmatic ?? []).map((r) =>
          pickRowFields("programmatic", r as unknown as Record<string, unknown>),
        ),
        ...(adServing ?? []).map((r) =>
          pickRowFields("ad_serving", r as unknown as Record<string, unknown>),
        ),
        ...(direct ?? []).map((r) => pickRowFields("direct", r as unknown as Record<string, unknown>)),
      ]

      return {
        content: jsonContent(
          summarisePacingSnapshot({
            asOfDate,
            planSummary,
            rows,
            clientSlug,
            mbaNumber,
          }),
        ),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load pacing snapshot: ${message}`, isError: true }
    }
  },
}
