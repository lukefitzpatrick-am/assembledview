import { useEffect } from "react"

import { toDateOnlyString } from "@/lib/dates/civil"
import { clientFeatureOn } from "@/lib/features/client"
import { clientFeeStateFromRow, type ClientFeeState } from "@/lib/finance/clientFeeChannels"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The plan's fee state from its client row, for both plan pages (B22, S4).
 * Each fee is the client's rate on the plan start date (the form's local
 * midnight Date, the same civil date the plan saves). Dated changes reach the
 * row only with client_fee_rate_history on; without them this is the client's
 * fee boxes, as before. No valid start date (or a year before 1000, which is
 * not a YYYY-MM-DD day): today in Melbourne.
 */
export function planClientFeeState(
  row: Readonly<Record<string, unknown>> | null | undefined,
  planStart: unknown,
): ClientFeeState {
  const day =
    planStart instanceof Date && !Number.isNaN(planStart.getTime()) ? toDateOnlyString(planStart) : null
  const onDate = day && ISO_DAY.test(day) ? day : null
  return clientFeeStateFromRow(row, { channelFees: clientFeatureOn("channel_client_fees"), onDate })
}

/**
 * S4, both plan pages: a client fee is its rate on the plan start date, so a
 * new client or a new start date applies the client's fees again. `apply`
 * must be stable (useCallback); unchanged rates set the same values, so no
 * re-render.
 */
export function useClientFeesOnPlanStart<C>(
  client: C | null | undefined,
  planStart: unknown,
  apply: (client: C, planStart: unknown) => void,
): void {
  useEffect(() => {
    if (client) apply(client, planStart)
  }, [apply, client, planStart])
}
