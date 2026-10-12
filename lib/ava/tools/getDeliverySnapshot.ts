import type AvaTool from "./types"
import type { AvaToolContext } from "./types"
import { attachStripExpected } from "@/lib/delivery/attachStripExpected"
import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import {
  DELIVERY_SNAPSHOT_TOTALS_NOTE,
  summariseDeliverySnapshot,
} from "@/lib/ava/tools/summaries"
import { MEDIA_CONTAINER_ENDPOINTS } from "@/lib/api/media-containers"
import { readPlanVersionsByMba } from "@/lib/data/readMediaPlans"
import { normalizeDateToMelbourneISO } from "@/lib/dates/normalizeCampaignDateISO"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"
import {
  channelExpectedToDate,
  reconcileLineExpected,
  scheduleKeyForLineItemId,
  scheduleKeyForReportGroup,
  slicesByKey,
} from "@/lib/spend/channelExpectedToDate"
import type { DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"

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

function applyScheduleLineExpected(
  channels: Array<{ group: string; lines: DeliveryLineSnapshot[] }>,
  input: {
    deliverySchedule: unknown
    campaignStartISO: string | null
    campaignEndISO: string | null
    asOfISO: string
  },
): void {
  const slices = slicesByKey(channelExpectedToDate(input))
  if (slices.size === 0) return
  const byKey = new Map<string, DeliveryLineSnapshot[]>()
  for (const channel of channels) {
    for (const line of channel.lines) {
      const key =
        channel.group === "assumed_spend"
          ? scheduleKeyForLineItemId(line.lineItemId)
          : scheduleKeyForReportGroup(channel.group)
      if (!key || !slices.has(key)) continue
      const list = byKey.get(key) ?? []
      list.push(line)
      byKey.set(key, list)
    }
  }
  for (const [key, lines] of byKey) {
    const allocated = reconcileLineExpected(
      slices.get(key) ?? 0,
      lines.map((line) => ({
        id: line.lineItemId,
        lineExpected: line.expectedNetToDate ?? 0,
        plannedMedia: line.plannedBudget ?? 0,
      })),
    )
    for (const line of lines) {
      const next = allocated.get(line.lineItemId)
      if (next != null) line.expectedNetToDate = next
    }
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

      let summarised = summariseDeliverySnapshot(snapshot)
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
          applyScheduleLineExpected(snapshot.channels, {
            deliverySchedule: version.deliverySchedule,
            campaignStartISO,
            campaignEndISO,
            asOfISO: snapshot.asOf,
          })
          summarised = summariseDeliverySnapshot(snapshot)
          const strip = attachStripExpected({
            stripInputs: {
              billingSchedule: version.billingSchedule,
              deliverySchedule: version.deliverySchedule,
              monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, version.deliverySchedule),
              campaignStartISO,
              campaignEndISO,
              monthlyOpts: {
                campaignStartISO,
                campaignEndISO,
                asOfISO: snapshot.asOf,
              },
            },
            deliveredSpendToDate: summarised.reportedTotals.spendToDate,
            asOf: snapshot.asOf,
          })
          return {
            content: jsonContent({
              ...summarised,
              ...strip,
              reportedTotalsNote: DELIVERY_SNAPSHOT_TOTALS_NOTE,
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
