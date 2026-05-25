import { NextResponse } from "next/server"
import axios from "axios"
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { lineItemPaginationParams } from "@/lib/api/mediaPlanLineItemQuery"
import { xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mbaNumber = searchParams.get("mba_number")
    const mediaPlanVersion = searchParams.get("media_plan_version")
    const mpPlanNumber = searchParams.get("mp_plannumber")

    if (!mbaNumber) {
      return NextResponse.json({ error: "mba_number is required" }, { status: 400 })
    }

    let versionNumber: string | null = null

    try {
      versionNumber = await getVersionNumberForMBA(mbaNumber, mpPlanNumber, mediaPlanVersion)
    } catch (versionError) {
      console.error("Error fetching version number from media_plan_versions:", versionError)
      return NextResponse.json(
        { error: "Failed to determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      )
    }

    if (!versionNumber) {
      return NextResponse.json(
        { error: "Could not determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      )
    }

    console.log(`[PROG_OOH] Fetching from media_plan_prog_ooh table with pagination`)
    console.log(`[PROG_OOH] Strategy: Filtered at Xano via mba_number + version_number (with JS safety filter for legacy data)`)

    const data = await fetchAllXanoPages(
      xanoUrl("media_plan_prog_ooh", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      lineItemPaginationParams(mbaNumber, versionNumber),
      "PROG_OOH"
    )

    console.log(`[PROG_OOH] Raw response data count:`, data.length)

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "PROG_OOH")

    console.log(
      `[PROG_OOH] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`
    )

    return NextResponse.json(filteredData)
  } catch (error) {
    console.error("Error fetching programmatic OOH data:", error)

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.log("Programmatic OOH line items not found (404), returning empty array")
        return NextResponse.json([])
      }

      return NextResponse.json(
        {
          error: `Failed to fetch programmatic OOH data: ${error.response?.data?.message || error.message}`,
        },
        { status: error.response?.status || 500 }
      )
    }

    return NextResponse.json({ error: "Failed to fetch programmatic OOH data" }, { status: 500 })
  }
}
