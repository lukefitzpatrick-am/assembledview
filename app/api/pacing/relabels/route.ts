import { NextRequest } from "next/server"

import { requireRelabelAccess } from "@/lib/pacing/relabel/auth"
import { runRelabelList } from "@/lib/pacing/relabel/handlers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const gate = await requireRelabelAccess(request)
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  return runRelabelList({
    mba: params.get("mba") ?? undefined,
    status: params.get("status") ?? undefined,
    actor: params.get("actor") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  })
}
