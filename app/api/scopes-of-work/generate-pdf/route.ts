import { NextRequest, NextResponse } from "next/server"
import { generateScopeOfWork } from "@/lib/generateScopeOfWork"
import { requireRole } from "@/lib/requireRole"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

const SMART_DOUBLE_QUOTES = new Set(["\u201C", "\u201D", "\u201E", "\u201F", "\u2033", "\u2036"])
const SMART_SINGLE_QUOTES = new Set(["\u2018", "\u2019", "\u201A", "\u201B", "\u2032", "\u2035"])

function isAsciiPrintable(code: number): boolean {
  return code >= 0x20 && code <= 0x7e
}

function isSafeFilenameChar(code: number, char: string): boolean {
  if (code >= 0x41 && code <= 0x5a) return true
  if (code >= 0x61 && code <= 0x7a) return true
  if (code >= 0x30 && code <= 0x39) return true
  return char === "." || char === "_" || char === "-"
}

/** Linear-time filename sanitization (no backtracking regex on user input). */
function sanitizeFilename(name: string): string {
  let mapped = ""
  for (const char of name) {
    if (SMART_DOUBLE_QUOTES.has(char)) {
      mapped += '"'
      continue
    }
    if (SMART_SINGLE_QUOTES.has(char)) {
      mapped += "'"
      continue
    }
    if (char === "\u2013" || char === "\u2014") {
      mapped += "-"
      continue
    }
    if (char === "\u2026") {
      mapped += "..."
      continue
    }
    const code = char.charCodeAt(0)
    if (!isAsciiPrintable(code)) continue
    mapped += isSafeFilenameChar(code, char) ? char : "_"
  }

  let collapsed = ""
  let prevUnderscore = false
  for (const char of mapped) {
    if (char === "_") {
      if (!prevUnderscore) {
        collapsed += "_"
        prevUnderscore = true
      }
      continue
    }
    collapsed += char
    prevUnderscore = false
  }

  let start = 0
  while (start < collapsed.length && collapsed[start] === "_") start += 1
  let end = collapsed.length
  while (end > start && collapsed[end - 1] === "_") end -= 1

  return collapsed.slice(start, end).slice(0, 100)
}

/**
 * PC3 — SOW PDF locked to admin/manager.
 * When `id` is provided, render from the persisted SOW record; otherwise admin
 * create-before-save may still send the form body.
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager"])
  if ("response" in gate) return gate.response

  try {
    const body = await req.json()

    let payload = body
    const sowId = body?.id != null ? Number(body.id) : NaN
    if (Number.isFinite(sowId) && sowId > 0) {
      const res = await fetch(`${xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL")}/${sowId}`, {
        headers: xanoAuthHeaderRecord(),
        cache: "no-store",
      })
      if (!res.ok) {
        return NextResponse.json(
          { error: `Persisted SOW ${sowId} not found`, code: "NOT_FOUND" },
          { status: 404 }
        )
      }
      payload = await res.json()
    }

    if (!payload.project_name || !payload.client_name) {
      return NextResponse.json({ error: "Missing required scope data" }, { status: 400 })
    }

    const pdfBuffer = await generateScopeOfWork(payload)

    const sanitizedClientName = sanitizeFilename(String(payload.client_name))
    const sanitizedProjectName = sanitizeFilename(String(payload.project_name))
    const filename = `Scope_${sanitizedClientName}_${sanitizedProjectName}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error generating Scope PDF:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
    return NextResponse.json(
      { error: "Failed to generate PDF", details: errorMessage },
      { status: 500 }
    )
  }
}
