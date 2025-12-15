import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const response = await axios.get(`${XANO_MEDIAPLANS_BASE_URL}/download_mediaplan/${id}`, {
      responseType: 'arraybuffer'
    })
    
    // Set the appropriate headers for PDF download
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', `attachment; filename=media-plan-${id}.pdf`)
    
    return new NextResponse(response.data, {
      status: 200,
      headers
    })
  } catch (error) {
    console.error("Error downloading media plan:", error)
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      return NextResponse.json(
        { error: `Failed to download media plan: ${error.response?.data?.message || error.message}` },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to download media plan" },
      { status: 500 }
    )
  }
} 