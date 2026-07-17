import axios from "axios"
import type AvaTool from "./types"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { MediaContainerBestPractice } from "@/lib/types/publisher"
import { summariseBestPractice } from "./summaries"
import { asRecord, asString, jsonContent } from "./helpers"

export { summariseBestPractice } from "./summaries"

export const getBestPracticeTool: AvaTool = {
  definition: {
    name: "get_best_practice",
    description:
      "Fetch media_container_best_practice rows, optionally filtered by channel/media_container name. Use when the user asks how we buy or set up a channel.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "Media container / channel name filter (case-insensitive substring).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const args = asRecord(input)
    const channel = asString(args.channel)?.toLowerCase()

    try {
      const response = await axios.get(
        xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL"),
        { headers: xanoAuthHeaderRecord() },
      )
      const raw = response.data
      const rows: MediaContainerBestPractice[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : []
      const filtered = channel
        ? rows.filter((r) => String(r.media_container ?? "").toLowerCase().includes(channel))
        : rows
      const active = filtered.filter((r) => r.is_active !== false)
      return {
        content: jsonContent({
          channelFilter: channel ?? null,
          count: active.length,
          practices: active.slice(0, 20).map(summariseBestPractice),
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load best practice: ${message}`, isError: true }
    }
  },
}
