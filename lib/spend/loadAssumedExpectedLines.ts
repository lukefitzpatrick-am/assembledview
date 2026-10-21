import "server-only"

import { inArray } from "drizzle-orm"
import { schema } from "@/db"
import { withPgReadLimits } from "@/lib/data/pgReadLimits"
import type { FeePctsByVersionId } from "@/lib/delivery/directDigitalFeeLookup"
import { feePctForScheduleMedia } from "@/lib/delivery/directDigitalFeeLookup"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { parseMoney } from "@/lib/money/parse"
import {
  assumedExpectedLineFromFields,
  channelMetaForKey,
  type AssumedLineFields,
} from "@/lib/spend/assumedExpectedLines"
import type { AssumedExpectedBurst, AssumedExpectedLine } from "@/lib/spend/assumedSpend"

type LineRow = {
  versionId: number
  channel: string
  lineItemId: string
  buyType: string | null
  publisher: string | null
  platform: string | null
  clientPaysForMedia: boolean | null
  budgetIncludesFees: boolean | null
  noAdserving: boolean | null
  bursts: unknown
}

function burstsOf(raw: unknown, fields: Omit<AssumedLineFields, "id" | "bursts" | "sourceTable">): AssumedExpectedBurst[] {
  if (!Array.isArray(raw)) return []
  const bursts: AssumedExpectedBurst[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const burst = row as Record<string, unknown>
    const startDate = formatBurstDateLocal(String(burst.startDate ?? burst.start_date ?? ""))
    const endDate = formatBurstDateLocal(String(burst.endDate ?? burst.end_date ?? ""))
    if (!startDate || !endDate) continue
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    bursts.push({
      rawBudget,
      budgetIncludesFees: fields.budgetIncludesFees,
      clientPaysForMedia: fields.clientPaysForMedia,
      feePct: fields.feePct,
      buyType: typeof burst.buy_type === "string" ? burst.buy_type : typeof burst.buyType === "string" ? burst.buyType : fields.buyType ?? undefined,
      startDate,
      endDate,
    })
  }
  return bursts
}

export async function loadAssumedExpectedLinesByVersion(
  versionIds: readonly number[],
  feePcts: FeePctsByVersionId,
): Promise<Map<number, AssumedExpectedLine[]>> {
  const ids = [...new Set(versionIds.filter((id) => Number.isInteger(id) && id > 0))]
  const out = new Map<number, AssumedExpectedLine[]>()
  if (ids.length === 0) return out
  const rows = await withPgReadLimits((tx) =>
    tx
      .select({
        versionId: schema.lineItems.versionId,
        channel: schema.lineItems.channel,
        lineItemId: schema.lineItems.lineItemId,
        buyType: schema.lineItems.buyType,
        publisher: schema.lineItems.publisher,
        platform: schema.lineItems.platform,
        clientPaysForMedia: schema.lineItems.clientPaysForMedia,
        budgetIncludesFees: schema.lineItems.budgetIncludesFees,
        noAdserving: schema.lineItems.noAdserving,
        bursts: schema.lineItems.bursts,
      })
      .from(schema.lineItems)
      .where(inArray(schema.lineItems.versionId, ids)),
  )
  for (const row of rows as LineRow[]) {
    const meta = channelMetaForKey(row.channel)
    if (!meta) continue
    const feePct = feePctForScheduleMedia(feePcts, row.versionId, meta.mediaLabel)
    const fields = {
      buyType: row.buyType,
      noAdserving: row.noAdserving === true,
      publisher: row.publisher,
      platform: row.platform,
      budgetIncludesFees: row.budgetIncludesFees === true,
      clientPaysForMedia: row.clientPaysForMedia === true,
      feePct,
    }
    const line = assumedExpectedLineFromFields(
      {
        id: row.lineItemId,
        sourceTable: meta.sourceTable,
        ...fields,
        bursts: burstsOf(row.bursts, fields),
      },
      meta.scheduleKey,
    )
    if (!line) continue
    const list = out.get(row.versionId) ?? []
    list.push(line)
    out.set(row.versionId, list)
  }
  return out
}
