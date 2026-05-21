import { NextResponse } from "next/server"
import axios from "axios"
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper"
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

    const params = new URLSearchParams()
    params.append("mba_number", mbaNumber)
    params.append("mp_plannumber", versionNumber)
    params.append("version_number", versionNumber)
    params.append("media_plan_version", versionNumber)

    const url = `${xanoUrl("media_plan_digi_bvod", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?${params.toString()}`

    console.log(`[DIGI_BVOD] Fetching from media_plan_digi_bvod table`)
    console.log(`[DIGI_BVOD] Strategy: Filtered at Xano via mba_number + version_number (with JS safety filter for legacy data)`)
    console.log(`[DIGI_BVOD] API URL: ${url}`)

    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 10000,
    })

    console.log(`[DIGI_BVOD] API response status: ${response.status}`)
    console.log(
      `[DIGI_BVOD] Raw response data count:`,
      Array.isArray(response.data) ? response.data.length : "not an array"
    )

    const data = Array.isArray(response.data) ? response.data : []
    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "DIGI_BVOD")

    console.log(
      `[DIGI_BVOD] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`
    )

    return NextResponse.json(filteredData)
  } catch (error) {
    console.error("Error fetching BVOD line items:", error)

    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.log(`[DIGI_BVOD] No BVOD line items found (404), returning empty array`)
      return NextResponse.json([])
    }

    return NextResponse.json({ error: "Failed to fetch BVOD line items" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()

    const response = await axios.post(
      xanoUrl("media_plan_digi_bvod", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      data,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    )

    return NextResponse.json(response.data)
  } catch (error: any) {
    const status = error?.response?.status || 500
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Failed to save BVOD line item"

    return NextResponse.json({ error: message }, { status })
  }
}
