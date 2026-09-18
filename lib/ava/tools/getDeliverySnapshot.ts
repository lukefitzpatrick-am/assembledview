import type AvaTool from "./types"
import type { AvaToolContext } from "./types"
import { attachStripExpected } from "@/lib/delivery/attachStripExpected"
import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import { summariseDeliverySnapshot } from "@/lib/ava/tools/summaries"
import { MEDIA_CONTAINER_ENDPOINTS } from "@/lib/api/media-containers"
import { readPlanVersionsByMba } from "@/lib/data/readMediaPlans"
import { normalizeDateToMelbourneISO } from "@/lib/dates/normalizeCampaignDateISO"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"

type MediaTypeKey = keyof typeof MEDIA_CONTAINER_ENDPOINTS

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function jsonContent(value: unknown): string {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```"
}

function resolveScopedMba(
  context: AvaToolContext,
  requestedMba: string | undefined,
): { ok: true; mba: string | undefined } | { ok: false; error: string } {
  const pageMba = context.mbaNumber?.trim() || undefined
  const requested = requestedMba?.trim() || undefined
  if (pageMba && requested && pageMba !== requested) {
    return {
      ok: false,
      error: `mbaNumber "${requested}" is outside the current page scope (${pageMba}). Omit mbaNumber or pass the page MBA.`,
    }
  }
  return { ok: true, mba: requested ?? pageMba }
}

function resolveMediaContainerScope(context: AvaToolContext): {
  versionNumber: number | undefined
  mediaTypeFilter: MediaTypeKey[] | undefined
} {
  const versionNumber =
    typeof context.versionNumber === "number" && Number.isFinite(context.versionNumber)
      ? context.versionNumber
      : undefined
  const enabled = context.enabledMediaTypes
  if (!enabled || enabled.length === 0) {
    return { versionNumber, mediaTypeFilter: undefined }
  }
  const allowed = new Set(Object.keys(MEDIA_CONTAINER_ENDPOINTS))
  const mediaTypeFilter = enabled.filter((k): k is MediaTypeKey => allowed.has(k))
  return {
    versionNumber,
    mediaTypeFilter: mediaTypeFilter.length > 0 ? mediaTypeFilter : undefined,
  }
}

export const getDeliverySnapshotTool: AvaTool = {
  definition: {
    name: "get_delivery_snapshot",
    description:
      "Delivered spend, impressions, clicks and views for the campaign's channel containers (social Meta/TikTok, programmatic display/video, ad-serving/BVOD, search) from the same source as the on-page delivery containers, with the plan's budgets per line. ALWAYS prefer this over get_pacing_snapshot for delivery review, commentary and reports on a campaign.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
        startDate: {
          type: "string",
          description: "Optional window start YYYY-MM-DD. Defaults to full flight.",
        },
        endDate: {
          type: "string",
          description: "Optional window end YYYY-MM-DD. Defaults to full flight.",
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
        content: "mbaNumber is required (pass it or open a campaign dashboard page).",
        isError: true,
      }
    }

    try {
      const { versionNumber, mediaTypeFilter } = resolveMediaContainerScope(context)
      const enabled = context.enabledMediaTypes
      const mpSearchEnabled =
        !enabled?.length || enabled.some((k) => k === "search" || k.toLowerCase() === "search")

      const snapshot = await loadDeliverySnapshot({
        mbaNumber: mba,
        versionNumber,
        mediaTypeFilter,
        mpSearchEnabled,
        startDate: asString(args.startDate),
        endDate: asString(args.endDate),
      })

      const summarised = summariseDeliverySnapshot(snapshot)
      try {
        const versions = await readPlanVersionsByMba(mba)
        const vn = snapshot.versionNumber
        const version =
          (typeof vn === "number"
            ? versions.find((row) => Number(row.version_number) === vn)
            : undefined) ?? versions.find((row) => row.published_at)
        if (version) {
          const campaignStartISO = normalizeDateToMelbourneISO(version.campaign_start_date)
          const campaignEndISO = normalizeDateToMelbourneISO(version.campaign_end_date)
          const strip = attachStripExpected({
            stripInputs: {
              billingSchedule: version.billingSchedule,
              deliverySchedule: version.deliverySchedule,
              monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, version.deliverySchedule),
              campaignStartISO,
              campaignEndISO,
              monthlyOpts: { campaignStartISO, campaignEndISO },
            },
            deliveredSpendToDate: summarised.reportedTotals.spendToDate,
            asOf: snapshot.asOf,
          })
          return {
            content: jsonContent({
              ...summarised,
              ...strip,
              reportedTotalsNote:
                "Copy expectedSpendToDate, behindBy, daysElapsed and daysInCampaign — they are the Where we are strip figures. Do not recompute as budget × elapsed. Delivered is reported + spend_only spend.",
            }),
          }
        }
      } catch (err) {
        console.error("[get_delivery_snapshot] strip expected failed", {
          mba,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      return {
        content: jsonContent(summarised),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: `get_delivery_snapshot failed: ${message}`,
        isError: true,
      }
    }
  },
}
