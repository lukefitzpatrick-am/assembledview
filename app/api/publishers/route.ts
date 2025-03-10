import { NextResponse } from "next/server"
import axios from "axios"

const XANO_PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"

export async function GET() {
  try {
    const response = await axios.get(`${XANO_PUBLISHERS_BASE_URL}/get_publishers`)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch publishers:", error)
    return NextResponse.json({ error: "Failed to fetch publishers" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const response = await axios.post(`${XANO_PUBLISHERS_BASE_URL}/post_publishers`, body)
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create publisher:", error)
    return NextResponse.json({ error: "Failed to create publisher" }, { status: 500 })
  }
}

