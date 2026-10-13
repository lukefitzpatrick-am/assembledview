import { NextRequest, NextResponse } from "next/server"

import { fetchClientById } from "@/lib/clients/fetchClientById"
import {
  isPlatformAccountPlatform,
  normaliseAccountRef,
} from "@/lib/clients/platformAccounts"
import {
  insertPlatformAccount,
  listActivePlatformAccounts,
  patchPlatformAccount,
  PlatformAccountConflictError,
  PlatformAccountsNotReadyError,
} from "@/lib/clients/platformAccountsRepo"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function notReady() {
  return NextResponse.json({ error: "Platform accounts are not set up yet" }, { status: 503 })
}

function failure(err: unknown) {
  if (err instanceof PlatformAccountsNotReadyError || (err as { code?: string })?.code === "PLATFORM_ACCOUNTS_NOT_READY") {
    return notReady()
  }
  if (err instanceof PlatformAccountConflictError || (err as { code?: string })?.code === "PLATFORM_ACCOUNT_CONFLICT") {
    const name = err instanceof PlatformAccountConflictError
      ? err.clientName
      : String((err as { clientName?: string }).clientName ?? "another client")
    return NextResponse.json({ error: `Already linked to ${name}` }, { status: 409 })
  }
  console.error("[platform-accounts]", err)
  return NextResponse.json({ error: "Failed to update platform accounts" }, { status: 500 })
}

async function gate(req: NextRequest) {
  return requireRole(req, ["admin"])
}

async function clientIdFromParams(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params
  const clientId = Number(id)
  if (!Number.isInteger(clientId) || clientId <= 0) return null
  return clientId
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req)
  if ("response" in auth) return auth.response

  const clientId = await clientIdFromParams(params)
  if (clientId == null) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  }
  const client = await fetchClientById(clientId)
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  try {
    const accounts = await listActivePlatformAccounts(clientId)
    return NextResponse.json({ accounts })
  } catch (err) {
    return failure(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req)
  if ("response" in auth) return auth.response

  const clientId = await clientIdFromParams(params)
  if (clientId == null) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  }
  const client = await fetchClientById(clientId)
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as {
    platform?: unknown
    accountRef?: unknown
    label?: unknown
  } | null
  const platform = typeof body?.platform === "string" ? body.platform : ""
  if (!isPlatformAccountPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 })
  }
  let accountRef: string
  try {
    accountRef = normaliseAccountRef(platform, typeof body?.accountRef === "string" ? body.accountRef : "")
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account ref is empty"
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : null
  const createdBy = typeof auth.session?.user?.email === "string" ? auth.session.user.email : null

  try {
    const account = await insertPlatformAccount({ clientId, platform, accountRef, label, createdBy })
    return NextResponse.json({ account }, { status: 201 })
  } catch (err) {
    return failure(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req)
  if ("response" in auth) return auth.response

  const clientId = await clientIdFromParams(params)
  if (clientId == null) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  }
  const client = await fetchClientById(clientId)
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as {
    id?: unknown
    active?: unknown
    label?: unknown
  } | null
  const id = typeof body?.id === "number" ? body.id : Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 })
  }
  const deactivate = body?.active === false
  const labelText = typeof body?.label === "string" ? body.label.trim() : undefined
  if (!deactivate && labelText === undefined) {
    return NextResponse.json({ error: "Send active false or a label" }, { status: 400 })
  }
  if (body?.active != null && body.active !== false) {
    return NextResponse.json({ error: "Only deactivation is supported" }, { status: 400 })
  }

  try {
    const account = await patchPlatformAccount({
      clientId,
      id,
      ...(deactivate ? { active: false as const } : {}),
      ...(labelText !== undefined ? { label: labelText || null } : {}),
    })
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }
    return NextResponse.json({ account })
  } catch (err) {
    return failure(err)
  }
}
