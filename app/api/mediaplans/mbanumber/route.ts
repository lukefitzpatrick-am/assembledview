import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLAN_BASE_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mbaidentifier = searchParams.get("mbaidentifier")

  if (!mbaidentifier) {
    return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 })
  }

  try {
    // Fetch existing media plans with the same MBA Identifier
    const response = await axios.get(`${XANO_MEDIAPLAN_BASE_URL}/get_mediaplan_topline`, {
      params: { mbaidentifier: mbaidentifier },
    })

    const existingPlans = response.data

    let maxNumber = 0
    for (const plan of existingPlans) {
      if (plan.mbanumber && plan.mbanumber.startsWith(mbaidentifier)) {
        const numberPart = Number.parseInt(plan.mbanumber.slice(-3))
        if (!isNaN(numberPart) && numberPart > maxNumber) {
          maxNumber = numberPart
        }
      }
    }

    const newNumber = maxNumber + 1
    const mbanumber = `${mbaidentifier}${newNumber.toString().padStart(3, "0")}`

    return NextResponse.json({ mbanumber })
  } catch (error) {
    console.error("Failed to generate MBA number:", error)
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message
      return NextResponse.json({ error: errorMessage }, { status: error.response?.status || 500 })
    }
    return NextResponse.json({ error: "Failed to generate MBA number" }, { status: 500 })
  }
}

