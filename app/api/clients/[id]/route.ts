import { NextResponse } from "next/server"
import axios from "axios"

const DEFAULT_CLIENTS_BASE_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const clientsBaseUrl = (process.env.XANO_CLIENTS_BASE_URL || process.env.XANO_BASE_URL || DEFAULT_CLIENTS_BASE_URL).replace(/\/$/, "")
const clientsUrl = `${clientsBaseUrl}/clients`

if (!process.env.XANO_CLIENTS_BASE_URL && !process.env.XANO_BASE_URL) {
  console.warn("XANO_CLIENTS_BASE_URL is not set; falling back to default clients base URL")
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const response = await axios.put(`${clientsUrl}/${id}`, body)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to update client:", error)
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const response = await axios.patch(`${clientsUrl}/${id}`, body)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to patch client:", error)
    return NextResponse.json({ error: "Failed to patch client" }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const response = await axios.get(`${clientsUrl}/${id}`)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch client:", error)
    return NextResponse.json(
      { error: "Failed to fetch client" },
      { status: 500 }
    )
  }
}

