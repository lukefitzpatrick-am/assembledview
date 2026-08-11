/**
 * Live tenant-isolation probe (STEP 1).
 *
 * Harness: invoke route handlers against live DATA_BACKEND=postgres with
 * mocked Auth0 sessions (codex route-test pattern). No browser cookies.
 *
 * Usage:
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/ps1-tenant-isolation-probe.mjs
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { NextRequest } from "next/server"

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const key = m[1].trim()
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal()

const CHANNEL_ROUTES = [
  "cinema",
  "digi-bvod",
  "influencers",
  "integration",
  "newspaper",
  "prog-display",
  "prog-ooh",
  "prog-video",
  "production",
  "search",
  "social",
  "television",
]

function fileUrl(rel) {
  return pathToFileURL(resolve(rel)).href
}

function summarizePlans(rows) {
  if (!Array.isArray(rows)) {
    return { count: 0, distinctClients: 0, sampleClients: [], mbas: [], errorBody: rows }
  }
  const clients = new Map()
  for (const p of rows) {
    const name = p.mp_client_name || p.client_name || "(unknown)"
    const mba = p.mba_number || p.mp_mba_number || ""
    if (!clients.has(name)) clients.set(name, [])
    if (mba) clients.get(name).push(mba)
  }
  return {
    count: rows.length,
    distinctClients: clients.size,
    sampleClients: [...clients.entries()]
      .slice(0, 8)
      .map(([name, mbas]) => `${name}: ${mbas.slice(0, 3).join(",")}`),
    mbas: rows.map((p) => p.mba_number || p.mp_mba_number).filter(Boolean),
  }
}

function pickTwoTenants(rows) {
  const byClient = new Map()
  for (const p of rows) {
    const name = String(p.mp_client_name || "").trim() || "(unknown)"
    const mba = String(p.mba_number || "").trim()
    if (!mba) continue
    if (!byClient.has(name)) byClient.set(name, mba)
  }
  const entries = [...byClient.entries()]
  if (entries.length < 2) return null
  return {
    own: { client: entries[0][0], mba: entries[0][1] },
    foreign: { client: entries[1][0], mba: entries[1][1] },
  }
}

async function main() {
  console.log("\n=== Tenant isolation live probe ===\n")
  console.log("Harness: handler invoke + mocked Auth0 client session")
  console.log(`DATA_BACKEND=${process.env.DATA_BACKEND || "(unset)"}`)
  console.log(`DATA_BACKEND_PLANS=${process.env.DATA_BACKEND_PLANS || "(unset)"}\n`)

  // Patch auth0 before importing gated routes.
  const auth0Mod = await import(fileUrl("lib/auth0.ts"))
  const originalGetSession = auth0Mod.auth0.getSession.bind(auth0Mod.auth0)

  // Bootstrap tenants via admin session (full book).
  auth0Mod.auth0.getSession = async () => ({
    user: {
      email: "probe-admin@example.com",
      app_metadata: { role: "admin" },
    },
  })

  const mediaPlansMod = await import(fileUrl("app/api/media_plans/route.ts"))
  const adminListRes = await mediaPlansMod.GET(
    new NextRequest("http://localhost/api/media_plans")
  )
  const adminListJson = await adminListRes.json()
  const adminSummary = summarizePlans(adminListJson)
  console.log("── bootstrap admin GET /api/media_plans ──")
  console.log(`   status: ${adminListRes.status} rowCount=${adminSummary.count} clients=${adminSummary.distinctClients}`)

  const tenants = Array.isArray(adminListJson) ? pickTwoTenants(adminListJson) : null
  if (!tenants) {
    console.error("\nCannot pick two tenants from list — aborting.")
    process.exit(2)
  }
  console.log(
    `\n   Probe tenants:\n     own=${tenants.own.mba} (${tenants.own.client})\n     foreign=${tenants.foreign.mba} (${tenants.foreign.client})`
  )

  // ── 1. GET /api/media_plans as client ──────────────────────────────────
  auth0Mod.auth0.getSession = async () => ({
    user: {
      email: "probe-client@example.com",
      app_metadata: {
        role: "client",
        mba_numbers: [tenants.own.mba],
        client_slug: "probe-own",
      },
    },
  })
  const listRes = await mediaPlansMod.GET(
    new NextRequest("http://localhost/api/media_plans")
  )
  const listStatus = listRes.status
  const listJson = await listRes.json()
  const listSummary = summarizePlans(listJson)

  console.log("\n── 1. GET /api/media_plans (client session) ──")
  console.log(`   status: ${listStatus}`)
  console.log(`   rowCount: ${listSummary.count}`)
  console.log(`   distinctClients: ${listSummary.distinctClients}`)
  console.log(`   sample: ${listSummary.sampleClients.join(" | ")}`)

  const foreignInClientList = listSummary.mbas.some(
    (m) => m.toLowerCase() === tenants.foreign.mba.toLowerCase()
  )
  const exposure1 =
    listStatus === 200 &&
    (listSummary.distinctClients > 1 || foreignInClientList)
  console.log(
    `   VERDICT: ${
      exposure1
        ? "EXPOSED — client still sees foreign tenants"
        : listStatus === 200 && !foreignInClientList
          ? "NOT EXPOSED — client scoped to own book"
          : `status ${listStatus}`
    }`
  )

  // ── 2. Channel GET enumeration + foreign MBA probe ─────────────────────
  console.log("\n── Channel GET enumeration (dedicated routes, all via createChannelLineItemsGetHandler) ──")
  for (const ch of CHANNEL_ROUTES) {
    console.log(`   /api/media_plans/${ch}`)
  }
  console.log("   Note: catch-all /api/media_plans/[...path] is requireRole(admin) — out of this defect class")

  const probeChannel = "social"
  const socialMod = await import(fileUrl(`app/api/media_plans/${probeChannel}/route.ts`))
  const channelUrl = `http://localhost/api/media_plans/${probeChannel}?mba_number=${encodeURIComponent(tenants.foreign.mba)}`
  const channelRes = await socialMod.GET(new Request(channelUrl))
  const channelStatus = channelRes.status
  let channelBody
  try {
    channelBody = await channelRes.json()
  } catch {
    channelBody = null
  }
  const channelCount = Array.isArray(channelBody) ? channelBody.length : null
  const channelErr =
    channelBody && typeof channelBody === "object" && !Array.isArray(channelBody)
      ? channelBody.error
      : null

  console.log(
    `\n── 2. GET /api/media_plans/${probeChannel}?mba_number=${tenants.foreign.mba} ──`
  )
  console.log(`   status: ${channelStatus}`)
  console.log(
    `   body: ${
      channelCount != null
        ? `array length=${channelCount}`
        : channelErr
          ? `error=${JSON.stringify(channelErr)}`
          : typeof channelBody
    }`
  )
  if (channelCount != null && channelCount > 0) {
    const sample = channelBody[0]
    console.log(`   firstRowKeys: ${Object.keys(sample || {}).slice(0, 14).join(", ")}`)
    const hint =
      sample?.mba_number ||
      sample?.line_item_id ||
      sample?.lineItemId ||
      sample?.mp_line_item_id ||
      "(no id field)"
    console.log(`   firstRowHint: ${String(hint).slice(0, 100)}`)
  }

  console.log(
    `   VERDICT: ${
      channelStatus === 403
        ? "NOT EXPOSED — 403 (scoped)"
        : `EXPOSED — foreign MBA read returned ${channelStatus} without checkClientMbaAccess`
    }`
  )

  // Own-MBA control (same route) — proves caller's tenant still readable
  const ownUrl = `http://localhost/api/media_plans/${probeChannel}?mba_number=${encodeURIComponent(tenants.own.mba)}`
  const ownRes = await socialMod.GET(new Request(ownUrl))
  let ownBody
  try {
    ownBody = await ownRes.json()
  } catch {
    ownBody = null
  }
  console.log(
    `   control own MBA ${tenants.own.mba}: status=${ownRes.status} length=${Array.isArray(ownBody) ? ownBody.length : "?"}`
  )

  // ── 3. POST /api/pacing/search ─────────────────────────────────────────
  // Client session already installed above.

  let foreignLineItemId = `${tenants.foreign.mba}SE1`
  try {
    const searchChannelMod = await import(fileUrl("app/api/media_plans/search/route.ts"))
    const searchChRes = await searchChannelMod.GET(
      new Request(
        `http://localhost/api/media_plans/search?mba_number=${encodeURIComponent(tenants.foreign.mba)}`
      )
    )
    if (searchChRes.status === 200) {
      const searchItems = await searchChRes.json()
      if (Array.isArray(searchItems) && searchItems.length > 0) {
        const id =
          searchItems[0]?.line_item_id ||
          searchItems[0]?.lineItemId ||
          searchItems[0]?.mp_line_item_id
        if (typeof id === "string" && id.trim()) foreignLineItemId = id.trim()
        console.log(
          `\n   foreign search line items: ${searchItems.length}; using id=${foreignLineItemId}`
        )
      } else {
        console.log(
          `\n   foreign search channel empty; using synthetic id=${foreignLineItemId}`
        )
      }
    }
  } catch (err) {
    console.log(`   (search channel hydrate skipped: ${err?.message || err})`)
  }

  const pacingMod = await import(fileUrl("app/api/pacing/search/route.ts"))
  const pacingReq = new NextRequest("http://localhost/api/pacing/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineItemIds: [foreignLineItemId] }),
  })
  const pacingRes = await pacingMod.POST(pacingReq)
  const pacingStatus = pacingRes.status
  let pacingBody
  try {
    pacingBody = await pacingRes.json()
  } catch {
    pacingBody = null
  }

  console.log(
    `\n── 3. POST /api/pacing/search (client session scoped to ${tenants.own.mba}) ──`
  )
  console.log(`   mock role: client; mba_numbers=[${tenants.own.mba}]`)
  console.log(`   requested foreign lineItemIds: [${foreignLineItemId}]`)
  console.log(`   status: ${pacingStatus}`)
  if (pacingBody?.error) {
    console.log(`   error: ${pacingBody.error}`)
  } else if (pacingBody) {
    console.log(
      `   daily.length=${Array.isArray(pacingBody.daily) ? pacingBody.daily.length : "?"}`
    )
    console.log(
      `   lineItems.length=${Array.isArray(pacingBody.lineItems) ? pacingBody.lineItems.length : "?"}`
    )
    if (pacingBody.totals) {
      console.log(`   totals.cost=${pacingBody.totals.cost}`)
    }
  }

  console.log(
    `   VERDICT: ${
      pacingStatus === 403
        ? "NOT EXPOSED — 403"
        : pacingStatus === 401
          ? "auth mock failed (401) — inconclusive"
          : `EXPOSED — client session accepted foreign lineItemIds (status ${pacingStatus}; session-only gate)`
    }`
  )

  // Restore
  auth0Mod.auth0.getSession = originalGetSession

  console.log("\n=== Summary ===")
  console.log(`1. GET /api/media_plans:              ${exposure1 ? "EXPOSED" : "OK/INCONCLUSIVE"}`)
  console.log(
    `2. GET /api/media_plans/${probeChannel}:    ${channelStatus === 403 ? "OK" : "EXPOSED"}`
  )
  console.log(
    `3. POST /api/pacing/search:             ${
      pacingStatus === 403 ? "OK" : pacingStatus === 401 ? "INCONCLUSIVE" : "EXPOSED"
    }`
  )
  console.log("")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
