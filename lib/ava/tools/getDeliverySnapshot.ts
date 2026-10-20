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
import { resolvePacingWindowISO, type PacingWindow } from "@/lib/pacing/expectedForWindow"
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
    assumedLines?: import("@/lib/spend/assumedSpend").AssumedExpectedLine[]
  },
): void {
  const slices = slicesByKey(
    channelExpectedToDate({
      ...input,
      assumedLines: input.assumedLines,
    }),
  )
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
    const fixed = new Map<string, number>()
    for (const line of lines) {
      if (line.spendMode !== "assumed") continue
      fixed.set(line.lineItemId, line.expectedNetToDate ?? 0)
    }
    const allocated = reconcileLineExpected(
      slices.get(key) ?? 0,
      lines.map((line) => ({
        id: line.lineItemId,
        lineExpected: fixed.has(line.lineItemId) ? 0 : line.expectedNetToDate ?? 0,
        plannedMedia: line.plannedBudget ?? 0,
      })),
      fixed.size > 0 ? fixed : undefined,
    )
    for (const line of lines) {
      const next = allocated.get(line.lineItemId)
      if (next != null) line.expectedNetToDate = next
    }
  }
}

/**
 * The strip's pacing window for a tool call. A single requested end (or
 * start) pairs with the campaign start (or end), so one-sided ranges still apply.
 */
export function toolPacingWindow(input: {
  startArg: string | undefined
  endArg: string | undefined
  campaignStartISO: string | null
  campaignEndISO: string | null
  reference?: Date
}): PacingWindow {
  const filterStartISO = input.startArg ?? (input.endArg ? (input.campaignStartISO ?? "1970-01-01") : null)
  const filterEndISO = input.endArg ?? (input.startArg ? (input.campaignEndISO ?? "9999-12-31") : null)
  return resolvePacingWindowISO({
    filterStartISO,
    filterEndISO,
    campaignStartISO: input.campaignStartISO,
    campaignEndISO: input.campaignEndISO,
    reference: input.reference,
  })
}

/**
 * Snapshot read range for the window. Without campaign dates the start is
 * left to the plan flight. A window that has not opened reads its end day
 * only (before the campaign starts), so nothing from today is counted.
 */
export function snapshotRange(
  window: PacingWindow,
  campaignStartISO: string | null,
  hasStartArg: boolean,
): { startDate?: string; endDate: string } {
  if (window.empty) return { startDate: window.endISO, endDate: window.endISO }
  const knownStart = Boolean(campaignStartISO) || hasStartArg
  return knownStart ? { startDate: window.startISO, endDate: window.endISO } : { endDate: window.endISO }
}

export const getDeliverySnapshotTool: AvaTool = {
  definition: {
    name: "get_delivery_snapshot",
    description:
      "Delivered spend, impressions, clicks and views for the campaign's channel containers (social Meta/TikTok, programmatic display/video, ad-serving/BVOD, search) from the same source as the on-page delivery containers, with the plan's budgets per line. Delivered and expected both run to deliveredThrough (Melbourne yesterday, capped at the campaign end), the same window as the Where we are strip. ALWAYS prefer this over get_pacing_snapshot for delivery review, commentary and reports on a campaign.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
        startDate: {
          type: "string",
          description: "Optional window start YYYY-MM-DD. Defaults to the campaign start.",
        },
        endDate: {
          type: "string",
          description: "Optional window end YYYY-MM-DD. Defaults to Melbourne yesterday, capped at the campaign end. Delivery is never counted for today.",
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

      // The plan version gives the campaign dates for the pacing window.
      let version: Record<string, unknown> | undefined
      try {
        const versions = await readPlanVersionsByMba(mba)
        version =
          (typeof versionNumber === "number"
            ? versions.find((row) => Number(row.version_number) === versionNumber)
            : undefined) ?? versions.find((row) => row.published_at)
      } catch (err) {
        console.error("[get_delivery_snapshot] plan version read failed", {
          mba,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      const campaignStartISO = version
        ? normalizeDateToMelbourneISO(version.campaign_start_date)
        : null
      const campaignEndISO = version ? normalizeDateToMelbourneISO(version.campaign_end_date) : null

      // Same window as the Where we are strip: campaign start (or the requested
      // start) to Melbourne yesterday (or the requested end), capped at the
      // campaign end. Delivered and expected both stop on window.endISO.
      const window = toolPacingWindow({
        startArg: asString(args.startDate),
        endArg: asString(args.endDate),
        campaignStartISO,
        campaignEndISO,
      })

      const snapshot = await loadDeliverySnapshot({
        mbaNumber: mba,
        versionNumber,
        mediaTypeFilter,
        mpSearchEnabled,
        ...snapshotRange(window, campaignStartISO, Boolean(asString(args.startDate))),
      })
      const windowFields = {
        pacingWindow: {
          startDate: window.startISO,
          endDate: window.endISO,
          filtered: window.filtered,
          notStarted: window.empty,
        },
        deliveredThrough: window.endISO,
      }

      let summarised = summariseDeliverySnapshot(snapshot)
      try {
        if (version) {
          // Schedule slices are to-date figures, so they only reconcile an
          // unfiltered window. A filtered window keeps each line's in-window figure.
          if (!window.filtered && !window.empty) {
            applyScheduleLineExpected(snapshot.channels, {
              deliverySchedule: version.deliverySchedule,
              campaignStartISO,
              campaignEndISO,
              asOfISO: window.endISO,
              assumedLines: snapshot.assumedExpectedLines,
            })
            summarised = summariseDeliverySnapshot(snapshot)
          }
          const strip = attachStripExpected({
            stripInputs: {
              billingSchedule: version.billingSchedule,
              deliverySchedule: version.deliverySchedule,
              monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, version.deliverySchedule),
              campaignStartISO,
              campaignEndISO,
              assumedLines: snapshot.assumedExpectedLines,
              monthlyOpts: {
                campaignStartISO,
                campaignEndISO,
                asOfISO: window.endISO,
              },
            },
            deliveredSpendToDate: summarised.reportedTotals.spendToDate,
            asOf: window.endISO,
            window,
          })
          return {
            content: jsonContent({
              ...summarised,
              ...strip,
              ...windowFields,
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
        content: jsonContent({ ...summarised, ...windowFields }),
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
