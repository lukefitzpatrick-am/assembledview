import "server-only"

import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
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

export type SearchAvContextInput = {
  mbaNumber: string
  clientName?: string
  campaignName?: string
  finalUrl?: string
}

export type SearchAvContext = {
  text: string
  researchThinHint: boolean
}

/**
 * Server-assembled AV context for search-copy (no creative asset).
 * Reuses getAvaXanoSummary + fetchAllMediaContainerLineItems keyed on MBA.
 */
export async function buildSearchAvContext(
  input: SearchAvContextInput,
): Promise<SearchAvContext> {
  const mba = String(input.mbaNumber ?? "").trim()
  const lines: string[] = []
  let researchThinHint = !mba

  if (input.clientName?.trim()) lines.push(`Client: ${input.clientName.trim()}`)
  if (input.campaignName?.trim()) lines.push(`Campaign: ${input.campaignName.trim()}`)
  if (mba) lines.push(`MBA: ${mba}`)
  if (input.finalUrl?.trim()) {
    lines.push(`Final URL: ${input.finalUrl.trim()}`)
  }

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
          const byChannel = await fetchAllMediaContainerLineItems(mba, undefined, [
            "search",
          ])
          const items = Array.isArray(byChannel.search) ? byChannel.search : []
          if (items.length === 0) {
            researchThinHint = true
            return
          }

          lines.push("")
          lines.push("Search line items (sample):")
          for (const raw of items.slice(0, 8)) {
            if (!raw || typeof raw !== "object") continue
            const item = raw as Record<string, unknown>
            const platform =
              pickLineItemField(item, ["platform", "publisher", "publisher_name", "channel"]) ??
              "search"
            const creative = pickLineItemField(item, ["creative", "creative_name", "creativeName"])
            const buyingDemo = pickLineItemField(item, ["buying_demo", "buyingDemo"])
            const targeting = pickLineItemField(item, [
              "creative_targeting",
              "creativeTargeting",
              "targeting",
            ])
            const market = pickLineItemField(item, ["market", "geo", "region"])
            const bits = [
              `platform: ${platform}`,
              creative ? `creative: ${creative}` : null,
              buyingDemo ? `buying_demo: ${buyingDemo}` : null,
              targeting ? `targeting: ${targeting}` : null,
              market ? `market: ${market}` : null,
            ].filter(Boolean)
            lines.push(`- ${bits.join("; ")}`)
          }
        } catch {
          researchThinHint = true
        }
      })(),
    )
  }

  await Promise.all(tasks)

  return {
    text: lines.filter(Boolean).join("\n").trim() || "No AV context available.",
    researchThinHint,
  }
}
