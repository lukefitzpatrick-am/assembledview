import type AvaTool from "./types"
import { getAvaXanoSummary } from "@/lib/xano/ava"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { summariseLineItem } from "./summaries"
import {
  asRecord,
  asString,
  capList,
  jsonContent,
  resolveScopedMba,
  truncateText,
} from "./helpers"

export { summariseLineItem } from "./summaries"

export const getCampaignContextTool: AvaTool = {
  definition: {
    name: "get_campaign_context",
    description:
      "Load master/version summary plus compact line items (id, channel, publisher, budget; capped at 50) for an MBA. Wraps the existing Ava Xano summary and media-container line-item helpers. Use for campaign structure questions.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
        clientSlug: {
          type: "string",
          description: "Optional client slug for the summary header.",
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
        content: "mbaNumber is required (pass it or open a media plan page).",
        isError: true,
      }
    }
    const clientSlug = asString(args.clientSlug) ?? context.clientSlug

    try {
      const [summary, byChannel] = await Promise.all([
        getAvaXanoSummary({ clientSlug, mbaNumber: mba }),
        fetchAllMediaContainerLineItems(mba),
      ])

      const flat: ReturnType<typeof summariseLineItem>[] = []
      for (const [channel, items] of Object.entries(byChannel)) {
        for (const item of items ?? []) {
          flat.push(summariseLineItem(channel, item))
        }
      }
      const { items: lineItems, truncated } = capList(flat, 50)

      return {
        content: jsonContent({
          mbaNumber: mba,
          clientSlug: clientSlug ?? null,
          planSummary: truncateText(summary || "No plan summary available.", 2000),
          lineItemCount: flat.length,
          lineItemsTruncated: truncated,
          lineItems,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load campaign context: ${message}`, isError: true }
    }
  },
}
