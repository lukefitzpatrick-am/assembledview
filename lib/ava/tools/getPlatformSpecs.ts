import type AvaTool from "./types"
import {
  loadMiLibrary,
  slugifyPublisher,
  type MiFormatRecord,
} from "@/lib/specs/library"
import { asRecord, asString, capList, jsonContent } from "./helpers"

type PlatformSpecsInput = {
  publisher?: string
  format?: string
}

function dimensionsSummary(dimensions: MiFormatRecord["dimensions"]): string | null {
  if (!dimensions) return null
  if (typeof dimensions === "string") return dimensions
  return Object.values(dimensions).filter(Boolean).join(", ") || null
}

function matchesFormat(format: MiFormatRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [format.format_name, ...(format.aliases ?? [])].some((value) => {
    const candidate = value.toLowerCase()
    return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
  })
}

export function getPlatformSpecsPayload(input: PlatformSpecsInput) {
  const publisher = input.publisher?.trim()
  if (!publisher) throw new Error("publisher is required. Provide a platform or publisher name (for example, Meta).")

  const library = loadMiLibrary()
  const publisherSlug = slugifyPublisher(publisher)
  const record = library.bySlug.get(publisherSlug)
  if (!record) {
    throw new Error(`No MI library entry found for publisher "${publisher}".`)
  }

  const formatQuery = input.format?.trim()
  const rows = (record.formats ?? [])
    .filter((format) => !formatQuery || matchesFormat(format, formatQuery))
    .map((format) => ({
      format_name: format.format_name,
      container: format.container ?? record.container_category_default ?? record.container_category ?? null,
      placement: format.placement ?? null,
      file_type: format.file_type ?? null,
      dimensions: dimensionsSummary(format.dimensions),
      max_file_size: format.max_file_size ?? null,
      duration: format.duration ?? format.duration_max ?? format.duration_recommended ?? null,
      last_refreshed: record.last_refreshed,
      source: record.source ?? null,
    }))
  const capped = capList(rows, 20)

  return {
    publisher: publisherSlug,
    format: formatQuery ?? null,
    count: rows.length,
    truncated: capped.truncated,
    rows: capped.items,
  }
}

export const getPlatformSpecsTool: AvaTool = {
  definition: {
    name: "get_platform_specs",
    description:
      "Look up compact creative/material specifications for one publisher in the MI library. Use when the user asks about a platform's file types, dimensions, durations, or limits—not to begin an MI interview or export a workbook.",
    input_schema: {
      type: "object",
      properties: {
        publisher: {
          type: "string",
          description: "Required publisher or platform name, such as Meta, Google Ads, or TikTok.",
        },
        format: {
          type: "string",
          description: "Optional format name or alias to narrow results.",
        },
      },
      required: ["publisher"],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const args = asRecord(input)
    try {
      return {
        content: jsonContent(
          getPlatformSpecsPayload({
            publisher: asString(args.publisher),
            format: asString(args.format),
          }),
        ),
        isError: false,
      }
    } catch (error) {
      return {
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      }
    }
  },
}
