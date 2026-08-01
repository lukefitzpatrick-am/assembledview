import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"

import { requireRole } from "@/lib/requireRole"
import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import { getPeriodPg } from "@/lib/finance/periods/postgresStore"
import { financeSheetFilename } from "@/lib/finance/periods/naturalKeys"

export const dynamic = "force-dynamic"

/** Admin download of archived period workbook (private Blob pathname). */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  if (!isFinancePeriodsEnabled()) {
    return NextResponse.json({ error: "FINANCE_PERIODS off" }, { status: 409 })
  }

  const periodMonth = new URL(request.url).searchParams.get("periodMonth")
  if (!periodMonth) {
    return NextResponse.json({ error: "periodMonth required" }, { status: 400 })
  }

  const period = await getPeriodPg(periodMonth)
  if (!period?.sheetBlobPathname) {
    return NextResponse.json({ error: "No workbook archived for this period" }, { status: 404 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "Blob token not configured", pathname: period.sheetBlobPathname },
      { status: 503 }
    )
  }

  try {
    const result = await get(period.sheetBlobPathname, { access: "private", token })
    if (!result?.stream) {
      return NextResponse.json({ error: "Workbook not found in blob store" }, { status: 404 })
    }
    const filename = financeSheetFilename(period.periodMonth, period.sheetVersion)
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    )
  }
}
