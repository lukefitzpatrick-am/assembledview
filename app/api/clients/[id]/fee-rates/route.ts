import { NextRequest, NextResponse } from "next/server"

import { fetchClientById } from "@/lib/clients/fetchClientById"
import {
  deleteClientFeeRateChange,
  insertClientFeeRateChange,
  listClientFeeRateChanges,
  parseClientFeeRateChangeInput,
} from "@/lib/data/clientFeeRates"
import { isUniqueViolation } from "@/lib/db/pgError"
import { isFeatureOn } from "@/lib/features/server"
import { requireRole } from "@/lib/requireRole"

/**
 * Client fee rate changes with an effective date (S4, client_fee_rates).
 * Admin only, like every client fee write (PUT /api/clients/[id]). 404 while
 * the switch client_fee_rate_history is off. Every call checks the client
 * exists, and DELETE only removes a change of that client.
 */

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** The admin gate, the switch and the client, or the response that refuses. */
async function open(
  req: NextRequest,
  params: Ctx["params"],
): Promise<{ response: Response } | { clientId: number; email: string | null }> {
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return { response: auth.response }
  if (!(await isFeatureOn("client_fee_rate_history"))) {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  }
  const clientId = Number((await params).id)
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { response: NextResponse.json({ error: "Invalid client id" }, { status: 400 }) }
  }
  if (!(await fetchClientById(clientId))) {
    return { response: NextResponse.json({ error: "Client not found" }, { status: 404 }) }
  }
  const email = auth.session?.user?.email
  return { clientId, email: typeof email === "string" ? email : null }
}

async function list(clientId: number) {
  return (await listClientFeeRateChanges([clientId])).get(clientId) ?? []
}

/** After a write that saved: the list, or (re-read failed) say it saved, never a 500. */
async function afterWrite(clientId: number, status: number) {
  try {
    return NextResponse.json({ changes: await list(clientId) }, { status })
  } catch (err) {
    console.error("[client-fee-rates] re-read after write failed", err)
    return NextResponse.json(
      { changes: null, message: "Saved. The list could not be reloaded: reload the page to see it." },
      { status },
    )
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await open(req, params)
  if ("response" in ctx) return ctx.response
  try {
    return NextResponse.json({ changes: await list(ctx.clientId) })
  } catch (err) {
    console.error("[client-fee-rates] list failed", err)
    return NextResponse.json({ error: "Failed to load rate changes" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await open(req, params)
  if ("response" in ctx) return ctx.response
  const parsed = parseClientFeeRateChangeInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    await insertClientFeeRateChange(ctx.clientId, parsed.change, ctx.email)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "This fee already has a change on that date. Delete it first." },
        { status: 409 },
      )
    }
    console.error("[client-fee-rates] insert failed", err)
    return NextResponse.json({ error: "Failed to save the rate change" }, { status: 500 })
  }
  return afterWrite(ctx.clientId, 201)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = await open(req, params)
  if ("response" in ctx) return ctx.response
  const id = Number(new URL(req.url).searchParams.get("changeId"))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid change id" }, { status: 400 })
  }
  try {
    if (!(await deleteClientFeeRateChange(ctx.clientId, id))) {
      return NextResponse.json({ error: "Rate change not found" }, { status: 404 })
    }
  } catch (err) {
    console.error("[client-fee-rates] delete failed", err)
    return NextResponse.json({ error: "Failed to delete the rate change" }, { status: 500 })
  }
  return afterWrite(ctx.clientId, 200)
}
