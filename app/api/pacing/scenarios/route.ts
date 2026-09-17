import { NextRequest, NextResponse } from "next/server"

import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import {
  buildCampaignDetail,
  CampaignDetailError,
} from "@/lib/pacing/detail/buildCampaignDetail"
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs"
import {
  insertSavedScenario,
  listSavedScenarios,
  SavedScenarioError,
} from "@/lib/pacing/scenario/savedScenarioRepo"
import type { ScenarioLevers, ScenarioResult } from "@/lib/pacing/scenario/types"

export const dynamic = "force-dynamic"

function actorEmail(session: { user?: { email?: string | null } }): string | null {
  const email = session.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

async function assertMbaAccess(
  mbaNumber: string,
  allowedClientSlugs: Set<string> | null,
) {
  await buildCampaignDetail({
    mbaNumber,
    allowedClientSlugs,
  })
}

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const mba = request.nextUrl.searchParams.get("mba")?.trim() ?? ""
  if (!mba) {
    return NextResponse.json({ error: "mba is required" }, { status: 400 })
  }

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))

  try {
    await assertMbaAccess(mba, allowedClientSlugs)
    const scenarios = await listSavedScenarios(mba)
    return NextResponse.json({ scenarios })
  } catch (err) {
    if (err instanceof CampaignDetailError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof SavedScenarioError && err.code === "UNAVAILABLE") {
      return NextResponse.json({ error: "unavailable", message: err.message }, { status: 503 })
    }
    console.error("[api/pacing/scenarios] GET failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const email = actorEmail(gate.session)
  if (!email) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  const json = (await request.json().catch(() => null)) as {
    mbaNumber?: unknown
    versionNumber?: unknown
    name?: unknown
    levers?: unknown
    result?: unknown
  } | null

  const mbaNumber = typeof json?.mbaNumber === "string" ? json.mbaNumber.trim() : ""
  const name = typeof json?.name === "string" ? json.name.trim() : ""
  const versionNumber = Number(json?.versionNumber)
  if (!mbaNumber || !name || !Number.isFinite(versionNumber)) {
    return NextResponse.json(
      { error: "mbaNumber, versionNumber and name are required" },
      { status: 400 },
    )
  }

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))

  try {
    await assertMbaAccess(mbaNumber, allowedClientSlugs)
    const scenario = await insertSavedScenario({
      mbaNumber,
      versionNumber,
      name,
      levers: json?.levers as ScenarioLevers,
      result: json?.result as ScenarioResult,
      createdByEmail: email,
    })
    return NextResponse.json({ scenario }, { status: 201 })
  } catch (err) {
    if (err instanceof CampaignDetailError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof SavedScenarioError) {
      const status = err.code === "VALIDATION" ? 400 : 503
      return NextResponse.json({ error: err.code.toLowerCase(), message: err.message }, { status })
    }
    console.error("[api/pacing/scenarios] POST failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
