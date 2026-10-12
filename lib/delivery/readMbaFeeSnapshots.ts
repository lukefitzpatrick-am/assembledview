import "server-only"

import { inArray } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import {
  feeLoadingFromSnapshot,
  feePctsByVersionFromSnapshots,
} from "@/lib/delivery/directDigitalFeeChannels"
import type { FeePctsByVersionId } from "@/lib/delivery/directDigitalFeeLookup"

/**
 * One autocommit select of `mba_fee_snapshots` for the version ids in hand.
 * Not a `withPgReadLimits` transaction: that wrapper sets lock_timeout and
 * statement_timeout, and this read must stay outside it.
 */
export async function loadDirectDigitalFeePcts(args: {
  versionIds: readonly number[]
  clientFeeLoading?: FeeLoading | null
}): Promise<FeePctsByVersionId> {
  const ids = [...new Set(args.versionIds.filter((id) => Number.isInteger(id) && id > 0))]
  const snapshots = new Map<number, FeeLoading>()
  if (ids.length > 0) {
    const rows = await getDb()
      .select({
        versionId: schema.mbaFeeSnapshots.versionId,
        fees: schema.mbaFeeSnapshots.fees,
      })
      .from(schema.mbaFeeSnapshots)
      .where(inArray(schema.mbaFeeSnapshots.versionId, ids))
    for (const row of rows) {
      const fees = feeLoadingFromSnapshot(row.fees)
      if (fees) snapshots.set(row.versionId, fees)
    }
  }
  return feePctsByVersionFromSnapshots({
    versionIds: ids,
    snapshots,
    clientFeeLoading: args.clientFeeLoading,
  })
}
