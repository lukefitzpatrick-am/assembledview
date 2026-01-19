import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await req.json()
    const response = await axios.put(`${xanoUrl("edit_publishers", "XANO_PUBLISHERS_BASE_URL")}/${id}`, body)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to update publisher:", error)
    return NextResponse.json({ error: "Failed to update publisher" }, { status: 500 })
  }
}

