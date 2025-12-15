import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLAN_BASE_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mbaidentifier = searchParams.get("mbaidentifier")

  if (!mbaidentifier) {
    return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 })
  }

  try {
    // Fetch existing media plans with the same MBA Identifier
    const response = await axios.get(`${XANO_MEDIAPLAN_BASE_URL}/media_plan_master`, {
      params: { mbaidentifier: mbaidentifier },
    })

    // Handle both array and object responses from Xano
    const existingPlans = Array.isArray(response.data) 
      ? response.data 
      : response.data 
        ? [response.data] 
        : []

    let maxNumber = 0
    for (const plan of existingPlans) {
      if (plan && plan.mba_number && plan.mba_number.startsWith(mbaidentifier)) {
        const numberPart = Number.parseInt(plan.mba_number.slice(-3))
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
      const statusCode = error.response?.status || 500
      console.error(`API error details: ${errorMessage}, Status: ${statusCode}`)
      return NextResponse.json({ error: errorMessage }, { status: statusCode })
    }
    return NextResponse.json({ error: "Failed to generate MBA number" }, { status: 500 })
  }
}

