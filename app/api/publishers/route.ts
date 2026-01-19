import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function GET() {
  try {
    // For now, allow access for development
    // In production, you would validate the Auth0 session here
    
    const response = await axios.get(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL"))
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch publishers:", error)
    return NextResponse.json({ error: "Failed to fetch publishers" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    // For now, allow access for development
    // In production, you would validate the Auth0 session here
    
    const body = await req.json()
    const response = await axios.post(xanoUrl("post_publishers", "XANO_PUBLISHERS_BASE_URL"), body)
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create publisher:", error)
    return NextResponse.json({ error: "Failed to create publisher" }, { status: 500 })
  }
}

