import type AvaTool from "./types"
import { loadBrandAssetCatalog, matchBrandAssets, type BrandAssetKind } from "@/lib/ava/brand/catalog"
import { asRecord, asString, jsonContent } from "./helpers"

function kindOf(value: string | undefined): BrandAssetKind | null {
  if (value === "logo" || value === "photo") return value
  return null
}

export const getBrandAssetsTool: AvaTool = {
  definition: {
    name: "get_brand_assets",
    description:
      "List Assembled brand logos and photos from the committed catalogue. Use when the user asks for a logo, a brand photo, or a cover image. Returns up to 12 public store URLs. Never invent an image URL.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["logo", "photo"],
          description: "Optional. logo or photo. Omit to search both.",
        },
        query: {
          type: "string",
          description:
            "Optional words matched against id, name, description and tags. Example: sport, shopping, full colour.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (!context.roles.includes("admin")) {
      return {
        content: "get_brand_assets is available to Admin users only.",
        isError: true,
      }
    }
    const args = asRecord(input)
    const kindRaw = asString(args.kind)
    if (kindRaw && kindOf(kindRaw) == null) {
      return { content: "kind must be logo or photo.", isError: true }
    }
    try {
      const { assets, truncated } = matchBrandAssets(loadBrandAssetCatalog(), {
        kind: kindOf(kindRaw),
        query: asString(args.query) ?? "",
      })
      return {
        content: jsonContent({
          count: assets.length,
          truncated,
          assets,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load brand assets: ${message}`, isError: true }
    }
  },
}
