import { NextResponse } from "next/server"
import {
  fetchChannelLineItemsForMbaGet,
  type ChannelGetVersionHints,
} from "@/lib/api/fetchChannelLineItemsByMba"

/**
 * Shared GET handler for dedicated channel routes under app/api/media_plans/<channel>.
 * Read-only FK-first hydrate — POST/PUT/DELETE stay on each route file.
 */
export function createChannelLineItemsGetHandler(endpoint: string, logTag?: string) {
  return async function GET(request: Request) {
    try {
      const { searchParams } = new URL(request.url)
      const mbaNumber = searchParams.get("mba_number")

      if (!mbaNumber) {
        return NextResponse.json({ error: "mba_number is required" }, { status: 400 })
      }

      const hints: ChannelGetVersionHints = {
        mpPlanNumber: searchParams.get("mp_plannumber"),
        mediaPlanVersion: searchParams.get("media_plan_version"),
        versionNumber: searchParams.get("version_number"),
      }

      const items = await fetchChannelLineItemsForMbaGet(
        endpoint,
        mbaNumber,
        hints,
        logTag ?? endpoint
      )

      return NextResponse.json(items, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch line items"
      console.error(`[${logTag ?? endpoint}] GET error:`, error)

      if (
        typeof message === "string" &&
        (message.includes("not found") ||
          message.includes("missing published") ||
          message.includes("No media plan versions"))
      ) {
        return NextResponse.json({ error: message }, { status: 404 })
      }

      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
