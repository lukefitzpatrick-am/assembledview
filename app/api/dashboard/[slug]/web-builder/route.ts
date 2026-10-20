import { NextRequest, NextResponse } from "next/server"

import { builderGate } from "@/lib/webReport/builder/access"
import { BUILDER_NEEDS_MIGRATION, savedForMessage } from "@/lib/webReport/builder/layout"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"
import { WebAccountLinkError, linkWebAccount, listWebAccountOptions } from "@/lib/webReport/builder/accounts"
import {
  BuilderMigrationError,
  listKeyEventNames,
  loadBuilderPreview,
  migration0098Applied,
  resolveBuilderClient,
  restorePublishedVersion,
  savePublishedReport,
} from "@/lib/webReport/builder/repo"
import { auth0 } from "@/lib/auth0"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ slug: string }> }

function actorEmail(session: { user?: { email?: string | null } } | null | undefined): string | null {
  const email = session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim() : null
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth0.getSession(req)
  const gate = builderGate(session?.user)
  if (gate === "login") {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }
  if (gate === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return auth.response

  const { slug } = await context.params
  const client = await resolveBuilderClient(slug)
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = parseBuilderRequest(payload)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  if (parsed.action !== "preview" && !(await migration0098Applied())) {
    return NextResponse.json({ error: BUILDER_NEEDS_MIGRATION }, { status: 409 })
  }

  try {
    if (parsed.action === "preview") {
      const preview = await loadBuilderPreview({
        slug,
        clientId: client.clientId,
        period: parsed.body.defaultPeriod,
        brandTerms: parsed.body.brandTerms,
      })
      if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 })
      return NextResponse.json({
        clientName: preview.clientName,
        connected: preview.connected,
        period: parsed.body.defaultPeriod,
        layout: parsed.body.layout,
        data: preview.data,
      })
    }

    const savedBy = actorEmail(auth.session)
    if (parsed.action === "accounts") {
      return NextResponse.json({ accounts: await listWebAccountOptions(client.clientId) })
    }
    if (parsed.action === "link") {
      const linked = await linkWebAccount({
        clientId: client.clientId,
        platform: parsed.body.platform,
        ref: parsed.body.ref,
        label: parsed.body.label,
        actor: savedBy,
      })
      return NextResponse.json({
        platform: parsed.body.platform,
        ref: linked.ref,
        keyEventNames: parsed.body.platform === "ga4" ? await listKeyEventNames(linked.ref) : undefined,
      })
    }
    if (parsed.action === "restore") {
      const restored = await restorePublishedVersion({
        clientId: client.clientId,
        version: parsed.body.version,
        savedBy,
      })
      if (!restored) return NextResponse.json({ error: "Version not found" }, { status: 404 })
      return NextResponse.json({
        version: restored.version,
        layout: restored.layout,
        message: savedForMessage(client.clientName, restored.version),
      })
    }

    const saved = await savePublishedReport({
      clientId: client.clientId,
      layout: parsed.body.layout,
      brandTerms: parsed.body.brandTerms,
      defaultPeriod: parsed.body.defaultPeriod,
      savedBy,
    })
    return NextResponse.json({
      version: saved.version,
      message: savedForMessage(client.clientName, saved.version),
    })
  } catch (err) {
    if (err instanceof WebAccountLinkError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof BuilderMigrationError) {
      return NextResponse.json({ error: BUILDER_NEEDS_MIGRATION }, { status: 409 })
    }
    console.error("[web-builder]", err)
    return NextResponse.json({ error: "The report could not be saved" }, { status: 500 })
  }
}
