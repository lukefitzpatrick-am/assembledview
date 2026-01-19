import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const response = await axios.post(
      `${xanoUrl("generate_mbanumber", "XANO_MEDIAPLANS_BASE_URL")}/${id}`
    )
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Error generating MBA number:", error)
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      return NextResponse.json(
        { error: `Failed to generate MBA number: ${error.response?.data?.message || error.message}` },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to generate MBA number" },
      { status: 500 }
    )
  }
} 