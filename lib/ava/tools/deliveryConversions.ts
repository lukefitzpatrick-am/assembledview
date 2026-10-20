/**
 * Conversions block for get_delivery_snapshot (CF5). Read-only.
 * Same switch, events and window as the Where we are strip and the delivery
 * tiles: the client's chosen events only, to deliveredThrough (Melbourne
 * yesterday, filter aware). Spend for CPA and ROAS is the snapshot's
 * in-window platform spend. No currency conversion and no targets.
 */
import {
  conversionsByChannel,
  type ChannelConversionInput,
  type ConversionFigures,
  type LoadedConversions,
} from "@/lib/delivery/conversions/channelConversions"
import type { PacingWindow } from "@/lib/pacing/expectedForWindow"

export const DELIVERY_CONVERSIONS_NOTE =
  "Chosen conversion events only (client settings). headline says which count to quote (Purchases, Leads or Conversions). " +
  "Revenue is only from purchase events with a value, never DV360; revenue and ROAS are null when the client does not show revenue or no event carries value. " +
  "ROAS = revenue / platform spend on channels that can carry revenue. Amounts are as reported by each platform (no currency conversion). " +
  "There are no CPA or ROAS targets. Never quote results as conversions when this block is present."

export const DELIVERY_CONVERSIONS_OFF_NOTE =
  "Conversion tracking is off for this client. Do not report conversions, revenue or ROAS."

type Figures = {
  count: number | null
  revenue: number | null
  spend: number
  cpa: number | null
  roas: number | null
  tracked: boolean
  valueTracked: boolean
}

export type DeliveryConversionsBlock =
  | { enabled: false; note: string }
  | { enabled: null; error: string }
  | {
      enabled: true
      headline: string
      label: string
      showRevenue: boolean
      through: string
      note: string
      total: Figures
      channels: Array<{ group: string } & Figures>
      lines: Array<{ lineItemId: string; group: string } & Figures>
    }

function round2(n: number | null): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100
}

function slim(f: ConversionFigures): Figures {
  return {
    count: f.count,
    revenue: round2(f.revenue),
    spend: round2(f.spend) ?? 0,
    cpa: round2(f.cpa),
    roas: round2(f.roas),
    tracked: f.tracked,
    valueTracked: f.valueTracked,
  }
}

/** Pure: the block from the snapshot channels and what the loader returned. */
export function deliveryConversionsBlock(
  channels: readonly ChannelConversionInput[],
  loaded: LoadedConversions | null,
): DeliveryConversionsBlock {
  const rollup = conversionsByChannel(channels, loaded)
  if (!rollup) return { enabled: false, note: DELIVERY_CONVERSIONS_OFF_NOTE }
  return {
    enabled: true,
    headline: rollup.headline,
    label: rollup.label,
    showRevenue: rollup.showRevenue,
    through: rollup.throughDate,
    note: DELIVERY_CONVERSIONS_NOTE,
    total: slim(rollup.total),
    channels: [...rollup.byChannel.entries()].map(([group, f]) => ({ group, ...slim(f) })),
    lines: [...rollup.byLine.entries()]
      .filter(([, f]) => f.tracked)
      .map(([lineItemId, f]) => ({ lineItemId, group: f.group, ...slim(f) })),
  }
}

export type LoadConversionsFn = (input: {
  mbaNumber: string
  lineItemIds: readonly string[]
  startDate: string
  endDate: string
  skipRead?: boolean
}) => Promise<LoadedConversions | null>

/** Loads and builds the block. A failed read says unavailable, never zero. */
export async function readDeliveryConversions(
  input: { mbaNumber: string; channels: readonly ChannelConversionInput[]; window: PacingWindow },
  load: LoadConversionsFn,
): Promise<DeliveryConversionsBlock> {
  try {
    const loaded = await load({
      mbaNumber: input.mbaNumber,
      lineItemIds: input.channels.flatMap((ch) => ch.lines.map((line) => line.lineItemId)),
      startDate: input.window.startISO,
      endDate: input.window.endISO,
      // A window that has not opened counts nothing.
      skipRead: input.window.empty,
    })
    return deliveryConversionsBlock(input.channels, loaded)
  } catch (err) {
    console.error("[get_delivery_snapshot] conversions failed", {
      mba: input.mbaNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return { enabled: null, error: "Conversions are unavailable right now. Do not report conversions, revenue or ROAS." }
  }
}
