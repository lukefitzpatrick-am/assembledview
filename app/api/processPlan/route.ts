import { NextRequest, NextResponse } from "next/server"
import { processPlanFiles } from "@/lib/planParser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fileEntries: File[] = []

    // Accept either a single "file" field or multiple "files" entries
    const possibleKeys = ["file", "files"]
    for (const key of possibleKeys) {
      const entries = formData.getAll(key)
      for (const entry of entries) {
        if (entry instanceof File) fileEntries.push(entry)
      }
    }

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 })
    }

    const buffers = await Promise.all(
      fileEntries.map(async (file) => ({
        fileName: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    )

    const result = await processPlanFiles(buffers)
    return NextResponse.json(result)
  } catch (error) {
    console.error("processPlan API error", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

























