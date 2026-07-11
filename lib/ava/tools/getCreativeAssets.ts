import type AvaTool from "./types"
import { listByMba } from "@/lib/creative/xanoCreativeAssets"
import { summariseCreativeAsset } from "./summaries"
import {
  asRecord,
  asString,
  capList,
  jsonContent,
  resolveScopedMba,
} from "./helpers"

export { summariseCreativeAsset } from "./summaries"

export const getCreativeAssetsTool: AvaTool = {
  definition: {
    name: "get_creative_assets",
    description:
      "List creative assets for an MBA (name, mime, dims, line_item_id, status). Use when the user asks what creative exists for a campaign.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const scoped = resolveScopedMba(context, asString(args.mbaNumber))
    if (!scoped.ok) return { content: scoped.error, isError: true }
    const mba = scoped.mba
    if (!mba) {
      return {
        content: "mbaNumber is required (pass it or open a media plan page).",
        isError: true,
      }
    }

    try {
      const rows = await listByMba(mba)
      const summarised = rows.map(summariseCreativeAsset)
      const { items, truncated } = capList(summarised, 50)
      return {
        content: jsonContent({
          mbaNumber: mba,
          count: summarised.length,
          truncated,
          assets: items,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load creative assets: ${message}`, isError: true }
    }
  },
}
