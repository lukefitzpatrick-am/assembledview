import { NextResponse } from "next/server"
import axios from "axios"

const XANO_CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "YOUR_DEFAULT_BASE_URL" //Added default value

export async function GET() {
  try {
    const response = await axios.get(`${XANO_CLIENTS_BASE_URL}/get_clients`)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch clients:", error)
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log("Request body:", JSON.stringify(body, null, 2))
    const response = await axios.post(`${XANO_CLIENTS_BASE_URL}/post_clients`, body)
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create client:", error)
    if (axios.isAxiosError(error) && error.response) {
      console.error("Error response data:", error.response.data)
      return NextResponse.json(
        { error: "Failed to create client", details: error.response.data },
        { status: error.response.status },
      )
    }
    return NextResponse.json(
      { error: "Failed to create client", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

