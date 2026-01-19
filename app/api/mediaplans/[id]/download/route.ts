import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const response = await axios.get(
      `${xanoUrl("download_mediaplan", "XANO_MEDIAPLANS_BASE_URL")}/${id}`,
      {
      responseType: 'arraybuffer'
      }
    )
    
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