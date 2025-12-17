import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const response = await axios.post(`${XANO_MEDIAPLANS_BASE_URL}/generate_mbanumber/${id}`)
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