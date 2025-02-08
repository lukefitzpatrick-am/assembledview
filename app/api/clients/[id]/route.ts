import { NextResponse } from "next/server"
import axios from "axios"

const XANO_CLIENTS_BASE_URL = "https://api.xano.com/p/YOUR_PROJECT_ID" // Replace YOUR_PROJECT_ID with your actual Xano project ID

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await req.json()
    const response = await axios.put(`${XANO_CLIENTS_BASE_URL}/edit_clients/${id}`, body)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to update client:", error)
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

