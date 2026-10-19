import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { loadAdminWebReportList } from "@/lib/webReport/admin/load"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const body = await loadAdminWebReportList()
  return NextResponse.json(body)
}
