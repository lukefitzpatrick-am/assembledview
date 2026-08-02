import { NextResponse } from "next/server"
import { isPublisherIdUnique } from "@/lib/data/writePublishers"

/**
 * Uniqueness check for publisher business key `publisherid`.
 * PG-backed (X4) — ZERO in-repo fetch; kept for external/admin bookmarks.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Publisher ID is required" }, { status: 400 })
  }

  try {
    const isUnique = await isPublisherIdUnique(id)
    return NextResponse.json({ isUnique })
  } catch (error) {
    console.error("Failed to check publisher ID uniqueness:", error)
    return NextResponse.json({ error: "Failed to check publisher ID uniqueness" }, { status: 500 })
  }
}
