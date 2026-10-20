import { NextRequest, NextResponse } from "next/server"

import { fetchClientById } from "@/lib/clients/fetchClientById"
import {
  ConversionSettingsNotReadyError,
  readClientConversionConfig,
  saveClientConversionConfig,
} from "@/lib/clients/conversionSettingsRepo"
import { parseConversionSettingsBody } from "@/lib/delivery/conversions/parseSettingsBody"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function failure(err: unknown) {
  if (
    err instanceof ConversionSettingsNotReadyError ||
    (err as { code?: string })?.code === "CONVERSION_SETTINGS_NOT_READY"
  ) {
    return NextResponse.json({ error: "Conversion settings are not set up yet" }, { status: 503 })
  }
  console.error("[conversion-settings]", err)
  return NextResponse.json({ error: "Failed to load conversion settings" }, { status: 500 })
}

async function clientIdFromParams(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params
  const clientId = Number(id)
  if (!Number.isInteger(clientId) || clientId <= 0) return null
  return clientId
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return auth.response

  const clientId = await clientIdFromParams(params)
  if (clientId == null) return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  const client = await fetchClientById(clientId)
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  try {
    const config = await readClientConversionConfig(clientId)
    return NextResponse.json(config)
  } catch (err) {
    return failure(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return auth.response

  const clientId = await clientIdFromParams(params)
  if (clientId == null) return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  const client = await fetchClientById(clientId)
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const parsed = parseConversionSettingsBody(await req.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.problems[0], problems: parsed.problems }, { status: 400 })
  }
  const updatedBy = typeof auth.session?.user?.email === "string" ? auth.session.user.email : null

  try {
    const config = await saveClientConversionConfig({
      clientId,
      settings: parsed.settings,
      events: parsed.events,
      updatedBy,
    })
    return NextResponse.json(config)
  } catch (err) {
    return failure(err)
  }
}
