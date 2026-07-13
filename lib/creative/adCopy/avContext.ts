import "server-only"

import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import type { CreativeAsset } from "@/lib/creative/types"
import { listByMba } from "@/lib/creative/xanoCreativeAssets"
import { getAvaXanoSummary } from "@/lib/xano/ava"

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s || null
}

function pickLineItemField(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(item[key])
    if (value) return value
  }
  return null
}

function matchLineItemId(item: Record<string, unknown>, want: string): boolean {
  const candidates = [item.line_item_id, item.lineItemId, item.LINE_ITEM_ID, item.id]
  const normalized = want.trim().toLowerCase()
  return candidates.some((c) => c != null && String(c).trim().toLowerCase() === normalized)
}

export type AdCopyAvContextInput = {
  asset: CreativeAsset
  clientName?: string
  campaignName?: string
  destinationUrl?: string
}

export type AdCopyAvContext = {
  text: string
  researchThinHint: boolean
}

/**
 * Server-assembled AV context for AVA no-brief mode.
 * Reuses the same fetches as get_campaign_context (summary + line items), not the agent loop.
 */
export async function buildAdCopyAvContext(
  input: AdCopyAvContextInput,
): Promise<AdCopyAvContext> {
  const mba = String(input.asset.mba_number ?? "").trim()
  const lines: string[] = []
  let researchThinHint = !mba

  if (input.clientName?.trim()) lines.push(`Client: ${input.clientName.trim()}`)
  if (input.campaignName?.trim()) lines.push(`Campaign: ${input.campaignName.trim()}`)
  if (mba) lines.push(`MBA: ${mba}`)
  if (input.destinationUrl?.trim()) {
    lines.push(`Destination URL: ${input.destinationUrl.trim()}`)
  }
  lines.push(`Asset: ${input.asset.asset_name}`)

  const tasks: Array<Promise<void>> = []

  if (mba) {
    tasks.push(
      (async () => {
        try {
          const summary = await getAvaXanoSummary({ mbaNumber: mba })
          if (summary.trim()) {
            lines.push("")
            lines.push("Campaign summary:")
            lines.push(summary.trim().slice(0, 2000))
          } else {
            researchThinHint = true
          }
        } catch {
          researchThinHint = true
        }
      })(),
    )

    tasks.push(
      (async () => {
        try {
          const siblings = await listByMba(mba)
          const names = siblings
            .filter((row) => row.id !== input.asset.id && row.status !== "archived")
            .map((row) => row.asset_name)
            .filter(Boolean)
            .slice(0, 24)
          if (names.length > 0) {
            lines.push("")
            lines.push(`Sibling creatives on this MBA: ${names.join("; ")}`)
          }
        } catch {
          // non-fatal
        }
      })(),
    )

    const lineItemId = String(input.asset.line_item_id ?? "").trim()
    if (lineItemId) {
      tasks.push(
        (async () => {
          try {
            const byChannel = await fetchAllMediaContainerLineItems(mba)
            let matched: { channel: string; item: Record<string, unknown> } | null = null
            for (const [channel, items] of Object.entries(byChannel)) {
              for (const item of items ?? []) {
                if (matchLineItemId(item as Record<string, unknown>, lineItemId)) {
                  matched = { channel, item: item as Record<string, unknown> }
                  break
                }
              }
              if (matched) break
            }
            if (!matched) {
              researchThinHint = true
              return
            }
            const { channel, item } = matched
            const platform =
              pickLineItemField(item, ["platform", "publisher", "publisher_name", "channel"]) ??
              channel
            const buyingDemo = pickLineItemField(item, ["buying_demo", "buyingDemo"])
            const creativeTargeting = pickLineItemField(item, [
              "creative_targeting",
              "creativeTargeting",
              "targeting",
            ])
            const creative = pickLineItemField(item, ["creative", "creative_name", "creativeName"])
            const market = pickLineItemField(item, ["market", "geo", "region"])
            const start =
              pickLineItemField(item, ["start_date", "startDate", "live_date", "liveDate"]) ??
              null
            const end = pickLineItemField(item, ["end_date", "endDate"]) ?? null

            lines.push("")
            lines.push("Linked line item:")
            lines.push(`- channel/platform: ${platform}`)
            if (buyingDemo) lines.push(`- buying_demo: ${buyingDemo}`)
            if (creativeTargeting) lines.push(`- creative_targeting: ${creativeTargeting}`)
            if (creative) lines.push(`- creative: ${creative}`)
            if (market) lines.push(`- market: ${market}`)
            if (start || end) lines.push(`- flight: ${start ?? "?"} → ${end ?? "?"}`)
          } catch {
            researchThinHint = true
          }
        })(),
      )
    }
  }

  await Promise.all(tasks)

  return {
    text: lines.filter(Boolean).join("\n").trim() || "No AV context available.",
    researchThinHint,
  }
}
