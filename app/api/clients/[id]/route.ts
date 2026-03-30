import { NextResponse } from "next/server"
import axios from "axios"
import { invalidateClientsCache } from "@/lib/cache/clientsCache"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"

const clientsUrl = getXanoClientsCollectionUrl()

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const response = await axios.put(`${clientsUrl}/${id}`, body)
    invalidateClientsCache()
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
    invalidateClientsCache()
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

