import { NextRequest, NextResponse } from "next/server"
import { readFinanceEdits } from "@/lib/data/readFinance"
import { insertFinanceEdit } from "@/lib/data/writeFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const recordId = request.nextUrl.searchParams.get("finance_billing_records_id")
    const rows = await readFinanceEdits()
    const filtered = recordId
      ? rows.filter((row) => String(row.finance_billing_records_id) === String(recordId))
      : rows
    return NextResponse.json(filtered)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch finance edits", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const actor = gate.session?.user as { email?: string; name?: string } | undefined
    const payload = await insertFinanceEdit({
      ...body,
      edited_by_name: body.edited_by_name ?? actor?.email ?? actor?.name ?? null,
    })
    return NextResponse.json(payload, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create finance edit", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
