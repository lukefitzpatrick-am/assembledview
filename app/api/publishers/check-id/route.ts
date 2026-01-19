import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Publisher ID is required" }, { status: 400 })
  }

  try {
    // Use the correct endpoint for fetching publishers
    const response = await axios.get(xanoUrl("publishers", "XANO_PUBLISHERS_BASE_URL"), {
      params: { publisherid: id },
    })

    const publishers = response.data
    const isUnique = publishers.length === 0
    return NextResponse.json({ isUnique })
  } catch (error) {
    console.error("Failed to check publisher ID uniqueness:", error)
    return NextResponse.json({ error: "Failed to check publisher ID uniqueness" }, { status: 500 })
  }
}

