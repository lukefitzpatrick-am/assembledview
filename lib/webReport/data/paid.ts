import "server-only"

import {
  getDeliveredTotalsForClient,
  type ClientDeliveredTotalsCampaignInput,
} from "@/lib/delivery/getDeliveredTotalsForClient"
import type { DateWindow } from "@/lib/webReport/periods"
import type { PaidSlice } from "@/lib/webReport/types"

/**
 * One client total from getDeliveredTotalsForClient
 * (lib/delivery/getDeliveredTotalsForClient.ts). That function does not
 * split spend by channel, so the channel list is a single Paid media row.
 */
export async function readAvPaid(input: {
  campaigns: ClientDeliveredTotalsCampaignInput[]
  current: DateWindow
  previous: DateWindow
}): Promise<PaidSlice> {
  try {
    const [current, previous] = await Promise.all([
      getDeliveredTotalsForClient(input.campaigns, {
        startDate: input.current.from,
        endDate: input.current.to,
      }),
      getDeliveredTotalsForClient(input.campaigns, {
        startDate: input.previous.from,
        endDate: input.previous.to,
      }),
    ])
    const spend = current.spendToDate
    const previousSpend = previous.spendToDate
    const empty = !current.hasDelivery && spend === 0
    return {
      status: current.partial ? "error" : empty ? "empty" : "ok",
      message: current.partial ? "Part of paid media could not be read" : null,
      spend,
      previousSpend,
      byChannel: empty ? [] : [{ channel: "Paid media", spend }],
    }
  } catch (err) {
    console.error("[web-report] paid media read failed", err)
    return {
      status: "error",
      message: "Paid media could not be read",
      spend: null,
      previousSpend: null,
      byChannel: [],
    }
  }
}
