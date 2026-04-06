import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
const XANO_TIMEOUT_MS = Number(process.env.XANO_TIMEOUT_MS || 10_000)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mbaidentifierRaw = searchParams.get("mbaidentifier")
  const mbaidentifier = mbaidentifierRaw?.trim() ?? ""

  if (!mbaidentifier) {
    return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 })
  }

  try {
    // Fetch existing media plans with the same MBA Identifier
    const response = await axios.get(
      xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      {
        params: { mbaidentifier },
        timeout: XANO_TIMEOUT_MS,
      }
    )

    // Handle both array and object responses from Xano
    const existingPlans = Array.isArray(response.data) 
      ? response.data 
      : response.data 
        ? [response.data] 
        : []

    let maxNumber = 0
    for (const plan of existingPlans) {
      const num = plan?.mba_number
      if (plan && typeof num === "string" && num.startsWith(mbaidentifier)) {
        const numberPart = Number.parseInt(num.slice(-3))
        if (!isNaN(numberPart) && numberPart > maxNumber) {
          maxNumber = numberPart
        }
      }
    }

    const newNumber = maxNumber + 1
    const mba_number = `${mbaidentifier}${newNumber.toString().padStart(3, "0")}`

    return NextResponse.json({ mba_number })
  } catch (error) {
    console.error("Failed to generate MBA number:", error)
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message
      const statusCode = error.response?.status || (error.code === "ECONNABORTED" ? 504 : 500)
      console.error(`API error details: ${errorMessage}, Status: ${statusCode}`)
      return NextResponse.json({ error: errorMessage }, { status: statusCode })
    }
    return NextResponse.json({ error: "Failed to generate MBA number" }, { status: 500 })
  }
}

