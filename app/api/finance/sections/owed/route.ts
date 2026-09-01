import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import { fetchOwedLedger, normalizeOwedQuery } from "@/lib/finance/sections/owedQuery"
import { isOwedBucket } from "@/lib/finance/sections/owedLedger"

export const maxDuration = 60

function parseClientIds(raw: string | null): number[] {
  if (!raw?.trim()) return []
  const out: number[] = []
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return [...new Set(out)]
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const sp = request.nextUrl.searchParams
    const fyRaw = sp.get("fy")
    let fy: number | undefined
    if (fyRaw != null && fyRaw.trim() !== "") {
      const parsed = Number.parseInt(fyRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
        return NextResponse.json(
          { error: "Invalid fy", message: "fy must be a financial year start year (e.g. 2025)." },
          { status: 400 }
        )
      }
      fy = parsed
    }

    const bucketRaw = sp.get("bucket")?.trim() ?? ""
    if (bucketRaw && !isOwedBucket(bucketRaw)) {
      return NextResponse.json(
        {
          error: "Invalid bucket",
          message: "bucket must be one of not_yet_due, d1_14, d15_30, d31_60, d60_plus.",
        },
        { status: 400 }
      )
    }

    const query = normalizeOwedQuery({
      fy,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      clients: parseClientIds(sp.get("clients")),
      bucket: bucketRaw || null,
      search: sp.get("search"),
    })

    const payload = await fetchOwedLedger(query)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("[finance/sections/owed]", error)
    return NextResponse.json(
      { error: "Failed to load owed ledger" },
      { status: 500 }
    )
  }
}
