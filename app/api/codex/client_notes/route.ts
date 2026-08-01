import { NextResponse } from "next/server"
import { listClientNotes } from "@/lib/codex/repo"
import { codexFlagGuard, requireCodexInternalAccess } from "../_shared"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const clientIdRaw = url.searchParams.get("client_id")
    const clientId =
      clientIdRaw != null && clientIdRaw !== ""
        ? Number(clientIdRaw)
        : undefined

    const data = await listClientNotes({
      clientId:
        clientId != null && Number.isFinite(clientId) ? clientId : undefined,
      mbaNumber: url.searchParams.get("mba_number") || undefined,
      meetingBefore: url.searchParams.get("meeting_before") || undefined,
      meetingAfter: url.searchParams.get("meeting_after") || undefined,
      page: Number(url.searchParams.get("page") || 1),
      perPage: Number(url.searchParams.get("per_page") || 50),
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch codex client notes:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch client notes",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
