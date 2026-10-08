import { NextRequest, NextResponse } from "next/server"

import { requireFinanceAdmin } from "@/lib/requireRole"
import { loadUnlinkedXeroContacts } from "@/lib/xero/unlinkedContacts"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const payload = await loadUnlinkedXeroContacts()
  return NextResponse.json(payload)
}
