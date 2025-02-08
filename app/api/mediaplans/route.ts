import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLAN_BASE_URL = process.env.XANO_MEDIAPLAN_BASE_URL || "YOUR_DEFAULT_BASE_URL" //Added default value

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const response = await axios.post(`${XANO_MEDIAPLAN_BASE_URL}/post_mediaplan_topline`, body)
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create media plan:", error)
    return NextResponse.json({ error: "Failed to create media plan" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const response = await axios.get(`${XANO_MEDIAPLAN_BASE_URL}/get_mediaplan_topline`)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch media plans:", error)
    return NextResponse.json({ error: "Failed to fetch media plans" }, { status: 500 })
  }
}

