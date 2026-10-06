import { NextRequest, NextResponse } from "next/server"

import {
  buildInvoicedVsExpectedWorkbook,
  invoicedVsExpectedFilename,
} from "@/lib/finance/exportInvoicedVsExpected"
import { loadInvoicedVsExpected } from "@/lib/finance/loadInvoicedVsExpected"
import type { FyChoice, TypeChoice, ViewChoice } from "@/lib/finance/invoicedVsExpected"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const FY = new Set<FyChoice>(["fy26", "fy27", "all"])
const TYPES = new Set<TypeChoice>(["all", "media", "sow", "retainer"])
const VIEWS = new Set<ViewChoice>(["differences", "all", "unmatched_invoices", "unmatched_months"])

function choice<T extends string>(value: string | null, allowed: Set<T>, fallback: T): T {
  if (value && allowed.has(value as T)) return value as T
  return fallback
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const sp = request.nextUrl.searchParams
  const fy = choice(sp.get("fy"), FY, "fy26")
  const type = choice(sp.get("type"), TYPES, "all")
  const view = choice(sp.get("view"), VIEWS, "differences")
  const clientRaw = sp.get("client")
  const clientId =
    clientRaw && /^\d+$/.test(clientRaw) ? Number(clientRaw) : null

  try {
    const report = await loadInvoicedVsExpected({ fy, type, view, clientId })
    if (sp.get("format") === "xlsx") {
      const buffer = await buildInvoicedVsExpectedWorkbook(report.rows)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${invoicedVsExpectedFilename(fy)}"`,
        },
      })
    }
    return NextResponse.json(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the report."
    return NextResponse.json({ error: "report_failed", message }, { status: 500 })
  }
}
