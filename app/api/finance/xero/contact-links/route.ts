import { NextRequest, NextResponse } from "next/server"

import { requireFinanceAdmin } from "@/lib/requireRole"
import { MANUAL_LINK_LEARNED_FROM, upsertXeroContactLink } from "@/lib/xero/contactLinks"
import {
  findClientForContactLink,
  loadUnlinkedXeroContacts,
} from "@/lib/xero/unlinkedContacts"

export const maxDuration = 60

function parseLinkBody(body: unknown): { xeroContactId: string; clientId: number } | null {
  if (!body || typeof body !== "object") return null
  const raw = body as { xeroContactId?: unknown; clientId?: unknown }
  const xeroContactId = typeof raw.xeroContactId === "string" ? raw.xeroContactId.trim() : ""
  const clientId = typeof raw.clientId === "number" ? raw.clientId : Number.NaN
  if (!xeroContactId || !Number.isInteger(clientId) || clientId <= 0) return null
  return { xeroContactId, clientId }
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const parsed = parseLinkBody(body)
  if (!parsed) {
    return NextResponse.json(
      { error: "invalid_body", message: "xeroContactId and clientId are required." },
      { status: 400 },
    )
  }

  const clientExists = await findClientForContactLink(parsed.clientId)
  if (!clientExists) {
    return NextResponse.json(
      { error: "not_found", message: "Client not found." },
      { status: 404 },
    )
  }

  await upsertXeroContactLink({
    xeroContactKey: parsed.xeroContactId,
    clientId: parsed.clientId,
    learnedFrom: MANUAL_LINK_LEARNED_FROM,
  })

  const { coverage } = await loadUnlinkedXeroContacts()
  return NextResponse.json({ coverage })
}
